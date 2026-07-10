// Shared instant skeleton for the rep-program full screens (/pushups, /pullups,
// /rep-programs/[id]) — all render RepProgramPage. Kept as a sibling loading
// fallback per route so the root Today skeleton never leaks onto these unrelated
// layouts. Mirrors RepProgramPage's <main> + header + hero card + stat tiles +
// heatmap + charts so real data lands with minimal layout shift. Static.

export default function RepProgramPageSkeleton() {
  return (
    <main className="pb-28 pt-4">
      <header className="mb-5 flex flex-col items-center gap-2">
        <div className="h-6 w-40 animate-pulse rounded-btn bg-surface2" />
        <div className="h-3 w-56 animate-pulse rounded bg-surface2" />
      </header>

      {/* Live logging card (HeroLogCard shell) */}
      <div className="rounded-card border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div className="h-5 w-28 animate-pulse rounded bg-surface2" />
          <div className="h-5 w-24 animate-pulse rounded-pill bg-surface2" />
        </div>
        <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-surface2" />
        <div className="mt-4 h-12 w-full animate-pulse rounded-btn bg-surface2" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-btn bg-surface2" />
          ))}
        </div>
        <div className="mt-3 h-12 w-full animate-pulse rounded-btn bg-surface2" />
      </div>

      {/* Stat tiles */}
      <div className="mt-6 grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-card border border-border bg-surface px-3 py-4 shadow-card"
          >
            <div className="h-3 w-16 animate-pulse rounded bg-surface2" />
            <div className="mt-2 h-6 w-12 animate-pulse rounded bg-surface2" />
          </div>
        ))}
      </div>

      {/* Heatmap card */}
      <div className="mt-3 rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 h-4 w-24 animate-pulse rounded bg-surface2" />
        <div className="h-24 w-full animate-pulse rounded bg-surface2" />
      </div>

      {/* Charts */}
      <div className="mt-3 flex flex-col gap-3">
        <div className="rounded-card border border-border bg-surface p-3 shadow-card">
          <div className="mb-2 h-4 w-32 animate-pulse rounded bg-surface2" />
          <div className="h-52 w-full animate-pulse rounded bg-surface2/40" />
        </div>
        <div className="rounded-card border border-border bg-surface p-3 shadow-card">
          <div className="mb-2 h-4 w-32 animate-pulse rounded bg-surface2" />
          <div className="h-44 w-full animate-pulse rounded bg-surface2/40" />
        </div>
      </div>
    </main>
  );
}
