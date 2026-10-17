export default function Loading() {
  return (
    <div className="shell-skeleton shell-skeleton-gate" aria-busy="true" aria-live="polite">
      <p className="shell-sr">Loading</p>
      <div className="skeleton-bar skeleton-title" />
      <div className="skeleton-bar skeleton-line" />
      <div className="skeleton-card skeleton-wide" />
    </div>
  );
}
