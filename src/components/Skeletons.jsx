export function GridSkeleton({ count = 12 }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70 dark:bg-white/[0.03] dark:ring-white/5">
          <div className="skeleton aspect-square" />
          <div className="space-y-2 p-3">
            <div className="skeleton h-3 w-3/4 rounded" />
            <div className="skeleton h-2.5 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 8 }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70 dark:bg-white/[0.03] dark:ring-white/5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 dark:border-white/5">
          <div className="skeleton h-10 w-10 rounded-lg" />
          <div className="skeleton h-3 w-1/3 rounded" />
          <div className="skeleton ml-auto hidden h-3 w-16 rounded sm:block" />
          <div className="skeleton hidden h-3 w-24 rounded md:block" />
        </div>
      ))}
    </div>
  );
}
