// Sibling skeleton for /login so a client navigation here never flashes the root
// Today skeleton. /login is otherwise static, so this rarely shows. Static.

export default function Loading() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
      <div className="h-7 w-40 animate-pulse rounded bg-surface2" />
      <div className="w-full max-w-xs flex flex-col gap-3">
        <div className="h-11 w-full animate-pulse rounded-btn border border-border bg-surface" />
        <div className="h-11 w-full animate-pulse rounded-btn border border-border bg-surface" />
        <div className="mt-1 h-12 w-full animate-pulse rounded-btn bg-surface2" />
      </div>
    </main>
  );
}
