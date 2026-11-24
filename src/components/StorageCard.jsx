import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, HardDrive, LogOut, Plus, RefreshCw, Unplug, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { STORAGE_UPGRADE_URL } from '../lib/drive';
import { formatBytes } from '../lib/format';
import { Modal } from './ui';

// One color per account, used for its slice of the storage bar and its dot.
// Mid-saturation tones that read on both the light and dark sidebar.
const ACCOUNT_COLORS = ['#3b82f6', '#a855f7', '#14b8a6', '#f59e0b', '#ec4899', '#64748b'];

/** Accounts from auth merged with their quota; connected ones keep pool order (which sets the color). */
function useAccountRows(quota) {
  const { accounts } = useAuth();
  const byEmail = new Map((quota?.accounts || []).map((q) => [q.account, q]));
  let slot = 0;
  return accounts.map((a) => ({
    ...a,
    quota: byEmail.get(a.email) || null,
    color: a.connected ? ACCOUNT_COLORS[slot++ % ACCOUNT_COLORS.length] : null,
  }));
}

function levelOf(pct) {
  return pct >= 0.95 ? 'danger' : pct >= 0.8 ? 'warn' : 'ok';
}
const LEVEL_TEXT = { ok: 'text-muted-side', warn: 'text-warn', danger: 'text-danger' };

function Avatar({ account, size = 'h-8 w-8 text-[12px]', ring = '' }) {
  const [imgOk, setImgOk] = useState(true);
  const initials = (account.name || account.email || '?')
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const dim = account.connected ? '' : 'opacity-40 grayscale';
  return account.picture && imgOk ? (
    <img src={account.picture} alt="" referrerPolicy="no-referrer" onError={() => setImgOk(false)} className={`${size} ${ring} ${dim} shrink-0 rounded-full object-cover`} />
  ) : (
    <span
      className={`${size} ${ring} ${dim} flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${account.color ? '' : 'bg-muted'}`}
      style={account.color ? { backgroundColor: account.color } : undefined}
    >
      {initials}
    </span>
  );
}

/** The pool's storage bar, one colored slice per account. */
function SegmentedBar({ rows, limit, label, className = 'h-1.5' }) {
  return (
    <div
      className={`flex w-full overflow-hidden rounded-full bg-track ${className}`}
      role="img"
      aria-label={label}
    >
      {rows
        .filter((r) => r.quota?.usage > 0)
        .map((r, i) => (
          <motion.div
            key={r.email}
            className={`h-full ${i > 0 ? 'border-l border-side' : ''}`}
            style={{ backgroundColor: r.color }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(1.5, (r.quota.usage / limit) * 100)}%` }}
            transition={{ type: 'spring', stiffness: 80, damping: 20 }}
          />
        ))}
    </div>
  );
}

/** Thin bar for a single account. */
function AccountBar({ row }) {
  const { usage, limit } = row.quota;
  const pct = limit ? usage / limit : 0;
  const level = levelOf(pct);
  const fill = level === 'danger' ? 'rgb(var(--danger-fill))' : level === 'warn' ? 'rgb(var(--warn-fill))' : row.color;
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-track">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: fill }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct > 0 ? 1.5 : 0, Math.min(1, pct) * 100)}%` }}
          transition={{ type: 'spring', stiffness: 80, damping: 20 }}
        />
      </div>
      <div className={`mt-1.5 flex justify-between text-[12px] tabular-nums ${LEVEL_TEXT[level]}`}>
        <span>{limit ? `${formatBytes(usage)} of ${formatBytes(limit, 0)}` : `${formatBytes(usage)} used`}</span>
        {limit && <span>{level === 'danger' ? 'Full' : `${formatBytes(Math.max(0, limit - usage))} free`}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

/**
 * Sidebar footer: pooled usage with a bar split by account, and a row that
 * opens the account manager.
 */
export default function StorageCard({ quota, onAddAccount }) {
  const rows = useAccountRows(quota);
  const [open, setOpen] = useState(false);
  const connected = rows.filter((r) => r.connected);
  const offline = rows.length - connected.length;

  if (!quota) {
    return (
      <div className="space-y-2.5" aria-hidden>
        <div className="h-3 w-32 rounded-full bg-ink/[0.06]" />
        <div className="h-1.5 w-full rounded-full bg-track" />
        <div className="h-10 w-full rounded-xl bg-ink/[0.04]" />
      </div>
    );
  }

  const { usage, limit } = quota;
  const pct = limit ? usage / limit : 0;
  const level = levelOf(pct);
  const label = limit ? `${formatBytes(usage)} of ${formatBytes(limit, 0)} used` : `${formatBytes(usage)} used`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="label-caps text-muted-side">Storage</p>
        {limit && <p className={`text-[12px] tabular-nums ${LEVEL_TEXT[level]}`}>{Math.round(pct * 100)}%</p>}
      </div>
      <p className={`mt-1.5 text-[14px] tabular-nums ${level === 'ok' ? 'text-ink' : LEVEL_TEXT[level]}`}>{label}</p>
      {limit && <SegmentedBar rows={connected} limit={limit} label={`Pooled storage: ${label}`} className="mt-2.5 h-1.5" />}

      {level !== 'ok' && (
        <button onClick={onAddAccount} className="mt-2 text-[13px] text-accent-link hover:underline">
          Add space: link an account
        </button>
      )}

      <button
        onClick={() => setOpen(true)}
        className="-mx-2 mt-4 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-ink/[0.04]"
        aria-label="Manage Google accounts"
      >
        <span className="flex -space-x-2">
          {rows.slice(0, rows.length > 3 ? 2 : 3).map((r) => (
            <Avatar key={r.email} account={r} size="h-7 w-7 text-[11px]" ring="ring-2 ring-side" />
          ))}
          {rows.length > 3 && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/[0.08] text-[11px] font-medium text-muted ring-2 ring-side">
              +{rows.length - 2}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-ink">
            {rows.length === 1 ? rows[0].name : `${connected.length} account${connected.length === 1 ? '' : 's'}`}
          </span>
          <span className={`block truncate text-[12px] ${offline ? 'text-warn' : 'text-muted-side'}`}>
            {offline ? `${offline} to reconnect` : rows.length === 1 ? 'Add more space' : 'Manage'}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-side" />
      </button>

      <AccountsDialog open={open} onClose={() => setOpen(false)} rows={rows} quota={quota} onAddAccount={onAddAccount} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function Badge({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-ink/[0.06] text-muted',
    accent: 'bg-accent-soft text-accent-link',
    warn: 'bg-warn-fill/15 text-warn',
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

function AccountRow({ row, index }) {
  const { signOut, removeAccount, reconnectAccount } = useAuth();
  const small = 'h-8 gap-1.5 px-3 text-[13px]';
  return (
    <li className="rounded-2xl bg-surface p-4">
      <div className="flex items-start gap-3">
        <Avatar account={row} size="h-10 w-10 text-[13px]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[15px] font-medium text-ink">{row.name || row.email}</p>
            {row.primary ? (
              <Badge tone="accent">Main</Badge>
            ) : row.connected ? (
              <Badge>
                {index + 1}
                {['st', 'nd', 'rd'][index] || 'th'} for uploads
              </Badge>
            ) : (
              <Badge tone="warn">Not connected</Badge>
            )}
          </div>
          <p className="break-all text-[13px] text-muted">{row.email}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {row.primary ? (
            <button className={`btn-ghost ${small}`} onClick={signOut} title="Sign out on this device. Linked accounts stay linked." aria-label="Sign out">
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          ) : row.connected ? (
            <button className={`btn-ghost ${small}`} onClick={() => removeAccount(row.email)} aria-label={`Unlink ${row.email}`} title="Files stay in this account's Google Drive">
              <Unplug className="h-4 w-4" /> <span className="hidden sm:inline">Unlink</span>
            </button>
          ) : (
            <>
              <button className={`btn-secondary ${small}`} onClick={() => reconnectAccount(row.email)} aria-label={`Reconnect ${row.email}`}>
                <RefreshCw className="h-4 w-4" /> <span className="hidden sm:inline">Reconnect</span>
              </button>
              <button className="icon-btn h-8 w-8 text-muted" onClick={() => removeAccount(row.email)} aria-label={`Unlink ${row.email}`} title="Unlink">
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {row.quota && (
        <div className="mt-3.5">
          <AccountBar row={row} />
        </div>
      )}
      {!row.connected && <p className="mt-3 text-[13px] text-muted">Google stopped accepting this account’s access. Its files are hidden until you reconnect it.</p>}
    </li>
  );
}

/** Full account manager: per-account storage, upload order and actions. */
function AccountsDialog({ open, onClose, rows, quota, onAddAccount }) {
  const connected = rows.filter((r) => r.connected);
  const { usage, limit } = quota;
  const free = limit ? Math.max(0, limit - usage) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={HardDrive}
      size="lg"
      title="Google accounts"
      description="Free space from every linked account adds up, and accounts stay linked when you sign out. New uploads go to the first account in this list that has room."
      footer={
        <>
          <a href={STORAGE_UPGRADE_URL} target="_blank" rel="noreferrer" className="btn-ghost text-[15px]">
            Buy storage
          </a>
          <button className="btn-primary gap-1.5" onClick={onAddAccount} data-autofocus>
            <Plus className="h-4 w-4" /> Link account
          </button>
        </>
      }
    >
      <div className="mb-4 rounded-2xl bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-medium tabular-nums">
            {formatBytes(usage)} {limit ? `of ${formatBytes(limit, 0)} used` : 'used'}
          </p>
          {free != null && <p className="text-[13px] tabular-nums text-muted">{formatBytes(free)} free</p>}
        </div>
        {limit && <SegmentedBar rows={connected} limit={limit} label="Storage used by account" className="mt-3 h-2" />}
        {connected.length > 1 && (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {connected.map((r) => (
              <li key={r.email} className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                <span className="truncate">{(r.name || r.email).split(' ')[0]}</span>
                <span className="tabular-nums">{formatBytes(r.quota?.usage || 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="max-h-[50vh] space-y-2.5 overflow-y-auto scrollbar-thin">
        {rows.map((r) => (
          <AccountRow key={r.email} row={r} index={connected.indexOf(r)} />
        ))}
      </ul>
    </Modal>
  );
}
