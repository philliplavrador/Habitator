// Instant skeleton for the habit detail screen. Mirrors
// app/habits/[id]/page.tsx's <main className="py-4"> + BackHeader + schedule line
// + stat-tile grids + heatmap + edit-days card + charts. Static server component.

/** A stat-tile placeholder: matches StatTile's px-3 py-4 centered surface. */
function TileSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-4 text-center shadow-card">
      <div className="mx-auto h-7 w-12 animate-pulse rounded bg-surface2" />
      <div className="mx-auto mt-2 h-3 w-14 animate-pulse rounded bg-surface2" />
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
    <main className="py-4">
      {/* BackHeader: ‹ back button + title */}
      <header className="mb-5 flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-btn border border-border" />
        <div className="h-6 w-40 animate-pulse rounded bg-surface2" />
      </header>

      {/* Schedule / tracking-since line */}
      <div className="mb-5 h-3 w-56 animate-pulse rounded bg-surface2" />

      {/* Rate / streak / longest */}
      <section className="mb-3 grid grid-cols-3 gap-2">
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton />
      </section>

      {/* Passes / fails */}
      <section className="mb-6 grid grid-cols-2 gap-2">
        <TileSkeleton />
        <TileSkeleton />
      </section>

      {/* Heatmap */}
      <section className="mb-6">
        <div className="mb-3 h-4 w-28 animate-pulse rounded bg-surface2" />
        <div className="h-40 w-full animate-pulse rounded-card bg-surface2" />
      </section>

      {/* Edit days */}
      <section className="mb-6">
        <div className="mb-3 h-4 w-20 animate-pulse rounded bg-surface2" />
        <div className="rounded-card border border-border bg-surface p-3 shadow-card">
          <div className="h-56 w-full animate-pulse rounded-btn bg-surface2" />
        </div>
      </section>

      {/* Charts */}
      <section className="mb-6 flex flex-col gap-3">
        <ChartSkeleton />
        <ChartSkeleton height="h-44" />
      </section>
    </main>
  );
}
