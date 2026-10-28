import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Film, ImageIcon, LayoutGrid } from 'lucide-react';
import {
  createFolder,
  downloadFile,
  findOrCreateRootFolder,
  friendlyError,
  getFolderPath,
  getQuota,
  isAbortError,
  listSubfolders,
  moveFile,
  renameFile,
  restoreFile,
  saveBlob,
  STORAGE_UPGRADE_URL,
  trashFile,
} from './lib/drive';
import { invalidate } from './lib/mediaCache';
import { formatBytes, isFolder, plural } from './lib/format';
import { useDriveFolder } from './hooks/useDriveFolder';
import { useSelection } from './hooks/useSelection';
import { useUploadQueue } from './hooks/useUploadQueue';
import { useToast } from './hooks/useToast';
import { useTheme } from './hooks/useTheme';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Breadcrumbs from './components/Breadcrumbs';
import FileGrid from './components/FileGrid';
import FileList from './components/FileList';
import EmptyState from './components/EmptyState';
import LoadMore from './components/LoadMore';
import Lightbox from './components/Lightbox';
import UploadPanel from './components/UploadPanel';
import ContextMenu from './components/ContextMenu';
import MoveDialog from './components/MoveDialog';
import RenameDialog from './components/RenameDialog';
import ConfirmDialog from './components/ConfirmDialog';
import DropOverlay from './components/DropOverlay';
import { MobileActions, SelectionBar } from './components/SelectionBar';
import { GridSkeleton, ListSkeleton } from './components/Skeletons';
import { Spinner } from './components/ui';
import Logo from './components/Logo';

const ACCEPT = { 'image/*': [], 'video/*': [] };
const FILTERS = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'videos', label: 'Videos', icon: Film },
];

/** A tiny localStorage-backed state for per-viewer UI preferences (never tokens). */
function usePref(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem('dg-' + key);
      return raw == null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('dg-' + key, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }, [key, v]);
  return [v, setV];
}

function isTyping() {
  const el = document.activeElement;
  return el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable);
}

/** Move keyboard focus to the nearest item card in the arrow's direction. */
function focusNeighbor(key) {
  const nodes = [...document.querySelectorAll('[data-item-id]')];
  if (!nodes.length) return;
  const cur = document.activeElement?.closest?.('[data-item-id]');
  if (!cur) return nodes[0].focus();
  const i = nodes.indexOf(cur);
  if (key === 'ArrowRight') return nodes[Math.min(nodes.length - 1, i + 1)].focus();
  if (key === 'ArrowLeft') return nodes[Math.max(0, i - 1)].focus();
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const down = key === 'ArrowDown';
  let best = null;
  let bestScore = Infinity;
  for (const n of nodes) {
    const b = n.getBoundingClientRect();
    const dy = down ? b.top - r.bottom : r.top - b.bottom;
    if (dy < -4) continue;
    const score = dy * 10 + Math.abs(b.left + b.width / 2 - cx);
    if (n !== cur && score < bestScore) {
      best = n;
      bestScore = score;
    }
  }
  best?.focus();
  best?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ------------------------------------------------------------------------ */

export default function Gallery() {
  const [root, setRoot] = useState(null);
  const [error, setError] = useState(null);

  const init = useCallback(() => {
    setError(null);
    findOrCreateRootFolder()
      .then(setRoot)
      .catch((e) => setError(e));
  }, []);
  useEffect(init, [init]);

  if (!root) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
          <Logo className="h-12 w-12" />
        </motion.div>
        {error ? (
          <>
            <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" /> {friendlyError(error)}
            </p>
            <button className="btn-secondary" onClick={init}>
              Try again
            </button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> Preparing your DriveGallery folder…
          </p>
        )}
      </div>
    );
  }
  return <Workspace key={root.id} root={root} />;
}

/* ------------------------------------------------------------------------ */

function Workspace({ root }) {
  const toast = useToast();
  const { theme, cycle: cycleTheme } = useTheme();
  const rootCrumb = useMemo(() => ({ id: root.id, name: root.name }), [root]);

  // ---- Navigation & view state ----
  const [path, setPath] = useState([rootCrumb]);
  const current = path[path.length - 1];
  const [view, setView] = usePref('view', 'grid');
  const [sortPref, setSortPref] = usePref('sort', { sort: 'date', direction: 'desc' });
  const [filter, setFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [original, setOriginal] = usePref('original', false);
  const [collapsed, setCollapsed] = usePref('sidebar-collapsed', false);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const folder = useDriveFolder({ folderId: current.id, search, filter, sort: sortPref.sort, direction: sortPref.direction, rootId: root.id });
  const ids = useMemo(() => folder.items.map((f) => f.id), [folder.items]);
  const selection = useSelection(ids);
  const media = useMemo(() => folder.items.filter((f) => !isFolder(f)), [folder.items]);
  const byId = useMemo(() => new Map(folder.items.map((f) => [f.id, f])), [folder.items]);

  // ---- Sidebar folders & quota ----
  const [rootFolders, setRootFolders] = useState([]);
  const refreshRootFolders = useCallback(() => {
    listSubfolders(root.id).then(setRootFolders).catch(() => {});
  }, [root.id]);
  useEffect(refreshRootFolders, [refreshRootFolders]);

  const [quota, setQuota] = useState(null);
  const refreshQuota = useCallback(() => {
    getQuota().then(setQuota).catch(() => {});
  }, []);
  useEffect(refreshQuota, [refreshQuota]);
  const quotaTimer = useRef(null);
  const refreshQuotaSoon = useCallback(() => {
    clearTimeout(quotaTimer.current);
    quotaTimer.current = setTimeout(refreshQuota, 1500);
  }, [refreshQuota]);

  // ---- Dialog state ----
  const [lightbox, setLightbox] = useState(null); // { index, originId }
  const [menu, setMenu] = useState(null); // { x, y, items }
  const [renameItem, setRenameItem] = useState(null);
  const [creating, setCreating] = useState(false);
  const [moveItems, setMoveItems] = useState(null);
  const [confirm, setConfirm] = useState(null); // { items }
  const anyDialog = Boolean(lightbox || menu || renameItem || creating || moveItems || confirm);

  // Scroll to top when the folder/search changes.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [current.id, search, filter]);

  /* ---------------- Uploads ---------------- */

  const quotaToast = useCallback(() => {
    toast.error('Google storage is full', {
      id: 'quota',
      description: 'Free up space in Drive or upgrade your plan to keep uploading.',
      link: { label: 'Get more storage', href: STORAGE_UPGRADE_URL },
    });
  }, [toast]);

  const queue = useUploadQueue({
    onUploaded: (file, folderId) => {
      if (folderId === current.id || search) folder.add(file);
      refreshQuotaSoon();
    },
    onError: (e, item) => {
      if (e.reason === 'storageQuotaExceeded' || e.reason === 'quotaExceeded') quotaToast();
      else toast.error(`Couldn’t upload ${item.name}`, { description: friendlyError(e), id: 'upload-' + item.id });
    },
  });

  const enqueue = useCallback(
    (files) => {
      if (!files.length) return;
      const bytes = files.reduce((s, f) => s + f.size, 0);
      if (quota?.limit && quota.usage + bytes > quota.limit) {
        quotaToast();
        return;
      }
      const n = queue.addFiles(files, current.id, { compress: !original });
      toast.info(`Uploading ${plural(n, 'file')} to ${current.id === root.id ? 'My Gallery' : current.name}`, {
        description: formatBytes(bytes) + (original ? ' · original quality' : ''),
        duration: 2500,
      });
    },
    [queue, current, root.id, original, quota, quotaToast, toast],
  );

  const { getRootProps, getInputProps, isDragActive, open: openPicker } = useDropzone({
    accept: ACCEPT,
    multiple: true,
    noClick: true,
    noKeyboard: true,
    onDrop: (accepted) => enqueue(accepted),
    onDropRejected: (rejected) =>
      toast.error(`${plural(rejected.length, 'file')} skipped`, { description: 'Only images and videos can be uploaded.' }),
  });

  /* ---------------- Navigation ---------------- */

  const openFolder = useCallback(
    async (f) => {
      if (search) {
        // Search results can come from anywhere; rebuild the breadcrumb path.
        setSearchInput('');
        setSearch('');
        const p = await getFolderPath(f.id, root.id).catch(() => null);
        setPath(p ? p.map((c, i) => (i === 0 ? rootCrumb : c)) : [rootCrumb, { id: f.id, name: f.name }]);
      } else {
        setPath((p) => [...p, { id: f.id, name: f.name }]);
      }
    },
    [search, root.id, rootCrumb],
  );

  const openTopFolder = useCallback(
    (f) => {
      setSearchInput('');
      setSearch('');
      setPath([rootCrumb, { id: f.id, name: f.name }]);
    },
    [rootCrumb],
  );

  const goRoot = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setPath([rootCrumb]);
  }, [rootCrumb]);

  const openItem = useCallback(
    (item) => {
      if (isFolder(item)) return openFolder(item);
      const index = media.findIndex((m) => m.id === item.id);
      if (index >= 0) setLightbox({ index, originId: item.id });
    },
    [media, openFolder],
  );

  /* ---------------- Download ---------------- */

  const downloadOne = useCallback(
    async (file) => {
      const id = toast.loading(`Downloading ${file.name}`, { progress: 0 });
      try {
        const blob = await downloadFile(file.id, {
          sizeHint: file.size,
          onProgress: (l, t) => t && toast.update(id, { progress: l / t }),
        });
        saveBlob(blob, file.name);
        toast.update(id, { type: 'success', title: `Downloaded ${file.name}`, progress: null });
      } catch (e) {
        toast.update(id, { type: 'error', title: 'Download failed', description: friendlyError(e), progress: null });
      }
    },
    [toast],
  );

  /** Sequential bulk download with an overall progress toast. */
  const downloadMany = useCallback(
    async (items) => {
      const files = items.filter((i) => !isFolder(i));
      const skipped = items.length - files.length;
      if (!files.length) return toast.info('Folders can’t be downloaded', { description: 'Select files inside the folder instead.' });
      if (files.length === 1 && !skipped) return downloadOne(files[0]);

      const ctrl = new AbortController();
      const total = files.reduce((s, f) => s + Number(f.size || 0), 0) || 1;
      let doneBytes = 0;
      let failed = 0;
      const id = toast.loading(`Downloading 1 of ${files.length}`, {
        progress: 0,
        description: files[0].name,
        action: { label: 'Cancel', onClick: () => ctrl.abort() },
      });
      for (let i = 0; i < files.length; i++) {
        if (ctrl.signal.aborted) break;
        const f = files[i];
        toast.update(id, { title: `Downloading ${i + 1} of ${files.length}`, description: f.name });
        try {
          const blob = await downloadFile(f.id, {
            signal: ctrl.signal,
            sizeHint: f.size,
            onProgress: (l) => toast.update(id, { progress: (doneBytes + l) / total }),
          });
          saveBlob(blob, f.name);
        } catch (e) {
          if (isAbortError(e)) break;
          failed++;
        }
        doneBytes += Number(f.size || 0);
        // Small pause so the browser doesn't treat rapid saves as spam.
        await new Promise((r) => setTimeout(r, 250));
      }
      if (ctrl.signal.aborted) {
        toast.info('Download canceled', { id });
      } else {
        const ok = files.length - failed;
        toast[failed ? 'error' : 'success'](`Downloaded ${plural(ok, 'file')}`, {
          id,
          progress: null,
          action: null,
          description: [failed && `${failed} failed`, skipped && `${plural(skipped, 'folder')} skipped`].filter(Boolean).join(' · ') || undefined,
        });
      }
    },
    [toast, downloadOne],
  );

  /* ---------------- Create / rename ---------------- */

  const doCreateFolder = useCallback(
    async (name) => {
      try {
        const f = await createFolder(name, current.id);
        if (!search) folder.add(f);
        if (current.id === root.id) refreshRootFolders();
        toast.success(`Created “${name}”`);
      } catch (e) {
        toast.error('Couldn’t create folder', { description: friendlyError(e) });
        throw e;
      }
    },
    [current.id, root.id, search, folder, refreshRootFolders, toast],
  );

  const doRename = useCallback(
    async (item, name) => {
      try {
        const updated = await renameFile(item.id, name);
        folder.patch(item.id, updated);
        if (isFolder(item)) {
          setPath((p) => p.map((c) => (c.id === item.id ? { ...c, name } : c)));
          setRootFolders((list) => list.map((f) => (f.id === item.id ? { ...f, name } : f)));
        }
        toast.success('Renamed', { description: `${item.name} → ${name}` });
      } catch (e) {
        toast.error('Couldn’t rename', { description: friendlyError(e) });
        throw e;
      }
    },
    [folder, toast],
  );

  /* ---------------- Move ---------------- */

  const doMove = useCallback(
    async (items, target, { undoable = true } = {}) => {
      items = items.filter((i) => i.id !== target.id && !i.parents?.includes(target.id));
      if (!items.length) return;

      // Guard against moving a folder into one of its own descendants.
      if (items.some(isFolder)) {
        const targetPath = await getFolderPath(target.id, root.id).catch(() => null);
        if (targetPath?.some((c) => items.some((i) => i.id === c.id))) {
          toast.error('Can’t move a folder into itself');
          throw new Error('cycle');
        }
      }

      const moved = [];
      const id = toast.loading(`Moving ${plural(items.length, 'item')}…`);
      for (const item of items) {
        try {
          const updated = await moveFile(item.id, target.id, item.parents || []);
          moved.push({ before: item, after: updated });
        } catch (e) {
          toast.error(`Couldn’t move ${item.name}`, { description: friendlyError(e) });
        }
      }
      if (search) moved.forEach(({ after }) => folder.patch(after.id, after));
      else folder.remove(moved.map((m) => m.before.id));
      if (moved.some((m) => isFolder(m.before)) || target.id === root.id) refreshRootFolders();

      const targetName = target.id === root.id ? 'My Gallery' : target.name;
      if (!moved.length) return toast.dismiss(id);
      toast.success(`Moved ${plural(moved.length, 'item')} to ${targetName}`, {
        id,
        action: undoable
          ? {
              label: 'Undo',
              onClick: async () => {
                for (const { before, after } of moved) {
                  try {
                    const restored = await moveFile(after.id, before.parents[0], after.parents || []);
                    folder.add(restored);
                  } catch (e) {
                    toast.error(`Couldn’t undo move of ${before.name}`, { description: friendlyError(e) });
                  }
                }
                refreshRootFolders();
              },
            }
          : null,
      });
    },
    [root.id, search, folder, refreshRootFolders, toast],
  );

  const dropOnFolder = useCallback(
    (target, dragIds) => {
      const items = dragIds.map((i) => byId.get(i)).filter(Boolean);
      if (items.length) doMove(items, target).catch(() => {});
      selection.clear();
    },
    [byId, doMove, selection],
  );

  /* ---------------- Delete (trash) with undo ---------------- */

  const doTrash = useCallback(
    async (items) => {
      folder.remove(items.map((i) => i.id)); // optimistic
      const results = await Promise.allSettled(items.map((i) => trashFile(i.id)));
      const trashed = items.filter((_, i) => results[i].status === 'fulfilled');
      const failed = items.filter((_, i) => results[i].status === 'rejected');
      if (failed.length) {
        folder.add(failed);
        toast.error(`Couldn’t delete ${plural(failed.length, 'item')}`, { description: friendlyError(results.find((r) => r.reason)?.reason) });
      }
      if (!trashed.length) return;
      if (trashed.some(isFolder)) refreshRootFolders();
      if (lightbox) setLightbox((lb) => (lb ? { ...lb, index: Math.min(lb.index, media.length - trashed.length - 1) } : lb));
      trashed.forEach((t) => invalidate(t.id));

      toast.success(trashed.length === 1 ? `Moved “${trashed[0].name}” to trash` : `Moved ${plural(trashed.length, 'item')} to trash`, {
        duration: 7000,
        action: {
          label: 'Undo',
          onClick: async () => {
            const restored = await Promise.allSettled(trashed.map((t) => restoreFile(t.id)));
            folder.add(restored.filter((r) => r.status === 'fulfilled').map((r) => r.value));
            if (trashed.some(isFolder)) refreshRootFolders();
            const bad = restored.filter((r) => r.status === 'rejected').length;
            bad ? toast.error(`Couldn’t restore ${plural(bad, 'item')}`) : toast.success(`Restored ${plural(trashed.length, 'item')}`);
          },
        },
      });
    },
    [folder, refreshRootFolders, toast, lightbox, media.length],
  );

  const requestTrash = useCallback(
    (items) => {
      if (!items.length) return;
      // Folders take their contents with them, so confirm first.
      if (items.some(isFolder)) setConfirm({ items });
      else doTrash(items);
      selection.clear();
    },
    [doTrash, selection],
  );

  /* ---------------- Item interactions ---------------- */

  const selectedItems = useCallback(() => [...selection.selected].map((i) => byId.get(i)).filter(Boolean), [selection.selected, byId]);

  const runAction = useCallback(
    (action, target) => {
      const items = Array.isArray(target) ? target : [target];
      const first = items[0];
      switch (action) {
        case 'open':
          return openItem(first);
        case 'download':
          return items.length === 1 ? downloadOne(first) : downloadMany(items);
        case 'drive':
          return first.webViewLink && window.open(first.webViewLink, '_blank', 'noopener');
        case 'rename':
          return setRenameItem(first);
        case 'move':
          return setMoveItems(items);
        case 'delete':
          return requestTrash(items);
        default:
      }
    },
    [openItem, downloadOne, downloadMany, requestTrash],
  );

  const ctx = useMemo(
    () => ({
      isSelected: selection.isSelected,
      selectionMode: selection.count > 0,
      onItemClick: (item, e) => {
        if (e.shiftKey) return selection.toggle(item.id, { range: true });
        if (e.metaKey || e.ctrlKey || selection.count > 0) return selection.toggle(item.id);
        openItem(item);
      },
      onToggle: (item, e) => selection.toggle(item.id, { range: e?.shiftKey }),
      onOpen: openItem,
      onContextMenu: (item, e) => {
        e.preventDefault();
        e.stopPropagation();
        const items = selection.isSelected(item.id) && selection.count > 1 ? selectedItems() : [item];
        setMenu({ x: e.clientX, y: e.clientY, items });
      },
      onAction: (action, item) => runAction(action, item),
      dragIdsFor: (item) => (selection.isSelected(item.id) ? [...selection.selected] : [item.id]),
      onDropOnFolder: dropOnFolder,
    }),
    [selection, openItem, runAction, dropOnFolder, selectedItems],
  );

  /* ---------------- Keyboard shortcuts ---------------- */

  useEffect(() => {
    const onKey = (e) => {
      if (anyDialog || isTyping()) return;
      const focused = document.activeElement?.closest?.('[data-item-id]');
      const focusedItem = focused && byId.get(focused.getAttribute('data-item-id'));
      const targets = selection.count ? selectedItems() : focusedItem ? [focusedItem] : [];

      if (e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || targets.length))) {
        if (!targets.length) return;
        e.preventDefault();
        requestTrash(targets);
      } else if (e.key === 'F2') {
        if (targets.length !== 1) return;
        e.preventDefault();
        setRenameItem(targets[0]);
      } else if (e.key === 'Escape') {
        if (selection.count) selection.clear();
      } else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        selection.selectAll();
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        focusNeighbor(e.key);
      } else if (e.key === ' ' && focusedItem) {
        e.preventDefault();
        selection.toggle(focusedItem.id, { range: e.shiftKey });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anyDialog, byId, selection, selectedItems, requestTrash]);

  /* ---------------- Render ---------------- */

  const empty = !folder.loading && !folder.error && folder.items.length === 0;
  const emptyKind = search ? 'search' : filter !== 'all' ? 'filtered' : 'empty';
  const selItems = selection.count ? selectedItems() : [];
  const currentName = current.id === root.id ? 'My Gallery' : current.name;

  return (
    <div {...getRootProps({ className: 'flex min-h-screen outline-none' })}>
      <input {...getInputProps()} />

      <Sidebar
        rootId={root.id}
        folders={rootFolders}
        currentPath={search ? [rootCrumb, { id: '__search' }] : path}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileNav}
        onMobileClose={() => setMobileNav(false)}
        onNavigateRoot={goRoot}
        onOpenFolder={openTopFolder}
        onDropItems={dropOnFolder}
        onNewFolder={() => setCreating(true)}
        quota={quota}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          search={searchInput}
          onSearch={setSearchInput}
          view={view}
          onView={setView}
          sort={sortPref.sort}
          direction={sortPref.direction}
          onSort={setSortPref}
          onUpload={openPicker}
          onNewFolder={() => setCreating(true)}
          original={original}
          onOriginalChange={setOriginal}
          theme={theme}
          onThemeCycle={cycleTheme}
          onMenu={() => setMobileNav(true)}
        />

        <main className="flex-1 px-3 pb-32 pt-4 sm:px-6 md:pb-24">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Breadcrumbs
              path={path}
              search={search}
              onNavigate={(i) => setPath((p) => p.slice(0, i + 1))}
              onDropItems={(crumb, dragIds) => dropOnFolder(crumb, dragIds)}
            />
            <div className="flex items-center gap-1 self-start rounded-xl bg-slate-100 p-1 dark:bg-white/5" role="tablist" aria-label="Filter by type">
              {FILTERS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={`relative flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
                    filter === id ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {filter === id && (
                    <motion.span layoutId="filter-pill" className="absolute inset-0 rounded-lg bg-white shadow-sm dark:bg-white/10" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />
                  )}
                  <Icon className="relative h-4 w-4" />
                  <span className="relative">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${current.id}|${search}|${filter}|${view}|${sortPref.sort}|${sortPref.direction}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              {folder.loading ? (
                view === 'grid' ? <GridSkeleton /> : <ListSkeleton />
              ) : folder.error ? (
                <EmptyState kind="error" message={friendlyError(folder.error)} onRetry={folder.refresh} />
              ) : empty ? (
                <EmptyState kind={emptyKind} onUpload={openPicker} onNewFolder={() => setCreating(true)} />
              ) : view === 'grid' ? (
                <FileGrid items={folder.items} ctx={ctx} />
              ) : (
                <FileList
                  items={folder.items}
                  ctx={ctx}
                  allSelected={selection.count > 0 && selection.count === folder.items.length}
                  someSelected={selection.count > 0}
                  onSelectAll={() => (selection.count === folder.items.length ? selection.clear() : selection.selectAll())}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {!folder.loading && <LoadMore hasMore={folder.hasMore} loading={folder.loadingMore} onLoadMore={folder.loadMore} />}
        </main>
      </div>

      <DropOverlay active={isDragActive} folderName={currentName} />

      <MobileActions
        hidden={selection.count > 0}
        onUpload={openPicker}
        onNewFolder={() => setCreating(true)}
        view={view}
        onView={setView}
        sort={sortPref.sort}
        direction={sortPref.direction}
        onSort={setSortPref}
      />

      <SelectionBar
        count={selection.count}
        onClear={selection.clear}
        onSelectAll={selection.selectAll}
        canDownload={selItems.some((i) => !isFolder(i))}
        onDownload={() => (downloadMany(selItems), selection.clear())}
        onMove={() => setMoveItems(selItems)}
        onDelete={() => requestTrash(selItems)}
      />

      <UploadPanel queue={queue} />

      <ContextMenu menu={menu} onClose={() => setMenu(null)} onAction={runAction} />

      <RenameDialog open={Boolean(renameItem)} item={renameItem} onClose={() => setRenameItem(null)} onSubmit={(name) => doRename(renameItem, name)} />
      <RenameDialog open={creating} mode="create" onClose={() => setCreating(false)} onSubmit={doCreateFolder} />

      <MoveDialog
        open={Boolean(moveItems)}
        items={moveItems}
        root={rootCrumb}
        onClose={() => setMoveItems(null)}
        onMove={async (target) => {
          await doMove(moveItems, target);
          selection.clear();
        }}
      />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.items.length === 1 ? `Delete “${confirm.items[0].name}”?` : `Delete ${plural(confirm?.items.length || 0, 'item')}?`}
        description="Folders are moved to the Google Drive trash together with everything inside them. You can undo right after, or restore them from Drive’s trash for 30 days."
        confirmLabel="Move to trash"
        onClose={() => setConfirm(null)}
        onConfirm={() => doTrash(confirm.items)}
      />

      <AnimatePresence>
        {lightbox && media.length > 0 && (
          <Lightbox
            key="lightbox"
            items={media}
            index={Math.min(lightbox.index, media.length - 1)}
            originId={lightbox.originId}
            onIndexChange={(index) => setLightbox((lb) => ({ ...lb, index }))}
            onClose={() => setLightbox(null)}
            onDownload={downloadOne}
            hasMore={folder.hasMore}
            onLoadMore={folder.loadMore}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
