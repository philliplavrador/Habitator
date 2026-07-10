// Sibling skeleton for the habit-edit form, so it doesn't inherit the habit
// DETAIL skeleton (stats/heatmap/charts) as its fallback. Approximate form. Static.

export default function Loading() {
  return (
    <main className="py-4">
      <div className="mb-5 flex items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-btn border border-border bg-surface" />
        <div className="h-6 w-28 animate-pulse rounded bg-surface2" />
      </div>

      <div className="flex flex-col gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className="mb-2 h-3 w-24 animate-pulse rounded bg-surface2" />
            <div className="h-11 w-full animate-pulse rounded-btn border border-border bg-surface" />
          </div>
        ))}
        <div className="mt-2 h-12 w-full animate-pulse rounded-btn bg-surface2" />
      </div>
    </main>
  );
}
