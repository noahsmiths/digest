export function ArrowIcon({ direction = 'right' }: { direction?: 'left' | 'right' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="arrow-icon">
      <path
        d={direction === 'right' ? 'M4 12h15m-6-6 6 6-6 6' : 'M20 12H5m6-6-6 6 6 6'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand" aria-label="Digest">
      <span className="brand-mark" aria-hidden="true">d.</span>
      <span className="brand-name">digest</span>
    </span>
  );
}
