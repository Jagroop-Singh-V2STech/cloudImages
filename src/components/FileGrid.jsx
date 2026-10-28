import { AnimatePresence, LayoutGroup } from 'framer-motion';
import { isFolder } from '../lib/format';
import FolderCard from './FolderCard';
import MediaCard from './MediaCard';

function SectionTitle({ children, count }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {children}
      <span className="rounded-full bg-slate-200/70 px-1.5 py-px text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">{count}</span>
    </h2>
  );
}

/** Grid view: folders first (compact tiles), then media cards. */
export default function FileGrid({ items, ctx }) {
  const folders = items.filter(isFolder);
  const media = items.filter((f) => !isFolder(f));

  return (
    <LayoutGroup>
      {folders.length > 0 && (
        <section className="mb-8">
          <SectionTitle count={folders.length}>Folders</SectionTitle>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            <AnimatePresence mode="popLayout" initial={true}>
              {folders.map((f, i) => (
                <FolderCard key={f.id} folder={f} index={i} ctx={ctx} />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}
      {media.length > 0 && (
        <section>
          <SectionTitle count={media.length}>Photos & videos</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            <AnimatePresence mode="popLayout">
              {media.map((f, i) => (
                <MediaCard key={f.id} file={f} index={i} ctx={ctx} />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}
    </LayoutGroup>
  );
}
