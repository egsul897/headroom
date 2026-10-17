import type { ReactNode } from "react";
import { presentStatus } from "./status-presentation";

/**
 * StatusBadge (design system, docs/DESIGN_SYSTEM.md).
 * Plain-language label, raw code on `data-status`, hint as tooltip.
 * Never invents a friendlier status than the contract — unmapped codes
 * render in the unknown tone (see status-presentation.ts).
 */
export function StatusBadge({ code, children }: { code: string; children?: ReactNode }) {
  const p = presentStatus(code);
  return (
    <span className={`status-badge status-badge-${p.tone}`} data-status={code} title={p.hint}>
      {children ?? p.label}
    </span>
  );
}
