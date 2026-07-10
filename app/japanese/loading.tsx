// Instant skeleton for the Japanese/Anki screen. Mirrors
// app/japanese/page.tsx's <main> + header + AnkiLogCard hero + Timeline card +
// pace/streak/finish tiles + cumulative chart. Static server component.

/** A stat-tile placeholder: matches StatTile's px-3 py-4 centered surface. */
function TileSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-4 text-center shadow-card">
      <div className="mx-auto h-7 w-16 animate-pulse rounded bg-surface2" />
      <div className="mx-auto mt-2 h-3 w-14 animate-pulse rounded bg-surface2" />
      <div className="mx-auto mt-1.5 h-2.5 w-20 animate-pulse rounded bg-surface2" />
    </div>
  );
}

export default function Loading() {
  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <div className="mx-auto h-6 w-28 animate-pulse rounded bg-surface2" />
        <div className="mx-auto mt-2 h-3 w-56 animate-pulse rounded bg-surface2" />
      </header>

      {/* AnkiLogCard hero: progress bar + today's input */}
      <div className="rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="h-4 w-40 animate-pulse rounded bg-surface2" />
        <div className="mt-3 h-3 w-full animate-pulse rounded-pill bg-surface2" />
        <div className="mt-4 h-11 w-full animate-pulse rounded-btn bg-surface2" />
      </div>

      {/* Timeline card */}
      <div className="mt-3 rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="h-4 w-20 animate-pulse rounded bg-surface2" />
          <div className="h-4 w-16 animate-pulse rounded bg-surface2" />
        </div>
        <div className="h-3 w-full animate-pulse rounded-pill bg-surface2" />
        <div className="mt-2 h-3 w-48 animate-pulse rounded bg-surface2" />
      </div>

      {/* Pace + streak */}
      <section className="mt-3 grid grid-cols-2 gap-2">
        <TileSkeleton />
        <TileSkeleton />
      </section>

      {/* Min-pace + projected finish */}
      <section className="mt-2 grid grid-cols-2 gap-2">
        <TileSkeleton />
        <TileSkeleton />
      </section>

      {/* Cumulative chart */}
      <section className="mt-6">
        <div className="rounded-card border border-border bg-surface p-3 shadow-card">
          <div className="mb-2 px-1">
            <div className="h-4 w-32 animate-pulse rounded bg-surface2" />
            <div className="mt-1.5 h-3 w-44 animate-pulse rounded bg-surface2" />
          </div>
          <div className="h-52 w-full animate-pulse rounded-btn bg-surface2" />
        </div>
      </section>
    </main>
  );
}
