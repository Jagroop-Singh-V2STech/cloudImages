import { AnimatePresence, LayoutGroup } from 'framer-motion';
import { isFolder } from '../lib/format';
import FolderCard from './FolderCard';
import MediaCard from './MediaCard';

export const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4';

/** One unified grid: folder tiles first, then photos and videos. */
export default function FileGrid({ items, ctx }) {
  return (
    <LayoutGroup>
      <div className={GRID}>
        <AnimatePresence mode="popLayout">
          {items.map((f, i) =>
            isFolder(f) ? <FolderCard key={f.id} folder={f} index={i} ctx={ctx} /> : <MediaCard key={f.id} file={f} index={i} ctx={ctx} />,
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}
