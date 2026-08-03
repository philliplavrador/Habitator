# Future-day preview on the Today screen

**Date:** 2026-08-02
**Status:** approved, ready for planning

## Goal

Let the user arrow forward past today on the Today screen to see which habits
are scheduled on an upcoming day, and pre-plan rest days for them (e.g. excuse
next Tuesday before a trip).

## Scope decisions

Settled during brainstorming:

1. **Future rows are read-only for pass/fail, but rest days stay live.** Marking
   a day that hasn't happened as done is meaningless and corrupts stats; excusing
   it in advance is the actual use case.
2. **Custom-habit widgets appear on future days in a name-only form.** No week/day
   numbers and no progress, because rep and plank programs advance by *completed
   session*, not by calendar date — any number shown for a future day would be a
   guess that goes stale the moment a session is skipped.
3. **The habit detail page's calendar is untouched.** Future days there stay
   disabled. Rest-day planning happens on the Today screen only. Revisit later if
   planning a whole trip one-day-at-a-time proves tedious.

## Navigation window

A new `MAX_FUTURE_DAYS = 90` constant in `lib/dates.ts` (a quarter — enough to
plan around trips, and it stops the `›` arrow running forever).

- `app/page.tsx` currently clamps any `?date=` later than today back to today
  (line ~40). It instead clamps into `[any past date, today + MAX_FUTURE_DAYS]`.
  An invalid or out-of-window date still falls back to today.
- `nextDate` becomes null only at the far edge of the window, so `›` keeps
  stepping forward until then.
- `relativeLabel` (`lib/dates.ts`) gains a "Tomorrow" case beside "Today" and
  "Yesterday".

`prevDate` is unchanged — past navigation already works and stays unbounded.

## Today screen in future mode

`TodayClient` takes a new `isFuture: boolean` prop.

- **Progress ring hidden.** A future day is always 0-of-N; showing "0%" with
  "Keep your momentum going" reads as failure. Replaced by a single muted line:
  `N habits scheduled`.
- **No active/completed split.** Nothing can be completed on a future day, so
  build habits render as one flat list. The "Avoiding" section still lists quit
  habits, and the "Show completed" toggle does not render.
- **Celebrations cannot fire.** `allDone` requires `doneCount === total` with
  `total > 0`; with no entries, `doneCount` is 0. Gate the perfect-day and
  milestone effects on `!isFuture` anyway so this stays true if the derivation
  changes.
- **Rest-day rows keep their full treatment.** An excused future day shows the
  pink `◆ Rest day — reason` sub-line and its undo toggle, exactly as today.

`HabitRow` takes a new optional `readOnly?: boolean`:

- build habits: ✓ and ✗ buttons are not rendered; the ◆ rest button stays
- quit habits: the "I slipped" button is not rendered; the ◆ rest button stays
- the already-excused branch is unchanged (the Rest undo toggle stays live)

## Custom-habit widgets on future days

Today these are gated on `isToday` in `app/page.tsx` and vanish on any other
date. On a future day, render each as a plain name row instead of its summary
card.

A new small presentational component — `ScheduledHabitRow` — takes
`{ name, href }` and renders the same `RowShell` shell as `HabitRow` with a muted
`Scheduled` sub-line and no controls.

The data for it is cheaper than the current path, not more expensive: instead of
three `getState` computations, a future day reads names only.

| Source | Read | Name | Href |
| --- | --- | --- | --- |
| user rep programs | `listRepPrograms(userId)` | `row.name` | `/rep-programs/{id}` |
| user plank programs | `listPlankPrograms(userId)` | `row.name` | `/plank-programs/{id}` |
| built-in domains | `listUserDomains(userId)` | static map | static map |

The built-in map covers the three `DomainKey`s: `pushups` → "Pushups"
(`/pushups`), `pullups` → "Pullups" (`/pullups`), `japanese` → "Japanese (Anki)"
(`/japanese`). `pushups`/`pullups` are no longer in `CUSTOM_HABIT_LIBRARY` (they
are legacy domains kept for existing accounts), so their labels cannot be sourced
from it.

Past days keep today's behaviour: no widgets at all. Only today and future days
show them, in their respective forms.

## Server-side changes

**`app/api/exceptions/route.ts`** currently rejects every future date outright.
It relaxes to allow future dates **only for scope `habit`**, and only within
`MAX_FUTURE_DAYS`. Scopes `rep`, `plank`, and `anki` keep the hard "no future"
rule — no UI exposes a rest-day control for them on a future day, and their
streak paths (`analytics.ts::streakOverDays`, `anki.ts::computeStreak`) have not
been audited for future-dated exceptions. The existing `start_date` / `end_date`
checks are unchanged, as is the DELETE path's date validation.

**`app/api/entries/route.ts` is unchanged.** Future pass/fail entries stay
forbidden; its existing comment already explains why (a future entry would
falsely extend the current streak).

## Correctness guard: future exceptions must not move today's stats

This is the one real trap in the change.

`computeWeeklyStats` (`lib/stats.ts`) buckets the exception set by week with **no
upper bound on `today`**:

```ts
for (const d of exceptions) {
  if (compareISO(d, startDate) < 0) continue;
  const wk = weekStartOf(d);
  excPerWeek.set(wk, (excPerWeek.get(wk) ?? 0) + 1);
}
```

Each exception in a week shaves one off that week's required count. So marking
Friday as a rest day while it is Wednesday would immediately lower the *current*
week's target — potentially flipping the week to "met" and extending the weekly
streak today, for a day that has not happened.

**Fix:** in `computeHabitStats`, filter the exception set to dates
`<= effectiveToday` before dispatching to any of the four rule functions. Every
stats read funnels through `computeHabitStats` — including `getHabitStatsBatch`,
which `getCurrentStreaksBatch` (the Today-screen streak badges) delegates to — so
one guard covers every path.

The other three walks are already bounded: `computeQuitStats` and
`computeScheduledStats` iterate `rangeDates(startDate, today)`, and
`computeStats` filters *entries* by the exception set (and there can be no future
entries). The guard is belt-and-braces for them and load-bearing for weekly.

`listExceptionsForDate` (the Today screen's per-day read) is unaffected — it is
keyed to the selected date, so a future exception shows on its own day and
nowhere else.

## Files touched

- `lib/dates.ts` — `MAX_FUTURE_DAYS`, "Tomorrow" in `relativeLabel`
- `lib/stats.ts` — exception-set clamp in `computeHabitStats`
- `app/page.tsx` — future-date clamp, `nextDate` window, future-mode widget reads
- `components/DateNav.tsx` — renders whatever `nextDate` it is given, so no logic change; its `nextDate` doc comment ("null when `date` is today") becomes wrong and must be updated to say "null at the end of the forward window"
- `components/TodayClient.tsx` — `isFuture` prop, ring/split/celebration gating
- `components/HabitRow.tsx` — `readOnly` prop
- `components/ScheduledHabitRow.tsx` — new
- `app/api/exceptions/route.ts` — scope-aware future-date rule

## Verification

Build passes, then in the browser at 390x844:

1. `›` steps past today; the label reads "Tomorrow" on day +1 and a formatted
   date after that.
2. A future day lists the habits due on it (verify against a `weekdays`-scheduled
   habit: it appears only on its scheduled days) with no ✓/✗ buttons and no ring.
3. Custom-habit widgets render as name-only rows on a future day.
4. Marking a rest day on a future day persists, and re-navigating to that day
   shows it excused.
5. **Regression:** with a weekly habit mid-week, note its current streak, mark a
   future day in the same week as a rest day, and confirm the streak on today's
   screen and the habit detail page is unchanged.
6. `POST /api/entries` for a future date still returns 400.
7. Stepping to `today + 90` disables `›`; a hand-typed `?date=` beyond the window
   falls back to today.

## Out of scope

- Future days in the habit detail calendar
- Any pre-planning for rep/plank/anki domains
- Bulk / range rest-day planning ("mark this whole week off")
