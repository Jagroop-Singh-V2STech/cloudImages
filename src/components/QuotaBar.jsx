import { motion } from 'framer-motion';
import { Cloud, ExternalLink } from 'lucide-react';
import { STORAGE_UPGRADE_URL } from '../lib/drive';
import { formatBytes } from '../lib/format';

/** "X GB of Y GB used". Amber from 80%, red from 95%. */
export default function QuotaBar({ quota, compact = false }) {
  if (!quota) {
    return (
      <div className="space-y-2 px-1">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-1.5 w-full rounded-full" />
      </div>
    );
  }
  const { usage, limit } = quota;
  const pct = limit ? usage / limit : 0;
  const tone = pct >= 0.95 ? 'bg-red-500' : pct >= 0.8 ? 'bg-amber-500' : 'bg-brand-500';
  const text = pct >= 0.95 ? 'text-red-600 dark:text-red-400' : pct >= 0.8 ? 'text-amber-600 dark:text-amber-400' : '';

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-1.5" title={limit ? `${formatBytes(usage)} of ${formatBytes(limit)} used` : `${formatBytes(usage)} used`}>
        <Cloud className={`h-5 w-5 text-slate-400 ${text}`} />
        <div className="h-1 w-8 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <motion.div className={`h-full ${tone}`} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="px-1">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Cloud className={`h-4 w-4 text-slate-400 ${text}`} />
        <span>Storage</span>
        {limit && <span className={`ml-auto text-xs tabular-nums text-slate-500 dark:text-slate-400 ${text}`}>{Math.round(pct * 100)}%</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <motion.div
          className={`h-full rounded-full ${tone}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(1, pct) * 100}%` }}
          transition={{ type: 'spring', stiffness: 80, damping: 20 }}
        />
      </div>
      <p className={`mt-2 text-xs text-slate-500 dark:text-slate-400 ${text}`}>
        {limit ? `${formatBytes(usage)} of ${formatBytes(limit, 0)} used` : `${formatBytes(usage)} used · Unlimited`}
      </p>
      {pct >= 0.8 && (
        <a
          href={STORAGE_UPGRADE_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Get more storage <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
