import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  FolderPlus,
  LayoutGrid,
  List,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Search,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Dropdown, Switch } from './ui';

const SORTS = [
  { id: 'name', label: 'Name' },
  { id: 'date', label: 'Date modified' },
  { id: 'size', label: 'Size' },
];

export function ViewToggle({ view, onChange }) {
  return (
    <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/5" role="radiogroup" aria-label="View">
      {[
        { id: 'grid', icon: LayoutGrid, label: 'Grid view' },
        { id: 'list', icon: List, label: 'List view' },
      ].map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          role="radio"
          aria-checked={view === id}
          aria-label={label}
          title={label}
          onClick={() => onChange(id)}
          className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            view === id ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          {view === id && (
            <motion.span layoutId="view-pill" className="absolute inset-0 rounded-lg bg-white shadow-sm dark:bg-white/10" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
          )}
          <Icon className="relative h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export function SortMenu({ sort, direction, onChange }) {
  const current = SORTS.find((s) => s.id === sort);
  const DirIcon = direction === 'asc' ? ArrowUpNarrowWide : ArrowDownNarrowWide;
  return (
    <Dropdown
      width="w-52"
      trigger={({ toggle, open }) => (
        <button className={`btn-ghost h-9 px-2.5 ${open ? 'bg-slate-100 dark:bg-white/10' : ''}`} onClick={toggle} aria-haspopup="menu">
          <DirIcon className="h-4 w-4" />
          <span className="hidden xl:inline">{current?.label}</span>
          <ChevronDown className="hidden h-3.5 w-3.5 opacity-60 xl:inline" />
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sort by</p>
          {SORTS.map((s) => (
            <button key={s.id} className="menu-item" onClick={() => (onChange({ sort: s.id, direction }), close())}>
              <span className="flex-1">{s.label}</span>
              {sort === s.id && <Check className="h-4 w-4 text-brand-600" />}
            </button>
          ))}
          <div className="my-1 h-px bg-slate-100 dark:bg-white/10" />
          {[
            { id: 'asc', label: sort === 'name' ? 'A → Z' : sort === 'date' ? 'Oldest first' : 'Smallest first' },
            { id: 'desc', label: sort === 'name' ? 'Z → A' : sort === 'date' ? 'Newest first' : 'Largest first' },
          ].map((d) => (
            <button key={d.id} className="menu-item" onClick={() => (onChange({ sort, direction: d.id }), close())}>
              <span className="flex-1">{d.label}</span>
              {direction === d.id && <Check className="h-4 w-4 text-brand-600" />}
            </button>
          ))}
        </>
      )}
    </Dropdown>
  );
}

function ThemeButton({ theme, onCycle }) {
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const label = `Theme: ${theme} (click to change)`;
  return (
    <button className="icon-btn" onClick={onCycle} aria-label={label} title={label}>
      <motion.span key={theme} initial={{ rotate: -90, scale: 0.5, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
        <Icon className="h-[18px] w-[18px]" />
      </motion.span>
    </button>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const [imgOk, setImgOk] = useState(true);
  const initials = (user?.name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const avatar = (size) =>
    user?.picture && imgOk ? (
      <img src={user.picture} alt="" referrerPolicy="no-referrer" onError={() => setImgOk(false)} className={`${size} rounded-full object-cover`} />
    ) : (
      <span className={`${size} flex items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-indigo-600 text-xs font-semibold text-white`}>{initials}</span>
    );

  return (
    <Dropdown
      width="w-64"
      trigger={({ toggle }) => (
        <button onClick={toggle} className="flex items-center gap-2 rounded-full p-0.5 pr-0.5 ring-1 ring-transparent transition hover:ring-slate-200 lg:pr-3 dark:hover:ring-white/10" aria-label="Account menu">
          {avatar('h-8 w-8')}
          <span className="hidden max-w-[9rem] truncate text-sm font-medium lg:block">{user?.name}</span>
        </button>
      )}
    >
      {() => (
        <>
          <div className="flex items-center gap-3 px-2.5 py-2">
            {avatar('h-10 w-10')}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-slate-100 dark:bg-white/10" />
          <button className="menu-item" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </>
      )}
    </Dropdown>
  );
}

export function UploadButton({ onUpload, original, onOriginalChange }) {
  return (
    <div className="flex">
      <button className="btn-primary rounded-r-none pr-3" onClick={onUpload}>
        <Upload className="h-4 w-4" />
        <span className="hidden sm:inline">Upload</span>
      </button>
      <Dropdown
        width="w-72"
        trigger={({ toggle }) => (
          <button className="btn-primary rounded-l-none border-l border-white/20 px-2" onClick={toggle} aria-label="Upload options">
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <div className="p-1.5">
            <button className="menu-item mb-2" onClick={() => (onUpload(), close())}>
              <Upload className="h-4 w-4" /> Choose photos & videos…
            </button>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
              <Switch
                checked={original}
                onChange={onOriginalChange}
                label="Upload original quality"
                description={original ? 'Images upload untouched.' : 'Images are resized to 2560px max (85% quality) to save space.'}
              />
            </div>
          </div>
        )}
      </Dropdown>
    </div>
  );
}

/** Search field with ⌘K / Ctrl+K and "/" to focus. */
function SearchBox({ value, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea/i.test(document.activeElement?.tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="group relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-brand-500" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (onChange(''), e.currentTarget.blur())}
        placeholder="Search your gallery"
        className="input h-10 rounded-full bg-slate-100 pl-9 pr-9 ring-transparent focus:bg-white dark:bg-white/5 dark:ring-transparent dark:focus:bg-white/[0.08] [&::-webkit-search-cancel-button]:hidden"
        aria-label="Search by name"
      />
      {value ? (
        <button className="icon-btn absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2" onClick={() => onChange('')} aria-label="Clear search">
          <X className="h-4 w-4" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 px-1.5 text-[10px] font-medium text-slate-400 lg:block dark:border-white/10">
          /
        </kbd>
      )}
    </div>
  );
}

export default function TopBar({ search, onSearch, view, onView, sort, direction, onSort, onUpload, onNewFolder, original, onOriginalChange, theme, onThemeCycle, onMenu }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#0b0f17]/75">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <button className="icon-btn md:hidden" onClick={onMenu} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <SearchBox value={search} onChange={onSearch} />
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-1.5 md:flex">
            <SortMenu sort={sort} direction={direction} onChange={onSort} />
            <ViewToggle view={view} onChange={onView} />
            <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-white/10" />
            <button className="btn-secondary h-10" onClick={onNewFolder}>
              <FolderPlus className="h-4 w-4" />
              <span className="hidden xl:inline">New folder</span>
            </button>
            <UploadButton onUpload={onUpload} original={original} onOriginalChange={onOriginalChange} />
          </div>
          <ThemeButton theme={theme} onCycle={onThemeCycle} />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
