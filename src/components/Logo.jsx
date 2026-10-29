import { Image } from 'lucide-react';

/** Dark rounded-square mark with a simple image glyph. */
export default function Logo({ className = 'h-9 w-9 rounded-[10px]', iconClassName = 'h-[55%] w-[55%]' }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center bg-ink text-page ${className}`} aria-hidden>
      <Image className={iconClassName} strokeWidth={1.75} />
    </span>
  );
}
