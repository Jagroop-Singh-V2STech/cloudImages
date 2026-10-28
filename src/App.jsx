import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import Toasts from './components/Toasts';
import SessionExpiredDialog from './components/SessionExpiredDialog';
import Gallery from './Gallery';

export default function App() {
  const { status } = useAuth();
  const signedIn = status === 'ready';

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div key={signedIn ? 'app' : 'login'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {signedIn ? <Gallery /> : <Login />}
        </motion.div>
      </AnimatePresence>
      <Toasts />
      <SessionExpiredDialog />
    </>
  );
}
