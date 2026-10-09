/** Ramble's mark: a sun over rolling hills with a winding path. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#1d3a2a" />
      <circle cx="20" cy="12" r="5" fill="#ee8a3f" />
      <path d="M3 24c4-6 9-8 14-6s8 1 12-3v14H3z" fill="#a9c7a0" />
      <path d="M15 29c1-3 4-4 3-7" stroke="#fcfbf7" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
