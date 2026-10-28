import { AnimatePresence, motion } from 'framer-motion';
import { UploadCloud } from 'lucide-react';

export default function DropOverlay({ active, folderName }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-brand-600/10 p-6 backdrop-blur-[3px] dark:bg-brand-500/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-4 rounded-[28px] border-2 border-dashed border-brand-500/70"
            initial={{ scale: 1.03 }}
            animate={{ scale: 1 }}
            exit={{ scale: 1.03 }}
          />
          <motion.div
            className="panel flex flex-col items-center px-10 py-8 text-center"
            initial={{ y: 20, scale: 0.9 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <motion.div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/40"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <UploadCloud className="h-8 w-8" />
            </motion.div>
            <p className="text-lg font-semibold">Drop files to upload</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Images and videos go into <span className="font-medium text-slate-700 dark:text-slate-200">{folderName}</span>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
