import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';

export default function DropOverlay({ active, folderName }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-page/70 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-4 rounded-[28px] border-2 border-dashed border-accent/50"
            initial={{ scale: 1.02 }}
            animate={{ scale: 1 }}
            exit={{ scale: 1.02 }}
          />
          <motion.div
            className="flex flex-col items-center text-center"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <motion.div
              className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ArrowUp className="h-7 w-7" />
            </motion.div>
            <p className="text-[28px] font-semibold tracking-display">Drop to upload</p>
            <p className="mt-2 text-[17px] text-muted">
              Photos and videos go into <span className="text-ink">{folderName}</span>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
