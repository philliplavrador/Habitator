// Instant skeleton for the Today screen. Painted via this route's Suspense
// boundary while the force-dynamic server render runs, so a tap never lands on a
// dead screen. Mirrors app/page.tsx's <main> + header + progress ring + habit
// rows so real data lands with no layout shift. Static server component.

export default function Loading() {
  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        {/* Title */}
        <div className="mb-4 flex justify-center">
          <div className="h-6 w-32 animate-pulse rounded-btn bg-surface2" />
        </div>
        {/* DateNav: ‹  label  › */}
        <div className="flex items-center justify-between">
          <div className="h-10 w-10 animate-pulse rounded-btn border border-border bg-surface" />
          <div className="flex flex-col items-center gap-1.5">
            <div className="h-4 w-16 animate-pulse rounded bg-surface2" />
            <div className="h-3 w-20 animate-pulse rounded bg-surface2" />
          </div>
          <div className="h-10 w-10 animate-pulse rounded-btn border border-border bg-surface" />
        </div>
      </header>

      {/* Progress ring (size 168, stroke 12 track) */}
      <div className="mb-6 flex flex-col items-center">
        <div className="relative h-[168px] w-[168px]">
          <div className="h-full w-full rounded-full border-[12px] border-border" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="h-8 w-16 animate-pulse rounded bg-surface2" />
            <div className="h-3 w-20 animate-pulse rounded bg-surface2" />
          </div>
        </div>
        <div className="mt-3 h-4 w-44 animate-pulse rounded bg-surface2" />
      </div>

      {/* Habit rows */}
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-3 shadow-card"
          >
            <div className="min-w-0 flex-1">
              <div className="h-4 w-32 animate-pulse rounded bg-surface2" />
              <div className="mt-2 h-3 w-20 animate-pulse rounded bg-surface2" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="h-11 w-11 animate-pulse rounded-btn bg-surface2" />
              <div className="h-11 w-11 animate-pulse rounded-btn bg-surface2" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
