import { NextRequest, NextResponse } from 'next/server';
import { many, run } from '@/lib/db';
import { sendToUser, pushConfigured } from '@/lib/push';
import { isDueOn } from '@/lib/schedule';
import { localClockHM, todayISO, compareISO, isValidTimeZone } from '@/lib/dates';
import type { Habit, Schedule } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The reminder sender. Called on a schedule (Railway cron) — NOT by a browser.
 *
 * Auth is a bearer CRON_SECRET rather than a session cookie, because a cron has
 * no browser. It is excluded from the middleware's session gate for that reason
 * (see middleware.ts) and so it MUST authenticate here. It fails CLOSED: with
 * CRON_SECRET unset every request is rejected, so a deploy that forgets the
 * variable is inert rather than open.
 *
 * Idempotent by design: `habits.last_notified_date` records the owner-local day
 * a reminder actually went out, and a habit already stamped with today is
 * skipped. Running every 5 minutes, or twice after a redeploy, still sends at
 * most one reminder per habit per day.
 */

interface CandidateRow {
  id: number;
  user_id: number;
  name: string;
  kind: string;
  schedule: string | null;
  start_date: string;
  end_date: string | null;
  notify_at: string;
  last_notified_date: string | null;
  tz: string | null;
}

function parseSchedule(raw: string | null): Schedule {
  if (!raw) return { kind: 'daily' };
  try {
    return JSON.parse(raw) as Schedule;
  } catch {
    return { kind: 'daily' };
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not set.' },
      { status: 503 }
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) return unauthorizedCron();

  if (!pushConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'push not configured' });
  }

  // One pass over every candidate habit. The joins do the cheap filtering:
  // a habit only matters if it has a reminder time, isn't archived, its owner
  // has a stored timezone (the cookie isn't available here), and that owner has
  // at least one registered device.
  const rows = await many<CandidateRow>(
    `SELECT h.id, h.user_id, h.name, h.kind, h.schedule, h.start_date,
            h.end_date, h.notify_at, h.last_notified_date, u.tz
       FROM habits h
       JOIN users u ON u.id = h.user_id
      WHERE h.notify_at IS NOT NULL
        AND h.archived = 0
        AND u.tz IS NOT NULL
        AND EXISTS (
              SELECT 1 FROM push_subscriptions p WHERE p.user_id = h.user_id
            )`,
    []
  );

  let considered = 0;
  let sentCount = 0;
  const perUser = new Map<number, { tz: string; today: string; nowHM: string }>();

  for (const row of rows) {
    considered++;
    const tz = row.tz as string;
    if (!isValidTimeZone(tz)) continue;

    // Each user's local day/clock is computed once, not per habit.
    let clock = perUser.get(row.user_id);
    if (!clock) {
      clock = { tz, today: todayISO(tz), nowHM: localClockHM(tz) };
      perUser.set(row.user_id, clock);
    }

    // Already reminded today.
    if (row.last_notified_date === clock.today) continue;
    // Its time hasn't come yet today. (`<=` also catches up a reminder the cron
    // missed earlier in the day; the day boundary stops it bleeding into
    // tomorrow, since e.g. "08:00" is not <= "00:05".)
    if (row.notify_at > clock.nowHM) continue;

    const habit: Habit = {
      id: row.id,
      name: row.name,
      details: '',
      exceptions: '',
      kind: row.kind as Habit['kind'],
      schedule: parseSchedule(row.schedule),
      start_date: row.start_date,
      end_date: row.end_date,
      sort_order: 0,
      archived: 0,
      created_at: '',
    };

    // Past its end date → no longer tracked.
    if (habit.end_date !== null && compareISO(clock.today, habit.end_date) > 0) {
      continue;
    }

    // Not scheduled today. A rolling monthly habit needs its history to answer
    // this — and a month you EXCUSED closes the cycle just as a month you did,
    // or the reminder would nag every day about a rest month. Same rule the
    // Today screen applies (lib/schedule.ts::isDueOnScreen).
    const lastSettled = await lastSettledOnOrBefore(
      row.user_id,
      row.id,
      clock.today
    );
    if (!isDueOn(habit.schedule, habit.start_date, clock.today, lastSettled)) {
      continue;
    }

    // Already done, or excused as a rest day → nothing to nag about.
    const settled = await isSettledToday(row.user_id, row.id, clock.today);
    if (settled) continue;

    const result = await sendToUser(row.user_id, {
      title: row.name,
      body:
        habit.kind === 'quit'
          ? 'Still going strong? Check in on this one.'
          : "Time to check this off — it's still open today.",
      url: `/habits/${row.id}`,
      tag: `habit-${row.id}`,
    });

    // Stamp regardless of delivery outcome. A push service failure is not worth
    // re-sending every 5 minutes for the rest of the day; the next day's
    // reminder is the natural retry.
    await run(`UPDATE habits SET last_notified_date = $1 WHERE id = $2`, [
      clock.today,
      row.id,
    ]);
    if (result.sent > 0) sentCount++;
  }

  return NextResponse.json({ ok: true, considered, sent: sentCount });
}

function unauthorizedCron() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * The habit's most recent 'pass' OR rest day on or before `date` — whichever is
 * later. This is what closes a rolling monthly cycle. Capped at `date` (the
 * owner's today), so a rest day planned ahead can't silence a reminder now.
 */
async function lastSettledOnOrBefore(
  userId: number,
  habitId: number,
  date: string
): Promise<string | null> {
  const rows = await many<{ max: string | null }>(
    `SELECT MAX(d) AS max FROM (
       SELECT date AS d FROM entries
         WHERE user_id = $1 AND habit_id = $2 AND status = 'pass' AND date <= $3
       UNION ALL
       SELECT date AS d FROM streak_exceptions
         WHERE user_id = $1 AND scope = 'habit' AND ref = $4 AND date <= $3
     ) settled`,
    [userId, habitId, date, String(habitId)]
  );
  return rows[0]?.max ?? null;
}

/**
 * True if today needs no reminder: the day carries any recorded entry, or it's
 * excused as a rest day. An explicit `fail` counts as settled — the owner has
 * already answered for the day, and nagging someone who marked it missed is
 * worse than staying quiet.
 */
async function isSettledToday(
  userId: number,
  habitId: number,
  date: string
): Promise<boolean> {
  const [entries, exceptions] = await Promise.all([
    many<{ status: string }>(
      `SELECT status FROM entries WHERE habit_id = $1 AND date = $2`,
      [habitId, date]
    ),
    many<{ id: number }>(
      `SELECT id FROM streak_exceptions
        WHERE user_id = $1 AND scope = 'habit' AND ref = $2 AND date = $3`,
      [userId, String(habitId), date]
    ),
  ]);
  if (exceptions.length > 0) return true;
  const status = entries[0]?.status;
  return status === 'pass' || status === 'fail';
}
