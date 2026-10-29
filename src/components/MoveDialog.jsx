import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Folder, FolderInput, FolderPlus, Home } from 'lucide-react';
import { createFolder, friendlyError, listSubfolders } from '../lib/drive';
import { plural } from '../lib/format';
import { Modal, Spinner } from './ui';

/** Folder picker: browse the DriveGallery tree and choose a destination. */
export default function MoveDialog({ open, items, root, onClose, onMove }) {
  const [path, setPath] = useState([root]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState(null);
  const [dir, setDir] = useState(1);
  const current = path[path.length - 1];
  const movingIds = new Set((items || []).map((i) => i.id));

  useEffect(() => {
    if (open) {
      setPath([root]);
      setBusy(false);
      setNewName(null);
    }
  }, [open, root]);

  useEffect(() => {
    if (!open || !current) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    listSubfolders(current.id, { signal: ctrl.signal })
      .then(setFolders)
      .catch((e) => e.name !== 'AbortError' && setError(friendlyError(e)))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [open, current]);

  // Already there? (every item's parent is this folder)
  const sameFolder = items?.length > 0 && items.every((i) => i.parents?.includes(current?.id));

  const enter = (f) => {
    setDir(1);
    setPath((p) => [...p, { id: f.id, name: f.name }]);
  };
  const back = () => {
    setDir(-1);
    setPath((p) => p.slice(0, -1));
  };

  const createHere = async (e) => {
    e.preventDefault();
    const name = newName?.trim();
    if (!name) return setNewName(null);
    try {
      const f = await createFolder(name, current.id);
      setFolders((list) => [...list, f].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName(null);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={FolderInput}
      title={`Move ${items?.length === 1 ? `“${items[0].name}”` : plural(items?.length || 0, 'item')}`}
      description="Choose a destination folder."
    >
      <div className="overflow-hidden rounded-2xl bg-surface">
        <div className="flex items-center gap-1 border-b border-ink/[0.06] px-2 py-2">
          <button className="icon-btn h-8 w-8" onClick={back} disabled={path.length < 2} aria-label="Back">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-medium">
            {path.length === 1 ? <Home className="h-4 w-4 shrink-0 text-muted" /> : <Folder className="h-4 w-4 shrink-0 text-muted" />}
            <span className="truncate">{path.length === 1 ? 'All media' : current.name}</span>
          </div>
          <button className="icon-btn h-8 w-8" onClick={() => setNewName('')} aria-label="New folder here" title="New folder here">
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>

        <div className="relative h-64 overflow-y-auto overflow-x-hidden scrollbar-thin">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.ul
              key={current?.id}
              custom={dir}
              initial={{ x: dir * 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: dir * -40, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="p-1.5"
            >
              {newName !== null && (
                <li className="p-1">
                  <form onSubmit={createHere} className="flex gap-2">
                    <input
                      autoFocus
                      className="input h-9 bg-card"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setNewName(null))}
                      placeholder="Folder name"
                    />
                    <button className="btn-primary h-9 px-4" type="submit">
                      Create
                    </button>
                  </form>
                </li>
              )}
              {loading && (
                <li className="flex justify-center py-10">
                  <Spinner className="h-5 w-5 text-muted" />
                </li>
              )}
              {!loading && error && <li className="px-3 py-8 text-center text-[14px] text-danger">{error}</li>}
              {!loading && !error && folders.length === 0 && newName === null && (
                <li className="px-3 py-10 text-center text-[14px] text-muted">No subfolders. You can move items here.</li>
              )}
              {!loading &&
                folders.map((f) => {
                  const disabled = movingIds.has(f.id);
                  return (
                    <li key={f.id}>
                      <button
                        disabled={disabled}
                        onClick={() => enter(f)}
                        className="menu-item hover:bg-card focus:bg-card disabled:cursor-not-allowed disabled:opacity-40"
                        title={disabled ? 'Can’t move a folder into itself' : undefined}
                      >
                        <Folder className="h-4 w-4 text-muted" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <ChevronRight className="h-4 w-4 text-muted" />
                      </button>
                    </li>
                  );
                })}
            </motion.ul>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-7 flex items-center justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary min-w-[110px]"
          disabled={busy || sameFolder || loading}
          onClick={async () => {
            setBusy(true);
            try {
              await onMove(current);
              onClose();
            } catch {
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner /> : sameFolder ? 'Already here' : 'Move here'}
        </button>
      </div>
    </Modal>
  );
}
