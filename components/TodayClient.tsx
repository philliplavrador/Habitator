'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import HabitRow from './HabitRow';
import ProgressRing from './ProgressRing';
import CountUp from './ui/CountUp';
import { useCelebration } from './hooks/useCelebration';
import { useToast } from './ui/toast';
import { apiClearEntry, apiSetEntry } from '@/lib/client';
import type { EntryStatus, HabitDayView } from '@/lib/types';

/**
 * A custom-habit summary widget (pushups/pullups/japanese) rendered on the
 * server and handed down for inline placement in the habit list.
 */
export interface WidgetItem {
  /** Stable list key. */
  key: string;
  /** Done for the day — sinks the widget into the "Completed" section. */
  completed: boolean;
  /** The pre-rendered summary card. */
  node: ReactNode;
}

interface Props {
  date: string;
  initialItems: HabitDayView[];
  /**
   * Server-rendered summary widgets for the custom-habit domains
   * (pushups/pullups/japanese). They flow inline with the habit list rather
   * than being pinned above it, so those domains read as ordinary habits — and,
   * like ordinary habits, a completed one drops into the "Completed" section.
   */
  widgets?: WidgetItem[];
}

const MILESTONES = [7, 30, 100];

// Row motion. `layout="position"` is what slides survivors when a row leaves or
// joins a zone; the enter/exit variants use opacity + scale ONLY (never x/y),
// which would fight `layout`'s own translate. Reduced motion is handled globally
// by <MotionConfig reducedMotion="user"> (Providers.tsx), so no local gate.
const listSpring = { type: 'spring', stiffness: 500, damping: 40 } as const;
const rowTransition = {
  layout: listSpring,
  opacity: { duration: 0.18 },
  scale: { duration: 0.18 },
};

/**
 * One habit row, wrapped so it can animate between the active and completed
 * zones. The wrapper is a roleless `m.div` (not `motion.li`) because
 * HabitRow already renders the `<li>` — a `<li>` wrapper would nest `<li>` in
 * `<li>` and warn. Completed rows recede to 0.7 opacity via `animate` (not a
 * className) so the whole row, ✓ included, dims without touching its hit area.
 */
function MotionRow({
  view,
  zone,
  busy,
  onSetStatus,
}: {
  view: HabitDayView;
  zone: 'active' | 'completed';
  busy: boolean;
  onSetStatus: (next: EntryStatus | null) => void;
}) {
  const rest = zone === 'completed' ? 0.7 : 1;
  return (
    <m.div
      layout="position"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: rest, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={rowTransition}
    >
      <HabitRow view={view} busy={busy} onSetStatus={onSetStatus} />
    </m.div>
  );
}

export default function TodayClient({ date, initialItems, widgets }: Props) {
  const { perfectDay, milestone } = useCelebration();
  const { show } = useToast();
  const [items, setItems] = useState<HabitDayView[]>(initialItems);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Completed habits are hidden by default; a scroll-down toggle reveals them so
  // the active list stays uncluttered once the day's work is checked off.
  const [showCompleted, setShowCompleted] = useState(false);

  // Habit ids with an in-flight write. A fresh server snapshot (a genuine
  // server refresh, e.g. date navigation) must not clobber a habit we just
  // optimistically changed but whose own write hasn't landed yet — otherwise
  // rapid taps flicker.
  const pending = useRef<Set<number>>(new Set());

  // Re-sync when the server sends fresh data (date change or full load),
  // but preserve the optimistic status of any habit with a write still in flight.
  useEffect(() => {
    setItems((prev) =>
      initialItems.map((srv) =>
        pending.current.has(srv.habit.id)
          ? prev.find((p) => p.habit.id === srv.habit.id) ?? srv
          : srv
      )
    );
  }, [initialItems]);

  // Two kinds of habit live in `items`. Build ("do daily") habits drive the
  // progress ring and the active/completed split. Quit ("avoiding") habits are
  // constraints, not tasks: they never enter the ring — they get their own
  // "Avoiding" section and only leave "clean" when explicitly marked as a slip.
  const buildItems = items.filter((i) => i.habit.kind !== 'quit');
  const quitItems = items.filter((i) => i.habit.kind === 'quit');

  // The daily ring / perfect-day count only DAILY and fixed-day (weekday/
  // interval) build habits. `weekly` habits are week-based, so they render in
  // the list but stay out of the ring (their progress is their own week line).
  const ringItems = buildItems.filter((i) => i.habit.schedule.kind !== 'weekly');
  const doneCount = ringItems.filter((i) => i.status === 'pass').length;
  const total = ringItems.length;
  const progress = total > 0 ? doneCount / total : 0;
  const allDone = total > 0 && doneCount === total;

  // Presentation-only split (never a source of truth): completed habits sink to
  // a scroll-down "Completed" zone; a `fail` or untouched habit stays active.
  // Derived from the optimistic `buildItems`, so a row leaves the active list
  // the instant it's tapped, before the server round-trip.
  const activeItems = buildItems.filter((i) => i.status !== 'pass');
  const completedItems = buildItems.filter((i) => i.status === 'pass');

  // Custom-habit widgets mirror the same split: an unfinished domain stays in
  // the active list; a completed one sinks into the "Completed" section and
  // counts toward its "Show completed" tally.
  const widgetItems = widgets ?? [];
  const activeWidgets = widgetItems.filter((w) => !w.completed);
  const completedWidgets = widgetItems.filter((w) => w.completed);
  const completedTotal = completedItems.length + completedWidgets.length;

  const nothingToShow =
    buildItems.length === 0 && quitItems.length === 0 && widgetItems.length === 0;

  // ── Perfect-day celebration ──
  // Fire when the day flips from not-all-done to all-done. Initialize the ref to
  // the current state so an already-complete day doesn't celebrate on load.
  const prevAllDone = useRef(allDone);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      perfectDay();
      show({
        tone: 'success',
        title: 'Perfect day!',
        description: `All ${total} habits done.`,
      });
    }
    prevAllDone.current = allDone;
  }, [allDone, total, perfectDay, show]);

  // ── Streak-milestone celebration ──
  // Streaks are server-computed. Since the check-off path no longer calls
  // router.refresh(), a genuine crossing fires from the merge in handleSet (see
  // `fireStreakMilestone`), NOT from this effect. This effect only handles the
  // OTHER sources of a fresh streak: the initial load (seed `seenStreaks`
  // without firing, so pre-existing streaks never celebrate on load) and genuine
  // server refreshes such as date navigation (reconcile `seenStreaks` so a
  // value already merged optimistically can't re-fire). `seenStreaks` is the
  // shared record of the last-known streak per habit, kept in sync by both paths.
  const seenStreaks = useRef<Map<number, number>>(new Map());
  const streaksInit = useRef(false);
  useEffect(() => {
    for (const it of initialItems) {
      const prev = seenStreaks.current.get(it.habit.id) ?? 0;
      const cur = it.currentStreak;
      if (streaksInit.current && cur > prev) {
        const crossed = MILESTONES.filter((m) => cur >= m && prev < m);
        if (crossed.length) {
          const m = Math.max(...crossed);
          milestone(m);
          show({
            tone: 'success',
            title: `🔥 ${m}-day streak!`,
            description: it.habit.name,
          });
        }
      }
      seenStreaks.current.set(it.habit.id, cur);
    }
    streaksInit.current = true;
  }, [initialItems, milestone, show]);

  // Fire the milestone celebration for a habit whose freshly-merged streak
  // crossed 7/30/100 upward — the merge-path equivalent of the effect above.
  // Records the new streak in `seenStreaks` so a later genuine refresh (which
  // will report the same streak) can't double-fire it.
  function fireStreakMilestone(habitId: number, name: string, freshStreak: number) {
    const prev = seenStreaks.current.get(habitId) ?? freshStreak;
    seenStreaks.current.set(habitId, freshStreak);
    if (freshStreak <= prev) return;
    const crossed = MILESTONES.filter((m) => freshStreak >= m && prev < m);
    if (!crossed.length) return;
    const m = Math.max(...crossed);
    milestone(m);
    show({ tone: 'success', title: `🔥 ${m}-day streak!`, description: name });
  }

  async function handleSet(habitId: number, next: EntryStatus | null) {
    // Same-habit concurrency guard. A row leaving the active zone stays in the
    // DOM as an AnimatePresence exiting child with its pre-tap props frozen — so
    // its buttons briefly render enabled (busy=false) even though a write is in
    // flight. Guard at the source so a stray tap on that ghost can't start a
    // second, racing write. (Previously the row re-rendered in place as busy.)
    if (pending.current.has(habitId)) return;
    const target = items.find((i) => i.habit.id === habitId);
    const prevStatus = target?.status ?? null;
    const habitName = target?.habit.name ?? '';
    pending.current.add(habitId);
    // Optimistic update.
    setItems((cur) =>
      cur.map((i) => (i.habit.id === habitId ? { ...i, status: next } : i))
    );
    setBusyId(habitId);
    setError(null);
    try {
      // Merge the habit's fresh streak/weekly from the mutation response instead
      // of a full-page router.refresh() (one network request, no RSC refetch).
      const result =
        next === null
          ? await apiClearEntry(habitId, date)
          : await apiSetEntry(habitId, date, next);
      // currentStreak is absent only when a clear hit a since-deleted habit —
      // nothing fresh to merge, so leave the optimistic state as-is.
      if (result.currentStreak !== undefined) {
        const freshStreak = result.currentStreak;
        setItems((cur) =>
          cur.map((i) =>
            i.habit.id === habitId
              ? { ...i, currentStreak: freshStreak, weekly: result.weekly }
              : i
          )
        );
        fireStreakMilestone(habitId, habitName, freshStreak);
      }
    } catch (e) {
      // Revert just this habit, leaving other in-flight changes intact.
      setItems((cur) =>
        cur.map((i) =>
          i.habit.id === habitId ? { ...i, status: prevStatus } : i
        )
      );
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      pending.current.delete(habitId);
      setBusyId(null);
    }
  }

  return (
    <div>
      {total > 0 && (
        <div className="mb-6 flex flex-col items-center">
          <ProgressRing progress={progress} reached={allDone} size={168} stroke={12}>
            <div className="font-display text-3xl font-bold tabular-nums text-text-primary">
              <CountUp value={Math.round(progress * 100)} suffix="%" />
            </div>
            <div className="mt-0.5 text-xs text-text-muted">
              {doneCount} of {total} done
            </div>
          </ProgressRing>
          <p
            className={`mt-3 text-sm font-semibold ${
              allDone ? 'text-pass' : 'text-text-muted'
            }`}
          >
            {allDone ? 'Perfect day 🎉' : 'Keep your momentum going'}
          </p>
        </div>
      )}

      {nothingToShow && (
        <p className="mb-3 text-sm text-text-muted">No habits for this day yet.</p>
      )}

      {error && (
        <p className="mb-3 rounded-btn bg-fail/15 px-3 py-2 text-sm text-fail">
          {error}
        </p>
      )}

      {/* key={date} remounts the subtree on date change for a clean instant swap
          (no cross-day exit/enter burst); the items / pending / celebration refs
          live on TodayClient and are untouched. */}
      {!nothingToShow && (
        <div key={date}>
          {/* ── Build ("do daily") habits: active zone ── */}
          {buildItems.length > 0 && (
            <>
              {/* role="list" restores the semantics the <ul>→<div> swap drops.
                  Kept mounted while any build habit exists (never gated on its
                  own length) so completing the LAST active one still plays its
                  exit. */}
              <m.div
                role="list"
                aria-label={activeItems.length > 0 ? 'Habits to do' : undefined}
                className="flex flex-col gap-2"
                layout="position"
              >
                <AnimatePresence initial={false}>
                  {activeItems.map((view) => (
                    <MotionRow
                      key={view.habit.id}
                      view={view}
                      zone="active"
                      busy={busyId === view.habit.id}
                      onSetStatus={(next) => handleSet(view.habit.id, next)}
                    />
                  ))}
                </AnimatePresence>
              </m.div>

              {activeItems.length === 0 && (
                <p className="px-1 pt-1 text-sm text-text-muted">
                  Nothing left to check off.
                </p>
              )}
            </>
          )}

          {/* Active custom-habit summary widgets — still-to-do work, so they
              stay above the avoiding/completed sections. Completed ones move to
              the "Completed" section below, like any finished habit. */}
          {activeWidgets.length > 0 && (
            <m.div layout="position" className="mt-2">
              {activeWidgets.map((w) => (
                <div key={w.key}>{w.node}</div>
              ))}
            </m.div>
          )}

          {/* ── Quit ("avoiding") habits: their own section, out of the ring.
              Clean by default; each row only fails when explicitly slipped. ── */}
          {quitItems.length > 0 && (
            <section className="mt-8">
              <header className="mb-3 flex items-center gap-3 px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Avoiding
                </span>
                <span className="text-xs tabular-nums text-text-muted">
                  {quitItems.length}
                </span>
                <span aria-hidden className="h-px flex-1 bg-border" />
              </header>
              <m.div
                role="list"
                aria-label="Habits to avoid"
                className="flex flex-col gap-2"
                layout="position"
              >
                <AnimatePresence initial={false}>
                  {quitItems.map((view) => (
                    <MotionRow
                      key={view.habit.id}
                      view={view}
                      zone="active"
                      busy={busyId === view.habit.id}
                      onSetStatus={(next) => handleSet(view.habit.id, next)}
                    />
                  ))}
                </AnimatePresence>
              </m.div>
            </section>
          )}

          {/* Completed archive — hidden behind a scroll-down toggle. The button
              stays put; only the list expands/collapses so completed habits are
              out of the way until you deliberately ask to see them. */}
          {completedTotal > 0 && (
            <div className="mt-8">
              <m.button
                type="button"
                layout="position"
                onClick={() => setShowCompleted((v) => !v)}
                aria-expanded={showCompleted}
                className="mx-auto flex items-center gap-1.5 rounded-btn px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted active:opacity-70"
              >
                <span>{showCompleted ? 'Hide' : 'Show'} completed</span>
                <span className="tabular-nums">{completedTotal}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`transition-transform ${showCompleted ? 'rotate-180' : ''}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </m.button>

              <AnimatePresence initial={false}>
                {showCompleted && (
                  <m.section
                    key="completed"
                    layout="position"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ layout: listSpring, opacity: { duration: 0.2 } }}
                    className="mt-3 overflow-hidden"
                  >
                    {completedItems.length > 0 && (
                      <m.div
                        role="list"
                        aria-label="Completed habits"
                        className="flex flex-col gap-2"
                        layout="position"
                      >
                        <AnimatePresence initial={false}>
                          {completedItems.map((view) => (
                            <MotionRow
                              key={view.habit.id}
                              view={view}
                              zone="completed"
                              busy={busyId === view.habit.id}
                              onSetStatus={(next) => handleSet(view.habit.id, next)}
                            />
                          ))}
                        </AnimatePresence>
                      </m.div>
                    )}

                    {/* Completed custom-habit widgets — dimmed like completed
                        rows so the whole zone reads as "done and put away". */}
                    {completedWidgets.length > 0 && (
                      <div
                        className={
                          completedItems.length > 0
                            ? 'mt-2 opacity-70'
                            : 'opacity-70'
                        }
                      >
                        {completedWidgets.map((w) => (
                          <div key={w.key}>{w.node}</div>
                        ))}
                      </div>
                    )}
                  </m.section>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
