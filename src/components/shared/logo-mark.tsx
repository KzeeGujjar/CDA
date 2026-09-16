/**
 * The brand's icon mark on its own (no container, no wordmark) — a wheel rim
 * with a bright hub at its center, reading as both a steering wheel
 * (automotive) and a network node (AI). Renders in `currentColor`, so it
 * inherits whatever text color its wrapper sets.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 12 L12 4.6 M12 12 L18.4 15.7 M12 12 L5.6 15.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.1" fill="currentColor" />
    </svg>
  );
}
