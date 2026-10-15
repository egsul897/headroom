import { presentUiStatus } from "@/components/status-presentation";

/**
 * One status treatment for every screen: plain language, a semantic tone
 * drawn from the existing palette, and the original code in `data-status`.
 */
export function StatusBadge({ status }: { status: string }) {
  const view = presentUiStatus(status);
  return (
    <span
      className={`status-badge status-badge-${view.tone}`}
      data-status={view.code}
      title={view.hint}
    >
      {view.label}
    </span>
  );
}
