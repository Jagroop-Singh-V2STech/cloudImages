import { motion } from 'framer-motion';
import { STORAGE_UPGRADE_URL } from '../lib/drive';
import { formatBytes } from '../lib/format';

/** "X GB of 15 GB used" with a thin bar. Amber from 80%, red from 95%. */
export default function QuotaBar({ quota }) {
  if (!quota) {
    return (
      <div className="space-y-2.5" aria-hidden>
        <div className="h-3 w-32 rounded-full bg-ink/[0.06]" />
        <div className="h-1 w-full rounded-full bg-track" />
      </div>
    );
  }
  const { usage, limit } = quota;
  const pct = limit ? usage / limit : 0;
  const fill = pct >= 0.95 ? 'bg-danger-fill' : pct >= 0.8 ? 'bg-warn-fill' : 'bg-ink';
  const text = pct >= 0.95 ? 'text-danger' : pct >= 0.8 ? 'text-warn' : 'text-muted-side';
  const label = limit ? `${formatBytes(usage)} of ${formatBytes(limit, 0)} used` : `${formatBytes(usage)} used`;

  return (
    <div>
      <p className={`text-[14px] tabular-nums ${text}`}>{label}</p>
      {limit && (
        <div
          className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-track"
          role="progressbar"
          aria-label="Google storage used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct * 100)}
        >
          <motion.div
            className={`h-full rounded-full ${fill}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(1, pct) * 100}%` }}
            transition={{ type: 'spring', stiffness: 80, damping: 20 }}
          />
        </div>
      )}
      {pct >= 0.8 && (
        <a href={STORAGE_UPGRADE_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[13px] text-accent-link hover:underline">
          Get more storage
        </a>
      )}
    </div>
  );
}
