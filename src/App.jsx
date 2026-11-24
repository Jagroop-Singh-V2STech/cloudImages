import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import Toasts from './components/Toasts';
import SessionExpiredDialog from './components/SessionExpiredDialog';
import Gallery from './Gallery';
import BeamSend from './components/BeamSend';
import { roomFromUrl } from './lib/beam';

export default function App() {
  const { status } = useAuth();
  const signedIn = status === 'ready';
  // Opened from the laptop's "Send from phone" QR code (?beam=<room>).
  const [beamRoom, setBeamRoom] = useState(roomFromUrl);
  const screen = !signedIn ? 'login' : beamRoom ? 'beam' : 'app';

  return (
    <>
      {/* No AnimatePresence here: waiting on the gallery's exit animation could stall
          sign-out on the gallery screen. The incoming screen just fades in. */}
      <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
        {screen === 'login' ? <Login beam={Boolean(beamRoom)} /> : screen === 'beam' ? <BeamSend room={beamRoom} onExit={() => setBeamRoom(null)} /> : <Gallery />}
      </motion.div>
      <Toasts />
      <SessionExpiredDialog />
    </>
  );
}
