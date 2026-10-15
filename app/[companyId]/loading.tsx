export default function CompanyLoading() {
  return (
    <div className="shell-skeleton" aria-busy="true" aria-live="polite">
      <p className="shell-sr">Loading workspace</p>
      <div className="skeleton-bar skeleton-title" />
      <div className="skeleton-bar skeleton-line" />
      <div className="skeleton-grid">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
      <div className="skeleton-card skeleton-wide" />
    </div>
  );
}
