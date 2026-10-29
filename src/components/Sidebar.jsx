import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Monitor, Moon, Sun, X } from 'lucide-react';
import { DRAG_TYPE, readDragIds } from '../lib/dnd';
import { useAuth } from '../hooks/useAuth';
import QuotaBar from './QuotaBar';
import Logo from './Logo';

// Folder dots cycle through muted tones so neighbours read as distinct.
const DOTS = ['#c9a36b', '#7f9cc6', '#8fb08a', '#c98aa2', '#a597c9', '#c99a80'];

function dropProps(onDropItems, setOver) {
  if (!onDropItems) return {};
  return {
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e) => {
      setOver(false);
      const ids = readDragIds(e);
      if (ids) {
        e.preventDefault();
        onDropItems(ids);
      }
    },
  };
}

function NavItem({ label, active, onClick, onDropItems, dot }) {
  const [over, setOver] = useState(false);
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      {...dropProps(onDropItems, setOver)}
      className={`relative flex h-11 w-full items-center gap-3 rounded-xl px-4 text-left text-[16px] text-ink transition-colors ${
        over ? 'bg-accent-soft ring-2 ring-accent' : active ? '' : 'hover:bg-ink/[0.04]'
      }`}
    >
      {active && !over && (
        <motion.span layoutId="sidebar-active" className="absolute inset-0 rounded-xl bg-card shadow-pill" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
      )}
      {dot && <span className="relative h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />}
      <span className="relative min-w-0 flex-1 truncate">{label}</span>
      {over && <span className="relative text-[12px] text-accent-link">Move here</span>}
    </button>
  );
}

const THEMES = { system: { icon: Monitor, label: 'System' }, light: { icon: Sun, label: 'Light' }, dark: { icon: Moon, label: 'Dark' } };
const NEXT = { system: 'light', light: 'dark', dark: 'system' };

function ThemeButton({ theme, onCycle }) {
  const { icon: Icon, label } = THEMES[theme] || THEMES.system;
  const text = `Appearance: ${label}. Switch to ${THEMES[NEXT[theme] || 'light'].label}`;
  return (
    <button className="icon-btn h-8 w-8 text-muted-side hover:bg-ink/[0.05]" onClick={onCycle} aria-label={text} title={text}>
      <motion.span key={theme} initial={{ rotate: -90, scale: 0.6, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
        <Icon className="h-4 w-4" />
      </motion.span>
    </button>
  );
}

function Account() {
  const { user, signOut } = useAuth();
  const [imgOk, setImgOk] = useState(true);
  const initials = (user?.name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="flex items-center gap-3">
      {user?.picture && imgOk ? (
        <img src={user.picture} alt="" referrerPolicy="no-referrer" onError={() => setImgOk(false)} className="h-8 w-8 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-page">{initials}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{user?.name}</p>
        <p className="truncate text-[12px] text-muted-side">{user?.email}</p>
      </div>
      <button className="icon-btn h-8 w-8 text-muted-side hover:bg-ink/[0.05]" onClick={signOut} aria-label="Sign out" title="Sign out">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

function SidebarBody({ rootId, folders, active, onNavigate, onOpenFolder, onDropItems, onNewFolder, quota, theme, onThemeCycle, onClose }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-7 pb-6 pt-7">
        <Logo />
        <span className="text-[19px] font-semibold tracking-[-0.02em]">DriveGallery</span>
        <span className={onClose ? 'ml-auto' : '-mr-2 ml-auto'}>
          <ThemeButton theme={theme} onCycle={onThemeCycle} />
        </span>
        {onClose && (
          <button className="icon-btn h-8 w-8 text-muted-side hover:bg-ink/[0.05]" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-thin" aria-label="Library">
        <div className="space-y-0.5">
          <NavItem label="All media" active={active === 'all'} onClick={() => onNavigate('all')} onDropItems={(ids) => onDropItems({ id: rootId, name: 'All media' }, ids)} />
          <NavItem label="Recents" active={active === 'recents'} onClick={() => onNavigate('recents')} />
          <NavItem label="Favorites" active={active === 'favorites'} onClick={() => onNavigate('favorites')} />
        </div>

        <h2 className="label-caps px-4 pb-2 pt-8 font-medium tracking-[0.08em] text-muted-side">Folders</h2>
        <div className="space-y-0.5">
          <AnimatePresence initial={false}>
            {folders.map((f, i) => (
              <motion.div key={f.id} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}>
                <NavItem label={f.name} dot={DOTS[i % DOTS.length]} active={active === f.id} onClick={() => onOpenFolder(f)} onDropItems={(ids) => onDropItems(f, ids)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <button onClick={onNewFolder} className="mt-1 flex h-11 items-center rounded-xl px-4 text-[16px] text-accent-link hover:underline">
          + New folder
        </button>
      </nav>

      <div className="space-y-6 px-7 pb-7 pt-4">
        <QuotaBar quota={quota} />
        <Account />
      </div>
    </div>
  );
}

/** Desktop: fixed 260px sidebar. Mobile: slide-in drawer. */
export default function Sidebar({ mobileOpen, onMobileClose, ...props }) {
  const close = (fn) => (...args) => (fn(...args), onMobileClose());
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 bg-side md:block">
        <SidebarBody {...props} />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div className="absolute inset-0 bg-black/20 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onMobileClose} />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-side shadow-float"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            >
              <SidebarBody
                {...props}
                onClose={onMobileClose}
                onNavigate={close(props.onNavigate)}
                onOpenFolder={close(props.onOpenFolder)}
                onNewFolder={close(props.onNewFolder)}
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
