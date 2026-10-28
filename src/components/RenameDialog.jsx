import { useEffect, useRef, useState } from 'react';
import { FolderPlus, Pencil } from 'lucide-react';
import { splitExt } from '../lib/format';
import { Modal, Spinner } from './ui';

/**
 * Name prompt used for both "Rename" and "New folder".
 * When renaming a file, only the base name is pre-selected so the extension survives.
 */
export default function RenameDialog({ open, mode = 'rename', item, onClose, onSubmit }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const isNew = mode === 'create';

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setValue(isNew ? '' : item?.name || '');
    const t = setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const isFile = item && item.mimeType !== 'application/vnd.google-apps.folder';
      const end = isFile ? splitExt(el.value)[0].length : el.value.length;
      el.setSelectionRange(0, end);
    }, 50);
    return () => clearTimeout(t);
  }, [open, item, isNew]);

  const trimmed = value.trim();
  const invalid = !trimmed || (!isNew && trimmed === item?.name);

  const submit = async (e) => {
    e.preventDefault();
    if (invalid || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={isNew ? FolderPlus : Pencil}
      title={isNew ? 'New folder' : `Rename ${item?.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file'}`}
      size="sm"
    >
      <form onSubmit={submit}>
        <input
          ref={inputRef}
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={isNew ? 'Untitled folder' : 'Name'}
          maxLength={255}
          aria-label="Name"
        />
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary min-w-[96px]" disabled={invalid || busy}>
            {busy ? <Spinner /> : isNew ? 'Create' : 'Rename'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
