import { TONES } from './MediaThumb';
import { GRID } from './FileGrid';

export function GridSkeleton({ count = 12 }) {
  return (
    <div className={GRID} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton h-[190px] rounded-tile opacity-70" style={{ backgroundColor: TONES[i % TONES.length] }} />
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 8 }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <div className="skeleton h-12 w-12 rounded-xl opacity-70" style={{ backgroundColor: TONES[i % TONES.length] }} />
          <div className="skeleton h-3 w-1/3 rounded-full" />
          <div className="skeleton ml-auto hidden h-3 w-16 rounded-full sm:block" />
          <div className="skeleton hidden h-3 w-24 rounded-full md:block" />
        </div>
      ))}
    </div>
  );
}
