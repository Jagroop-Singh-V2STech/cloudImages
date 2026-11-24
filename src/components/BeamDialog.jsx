import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Smartphone } from 'lucide-react';
import { beamLink } from '../lib/beam';
import { Modal, Spinner } from './ui';

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** Laptop: QR code the phone scans to pair, plus live connection state. */
export default function BeamDialog({ open, onClose, beam, folderName }) {
  const [svg, setSvg] = useState('');
  const link = beam.room ? beamLink(beam.room) : '';

  useEffect(() => {
    if (!link) return setSvg('');
    let live = true;
    // Loaded on demand: only laptops that open this dialog need the QR encoder.
    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toString(link, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1d1d1f', light: '#ffffff' } }))
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(''));
    return () => {
      live = false;
    };
  }, [link]);

  const local = LOCAL_HOSTS.test(window.location.hostname);

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Smartphone}
      title="Send from your phone"
      description={`Scan this with your phone’s camera and sign in with the same Google account. Pick photos, then flick the phone toward this screen. They’ll land in “${folderName}”.`}
      footer={
        <>
          {beam.room && (
            <button className="btn-ghost" onClick={() => (beam.stop(), onClose())}>
              Disconnect
            </button>
          )}
          <button className="btn-primary" onClick={onClose} data-autofocus>
            Done
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {/* The QR stays black on white in both themes so every camera reads it. */}
        <div className="flex h-[212px] w-[212px] items-center justify-center rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
          {svg ? (
            <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} aria-label="Pairing QR code" role="img" />
          ) : (
            <Spinner className="h-5 w-5 text-[#6e6e73]" />
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={beam.phone ? 'phone' : beam.status}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-2 text-[14px] text-muted"
            role="status"
          >
            {beam.phone ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-success" /> Phone connected. Flick away!
              </>
            ) : beam.status === 'error' ? (
              <>
                <AlertTriangle className="h-4 w-4 text-danger" /> Can’t reach the DriveGallery Worker. See the README.
              </>
            ) : beam.status === 'open' ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                </span>
                Waiting for your phone…
              </>
            ) : (
              <>
                <Spinner className="h-4 w-4" /> Connecting…
              </>
            )}
          </motion.p>
        </AnimatePresence>

        {local && (
          <p className="rounded-xl bg-warn-fill/15 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
            This page is on <b>{window.location.host}</b>, which your phone can’t open. Use the deployed site, or an HTTPS tunnel to this computer. Flick
            detection also needs HTTPS.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Laptop: floating pill while a batch from the phone is arriving. */
export function BeamIncoming({ incoming }) {
  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          className="pointer-events-none fixed inset-x-0 top-5 z-[55] flex justify-center px-4"
          initial={{ opacity: 0, y: -40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        >
          <div className="panel flex items-center gap-3 px-5 py-3" role="status">
            {incoming.done ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <motion.span animate={{ y: [0, -3, 0] }} transition={{ duration: 0.9, repeat: Infinity }}>
                <Smartphone className="h-5 w-5 text-accent" />
              </motion.span>
            )}
            <span className="text-[15px] font-medium tabular-nums">
              {incoming.done
                ? `${incoming.received} from your phone${incoming.failed ? ` · ${incoming.failed} failed` : ''}`
                : `Receiving ${Math.min(incoming.received + 1, incoming.total || 1)} of ${incoming.total || '…'} from your phone`}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
