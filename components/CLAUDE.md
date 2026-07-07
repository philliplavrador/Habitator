# components/ — UI

Reuse the shared primitives before writing new UI. Most "new" surfaces are a
composition of what's already here.

## Shared primitives

**`ui/`** — design-system building blocks:
- `Button`, `Card`, `Field` (`Field` + `Textarea`), `StatTile`,
  `SegmentedControl`, `Sheet`
- `toast` (`useToast`), `confirm` (`useConfirm`) — imperative helpers
- `cx.ts` — `cx(...)` className joiner (drops falsy). Use it instead of
  hand-rolled `[...].filter(Boolean).join(' ')`.

**`charts/`** — Recharts wrappers:
- `ChartCard`, `LineTrend`, `BarBreakdown`, `ChartTooltip`
- `theme.ts` — exports the `chart` palette + `weekdayColor(rate)` (rate is a
  **percent 0..100**; see the rate-scale note in `lib/CLAUDE.md`).

**Domain-shared composites** (used by multiple screens):
- `SummaryCard` — compact Today-screen card linking to a full screen.
- `ContributionGrid` — the calendar heatmap grid (habit calendar / streaks).
- `EditableHistoryRow` — read↔edit row with a shared busy/error/confirm machine;
  history lists (habits, rep sessions, anki, fasts) build on it.
- `HeroLogCard` — the shared "log a number" hero input; exports the canonical
  `heroInputClass` (rep programs + Anki reuse it).
- `RepProgramPage` — the entire pushups/pullups screen shell, parameterized only
  by data-fetchers + title/subtitle.
- `GuidedWorkout` — the camera "record workout" flow for a rep program: ONE
  continuous MediaRecorder take across all sets + rests (feature-detected, with a
  manual fallback). Owned by `RepProgramCard`, which toggles between it ("Record")
  and manual entry ("Type reps", with an optional video per set).
- `BackHeader` — the chevron back-link page header.

## Rules

1. **Use `ui/Field` + `ui/Button`.** Don't hand-roll an `inputClass` or a local
   card wrapper — use `ui/Field`/`Textarea` and `ui/Card`. The one sanctioned
   bespoke input is `heroInputClass` from `HeroLogCard`.

2. **Presentational components never touch the DB.** They call the `lib/client`
   `api*` fetch helpers; user-scoping happens **server-side** in the route
   handlers. A component importing from `lib/db`/`lib/*` server modules is a bug
   (it would break the client bundle).

3. **Brand colors have one canonical source.** Hexes live in
   `tailwind.config.ts` (the `colors` extend). `charts/theme.ts` mirrors the
   subset Recharts needs (SVG fills can't read Tailwind classes). Do **not**
   hardcode a third copy — reference a Tailwind class, or `chart.*` /
   `weekdayColor` in chart code.

4. **Server pages open with `requirePageContext()`** (from `lib/pageContext`) →
   `{ userId, tz, today }`. Habit detail/edit pages use `loadHabitOr404()` (from
   `lib/habitPage`) for the parse-id → load → 404 preamble.
