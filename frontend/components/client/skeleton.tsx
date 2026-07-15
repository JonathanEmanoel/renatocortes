export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-[8px] border border-white/10 bg-card p-5">
      <div className="h-28 rounded-[8px] bg-white/10" />
      <div className="mt-5 h-4 w-3/4 rounded bg-white/10" />
      <div className="mt-3 h-4 w-1/2 rounded bg-white/10" />
    </div>
  );
}
