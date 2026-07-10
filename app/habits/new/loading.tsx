// Sibling skeleton for the add-habit flow, so navigating here never flashes the
// root Today skeleton (a mismatched layout). Approximate form shell. Static.

export default function Loading() {
  return (
    <main className="py-4">
      <div className="mb-5 flex items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-btn border border-border bg-surface" />
        <div className="h-6 w-32 animate-pulse rounded bg-surface2" />
      </div>

      {/* Step chooser / segmented control */}
      <div className="h-10 w-full animate-pulse rounded-btn bg-surface2" />

      {/* Form fields */}
      <div className="mt-5 flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="mb-2 h-3 w-20 animate-pulse rounded bg-surface2" />
            <div className="h-11 w-full animate-pulse rounded-btn border border-border bg-surface" />
          </div>
        ))}
        <div className="mt-2 h-12 w-full animate-pulse rounded-btn bg-surface2" />
      </div>
    </main>
  );
}
