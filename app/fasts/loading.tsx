// Instant skeleton for the Fasting screen. Mirrors app/fasts/page.tsx's <main> +
// header + FastClient ring hero + trends (stat tiles + ChartCards). The ring is
// 224px (FastClient uses ProgressRing's default size). Static server component.

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

/** A stat-tile placeholder: matches StatTile's px-3 py-4 centered surface. */
function TileSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-4 text-center shadow-card">
      <div className="mx-auto h-7 w-14 animate-pulse rounded bg-surface2" />
      <div className="mx-auto mt-2 h-3 w-16 animate-pulse rounded bg-surface2" />
    </div>
  );
}

export default function Loading() {
  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <div className="mx-auto h-6 w-24 animate-pulse rounded bg-surface2" />
      </header>

      {/* FastClient hero: ring (224px, stroke 14 track) + action button */}
      <div className="flex flex-col items-center gap-5">
        <div className="relative h-[224px] w-[224px]">
          <div className="h-full w-full rounded-full border-[14px] border-border" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="h-9 w-28 animate-pulse rounded bg-surface2" />
            <div className="h-3 w-24 animate-pulse rounded bg-surface2" />
          </div>
        </div>
        <div className="h-12 w-full animate-pulse rounded-btn bg-surface2" />
      </div>

      {/* Trends */}
      <section className="mt-8 flex flex-col gap-3">
        <div className="h-5 w-20 animate-pulse rounded bg-surface2" />
        <div className="grid grid-cols-2 gap-2">
          <TileSkeleton />
          <TileSkeleton />
        </div>
        <ChartSkeleton />
        <ChartSkeleton height="h-44" />
        <ChartSkeleton height="h-44" />
      </section>
    </main>
  );
}
