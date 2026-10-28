import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal, Spinner } from './ui';

export default function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Trash2}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-danger min-w-[96px]"
            data-autofocus
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
                onClose();
              }
            }}
          >
            {busy ? <Spinner /> : confirmLabel}
          </button>
        </>
      }
    />
  );
}
