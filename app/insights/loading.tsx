// Instant skeleton for the Insights screen. Mirrors app/insights/page.tsx's
// <main> + header + stat-tile grid + ChartCard column + leaderboard so real data
// lands with no layout shift. Static server component.

/** A stat-tile placeholder: matches StatTile's px-3 py-4 centered surface. */
function TileSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-4 text-center shadow-card">
      <div className="mx-auto h-7 w-14 animate-pulse rounded bg-surface2" />
      <div className="mx-auto mt-2 h-3 w-16 animate-pulse rounded bg-surface2" />
    </div>
  );
}

/** A ChartCard placeholder: matches Card padding p-3 + a fixed plot height. */
function ChartSkeleton({ height = 'h-52' }: { height?: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-3 shadow-card">
      <div className="mb-2 px-1">
        <div className="h-4 w-32 animate-pulse rounded bg-surface2" />
        <div className="mt-1.5 h-3 w-40 animate-pulse rounded bg-surface2" />
      </div>
      <div className={`${height} w-full animate-pulse rounded-btn bg-surface2`} />
    </div>
  );
}

export default function Loading() {
  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <div className="mx-auto h-6 w-24 animate-pulse rounded bg-surface2" />
        <div className="mx-auto mt-2 h-3 w-52 animate-pulse rounded bg-surface2" />
      </header>

      {/* Summary tiles */}
      <section className="mb-4 grid grid-cols-2 gap-2">
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton />
      </section>

      {/* Trend charts (two h-52, one h-44 — matches the page) */}
      <section className="mb-4 flex flex-col gap-3">
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton height="h-44" />
      </section>

      {/* Habit leaderboard */}
      <section className="mb-4">
        <div className="mb-2 h-4 w-32 animate-pulse rounded bg-surface2" />
        <ul className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-3 shadow-card"
            >
              <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-surface2" />
              <div className="h-4 flex-1 animate-pulse rounded bg-surface2" />
              <div className="h-4 w-10 shrink-0 animate-pulse rounded bg-surface2" />
            </li>
          ))}
        </ul>
      </section>

      {/* Bottom domain tiles */}
      <section className="grid grid-cols-2 gap-2">
        <TileSkeleton />
        <TileSkeleton />
      </section>
    </main>
  );
}
