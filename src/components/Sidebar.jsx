import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronsLeft, ChevronsRight, Folder, FolderPlus, Home, X } from 'lucide-react';
import { DRAG_TYPE, readDragIds } from '../lib/dnd';
import QuotaBar from './QuotaBar';
import Logo from './Logo';

function NavItem({ icon: Icon, label, active, collapsed, onClick, onDropItems, fill }) {
  const [over, setOver] = useState(false);
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      onDragOver={(e) => {
        if (!onDropItems || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const ids = readDragIds(e);
        if (ids && onDropItems) {
          e.preventDefault();
          onDropItems(ids);
        }
      }}
      className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${collapsed ? 'justify-center' : ''} ${
        over
          ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-400 dark:bg-brand-500/20 dark:text-brand-200'
          : active
            ? 'font-medium text-brand-700 dark:text-white'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200'
      }`}
    >
      {active && !over && (
        <motion.span layoutId="sidebar-active" className="absolute inset-0 rounded-xl bg-brand-50 dark:bg-white/[0.08]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
      )}
      <Icon className={`relative h-[18px] w-[18px] shrink-0 ${active ? 'text-brand-600 dark:text-brand-300' : ''}`} fill={fill ? 'currentColor' : 'none'} fillOpacity={0.2} />
      {!collapsed && <span className="relative truncate">{label}</span>}
    </button>
  );
}

function SidebarBody({ rootId, folders, currentPath, collapsed, onNavigateRoot, onOpenFolder, onDropItems, onNewFolder, quota, onToggleCollapse, onClose }) {
  const activeTop = currentPath[1]?.id;
  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 items-center gap-2.5 px-4 ${collapsed ? 'justify-center px-0' : ''}`}>
        <Logo className="h-8 w-8 shrink-0" />
        {!collapsed && <span className="text-[17px] font-semibold tracking-tight">DriveGallery</span>}
        {onClose && (
          <button className="icon-btn ml-auto" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2 scrollbar-thin">
        <NavItem
          icon={Home}
          label="My Gallery"
          active={currentPath.length === 1}
          collapsed={collapsed}
          onClick={onNavigateRoot}
          onDropItems={(ids) => onDropItems({ id: rootId, name: 'My Gallery' }, ids)}
        />
        {!collapsed && (
          <div className="flex items-center justify-between px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Folders
            <button className="icon-btn -mr-2 h-7 w-7" onClick={onNewFolder} aria-label="New folder" title="New folder">
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
        )}
        {collapsed && <div className="my-3 h-px bg-slate-200 dark:bg-white/10" />}
        <AnimatePresence initial={false}>
          {folders.map((f) => (
            <motion.div key={f.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}>
              <NavItem
                icon={Folder}
                fill
                label={f.name}
                active={activeTop === f.id}
                collapsed={collapsed}
                onClick={() => onOpenFolder(f)}
                onDropItems={(ids) => onDropItems(f, ids)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {!collapsed && folders.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Folders you create appear here.</p>}
      </nav>

      <div className="border-t border-slate-200/70 p-4 dark:border-white/[0.06]">
        <QuotaBar quota={quota} compact={collapsed} />
        {onToggleCollapse && (
          <button
            className={`icon-btn mt-3 ${collapsed ? 'mx-auto flex' : '-ml-1'}`}
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

/** Desktop: collapsible rail. Mobile: slide-in drawer. */
export default function Sidebar({ mobileOpen, onMobileClose, collapsed, onToggleCollapse, ...props }) {
  return (
    <>
      <motion.aside
        className="sticky top-0 hidden h-screen shrink-0 border-r border-slate-200/70 bg-white/70 backdrop-blur-xl md:block dark:border-white/[0.06] dark:bg-[#0e131d]/80"
        animate={{ width: collapsed ? 76 : 264 }}
        initial={false}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      >
        <SidebarBody {...props} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      </motion.aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onMobileClose} />
            <motion.aside
              className="absolute inset-y-0 left-0 w-[284px] max-w-[85vw] bg-white shadow-float dark:bg-[#0e131d]"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            >
              <SidebarBody
                {...props}
                collapsed={false}
                onClose={onMobileClose}
                onNavigateRoot={() => (props.onNavigateRoot(), onMobileClose())}
                onOpenFolder={(f) => (props.onOpenFolder(f), onMobileClose())}
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
