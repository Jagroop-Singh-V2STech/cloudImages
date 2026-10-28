import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Multi-select over an ordered list of ids.
 *  - toggle(id)                 → add/remove one item
 *  - toggle(id, { range: true }) → Shift-click: select everything between the
 *                                  last clicked item (the anchor) and this one
 */
export function useSelection(orderedIds) {
  const [selected, setSelected] = useState(() => new Set());
  const anchor = useRef(null);

  // Forget ids that are no longer in the list (deleted, moved, folder changed).
  useEffect(() => {
    setSelected((prev) => {
      if (!prev.size) return prev;
      const ids = new Set(orderedIds);
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [orderedIds]);

  const toggle = useCallback(
    (id, { range = false } = {}) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (range && anchor.current && orderedIds.includes(anchor.current)) {
          const a = orderedIds.indexOf(anchor.current);
          const b = orderedIds.indexOf(id);
          const [from, to] = a < b ? [a, b] : [b, a];
          for (let i = from; i <= to; i++) next.add(orderedIds[i]);
        } else if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      if (!range) anchor.current = id;
    },
    [orderedIds],
  );

  const selectOnly = useCallback((id) => {
    anchor.current = id;
    setSelected(new Set([id]));
  }, []);
  const selectAll = useCallback(() => setSelected(new Set(orderedIds)), [orderedIds]);
  const clear = useCallback(() => {
    anchor.current = null;
    setSelected(new Set());
  }, []);

  return useMemo(
    () => ({
      selected,
      count: selected.size,
      isSelected: (id) => selected.has(id),
      toggle,
      selectOnly,
      selectAll,
      clear,
    }),
    [selected, toggle, selectOnly, selectAll, clear],
  );
}
