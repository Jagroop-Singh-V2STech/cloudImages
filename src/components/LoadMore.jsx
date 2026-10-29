import { useEffect, useRef } from 'react';
import { Spinner } from './ui';

/** Infinite scroll sentinel with a "Load more" button as a fallback. */
export default function LoadMore({ hasMore, loading, onLoadMore }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!hasMore || !ref.current) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && onLoadMore(), { rootMargin: '600px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [hasMore, onLoadMore]);

  if (!hasMore) return null;
  return (
    <div ref={ref} className="flex justify-center py-10">
      <button className="btn-secondary" onClick={onLoadMore} disabled={loading}>
        {loading && <Spinner />}
        {loading ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}
