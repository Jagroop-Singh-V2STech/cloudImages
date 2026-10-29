import { useState } from 'react';
import { DRAG_TYPE, readDragIds } from '../lib/dnd';

/** Quiet "All media / Trips / Lisbon" trail. Each crumb is also a drop target. */
export default function Breadcrumbs({ path, onNavigate, onDropItems }) {
  const [over, setOver] = useState(null);
  if (path.length < 2) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex min-w-0 flex-wrap items-center text-[15px] text-muted">
      {path.map((crumb, i) => {
        const last = i === path.length - 1;
        return (
          <span key={crumb.id} className="flex min-w-0 items-center">
            {i > 0 && <span className="px-1.5" aria-hidden>/</span>}
            {last ? (
              <span aria-current="page" className="truncate text-ink">
                {crumb.name}
              </span>
            ) : (
              <button
                onClick={() => onNavigate(i)}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                  e.preventDefault();
                  setOver(crumb.id);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  setOver(null);
                  const ids = readDragIds(e);
                  if (ids) {
                    e.preventDefault();
                    onDropItems(crumb, ids);
                  }
                }}
                className={`max-w-[12rem] truncate rounded-md px-1 -mx-1 transition-colors hover:text-ink ${over === crumb.id ? 'bg-accent-soft text-accent-link' : ''}`}
              >
                {i === 0 ? 'All media' : crumb.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
