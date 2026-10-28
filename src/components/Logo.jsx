export default function Logo({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="dg-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6090fa" />
          <stop offset="1" stopColor="#1d3fd8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#dg-logo)" />
      <path d="M14 44l11-14 8 10 6-7 11 11z" fill="#fff" />
      <circle cx="42" cy="22" r="5" fill="#fff" />
    </svg>
  );
}
