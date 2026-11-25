export function OwlMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M18 24c0-8 6-16 14-16s14 8 14 16c2-6 8-8 12-6-2 6-2 10-1 14 4 2 7 7 7 13 0 10-8 17-18 17H22C12 62 4 55 4 45c0-6 3-11 7-13 1-4 1-8-1-14 4-2 10 0 12 6z"
      />
      <circle cx="25" cy="36" r="5" fill="#fbf7f0" />
      <circle cx="39" cy="36" r="5" fill="#fbf7f0" />
      <circle cx="25" cy="36.5" r="2" fill="currentColor" />
      <circle cx="39" cy="36.5" r="2" fill="currentColor" />
      <path fill="#fbf7f0" d="M32 40.5 36 47 28 47z" />
    </svg>
  )
}

export function SealMark({ label, broken }: { label: string; broken?: boolean }) {
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={label}>
      <defs>
        <path id="seal-round" d="M100 22a78 78 0 1 1 0 156 78 78 0 0 1 0-156" />
      </defs>
      <circle cx="100" cy="100" r="98" fill="#6d221f" />
      <circle cx="100" cy="100" r="90" fill="#8c2e2b" />
      <circle cx="78" cy="74" r="28" fill="#a34742" opacity="0.45" />
      <circle cx="100" cy="100" r="78" fill="none" stroke="#f0d7c4" strokeWidth="1.5" />
      <text fill="#f6e7d8" fontSize="11" letterSpacing="2.4" fontFamily="Outfit, sans-serif">
        <textPath href="#seal-round" startOffset="8%">
          {label}
        </textPath>
      </text>
      <g transform="translate(68 70)" fill="#f6e7d8">
        <ellipse cx="32" cy="34" rx="22" ry="18" />
        <path d="M14 28c2-12 8-20 14-18 2 8 1 14-2 18-6-2-10-1-12 0z" />
        <path d="M50 28c-2-12-8-20-14-18-2 8-1 14 2 18 6-2 10-1 12 0z" />
        <circle cx="24" cy="32" r="4" fill="#8c2e2b" />
        <circle cx="40" cy="32" r="4" fill="#8c2e2b" />
        <path d="M32 36 36 43 28 43z" fill="#8c2e2b" />
      </g>
      {broken ? (
        <path d="M36 28 92 150" stroke="#f3eee4" strokeWidth="8" strokeLinecap="round" />
      ) : null}
    </svg>
  )
}
