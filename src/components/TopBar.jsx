import { useEffect, useRef } from 'react';
import { ArrowDownNarrowWide, ArrowUpNarrowWide, Check, ChevronDown, FolderPlus, LayoutGrid, List, Menu, Search, X } from 'lucide-react';
import { Dropdown, Segmented, Switch } from './ui';

const SORTS = [
  { id: 'name', label: 'Name' },
  { id: 'date', label: 'Date modified' },
  { id: 'size', label: 'Size' },
];

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'images', label: 'Photos' },
  { id: 'videos', label: 'Videos' },
];

export function ViewToggle({ view, onChange }) {
  return (
    <Segmented
      label="View"
      layoutId="view-pill"
      value={view}
      onChange={onChange}
      options={[
        { id: 'grid', icon: LayoutGrid, ariaLabel: 'Grid view' },
        { id: 'list', icon: List, ariaLabel: 'List view' },
      ]}
    />
  );
}

export function SortMenu({ sort, direction, onChange }) {
  const current = SORTS.find((s) => s.id === sort);
  const DirIcon = direction === 'asc' ? ArrowUpNarrowWide : ArrowDownNarrowWide;
  return (
    <Dropdown
      width="w-56"
      trigger={({ toggle, open }) => (
        <button
          className={`flex h-10 items-center gap-2 rounded-full px-3.5 text-[14px] text-muted transition-colors hover:bg-surface hover:text-ink ${open ? 'bg-surface text-ink' : ''}`}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Sort by ${current?.label}`}
        >
          <DirIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{current?.label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="label-caps px-3 pb-1 pt-2 text-muted">Sort by</p>
          {SORTS.map((s) => (
            <button key={s.id} role="menuitemradio" aria-checked={sort === s.id} className="menu-item" onClick={() => (onChange({ sort: s.id, direction }), close())}>
              <span className="flex-1">{s.label}</span>
              {sort === s.id && <Check className="h-4 w-4 text-accent" />}
            </button>
          ))}
          <div className="mx-3 my-1 h-px bg-ink/[0.06]" />
          {[
            { id: 'asc', label: sort === 'name' ? 'A → Z' : sort === 'date' ? 'Oldest first' : 'Smallest first' },
            { id: 'desc', label: sort === 'name' ? 'Z → A' : sort === 'date' ? 'Newest first' : 'Largest first' },
          ].map((d) => (
            <button key={d.id} role="menuitemradio" aria-checked={direction === d.id} className="menu-item" onClick={() => (onChange({ sort, direction: d.id }), close())}>
              <span className="flex-1">{d.label}</span>
              {direction === d.id && <Check className="h-4 w-4 text-accent" />}
            </button>
          ))}
        </>
      )}
    </Dropdown>
  );
}

/** Blue pill with a small attached options menu (original-quality toggle). */
export function UploadButton({ onUpload, original, onOriginalChange }) {
  return (
    <div className="flex shrink-0">
      <button className="btn-primary h-11 rounded-r-none pl-6 pr-4 text-[16px]" onClick={onUpload}>
        Upload
      </button>
      <Dropdown
        width="w-72"
        trigger={({ toggle, open }) => (
          <button
            className="btn-primary h-11 rounded-l-none border-l border-white/25 pl-2.5 pr-3.5"
            onClick={toggle}
            aria-label="Upload options"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <div className="p-1">
            <button className="menu-item mb-1" onClick={() => (onUpload(), close())}>
              Choose photos &amp; videos…
            </button>
            <div className="rounded-xl bg-surface p-3.5">
              <Switch
                checked={original}
                onChange={onOriginalChange}
                label="Original quality"
                description={original ? 'Images upload untouched.' : 'Images are resized to 2560px (85% quality) to save space.'}
              />
            </div>
          </div>
        )}
      </Dropdown>
    </div>
  );
}

/** Search pill with ⌘K / Ctrl+K and "/" to focus. */
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
    <div className="relative w-full lg:w-60 xl:w-72">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && (onChange(''), e.currentTarget.blur())}
        placeholder="Search"
        className="h-11 w-full rounded-full bg-surface pl-10 pr-10 text-[16px] text-ink placeholder:text-muted transition-shadow focus:outline-none focus:ring-2 focus:ring-accent [&::-webkit-search-cancel-button]:hidden"
        aria-label="Search by name"
      />
      {value && (
        <button className="icon-btn absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2" onClick={() => onChange('')} aria-label="Clear search">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Page header: title, counts, search, upload, and a quiet toolbar beneath. */
export default function TopBar({
  crumbs,
  title,
  subtitle,
  search,
  onSearch,
  onUpload,
  original,
  onOriginalChange,
  onMenu,
  filter,
  onFilter,
  sort,
  direction,
  onSort,
  view,
  onView,
  onNewFolder,
  showSort = true,
}) {
  return (
    <header className="px-4 pt-5 sm:px-8 md:px-12 md:pt-12">
      <div className="mb-4 flex items-center gap-2 md:hidden">
        <button className="icon-btn -ml-2 h-10 w-10 text-ink" onClick={onMenu} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {crumbs}
          <h1 className="truncate text-[30px] leading-tight md:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-1 text-[17px] text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 lg:pt-1.5">
          <SearchBox value={search} onChange={onSearch} />
          <UploadButton onUpload={onUpload} original={original} onOriginalChange={onOriginalChange} />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-3">
        <Segmented label="Filter by type" layoutId="filter-pill" value={filter} onChange={onFilter} options={FILTERS} />
        <div className="ml-auto flex items-center gap-1">
          {onNewFolder && (
            <button className="icon-btn h-10 w-10" onClick={onNewFolder} aria-label="New folder here" title="New folder here">
              <FolderPlus className="h-[18px] w-[18px]" />
            </button>
          )}
          {showSort && <SortMenu sort={sort} direction={direction} onChange={onSort} />}
          <ViewToggle view={view} onChange={onView} />
        </div>
      </div>
    </header>
  );
}
