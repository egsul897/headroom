"use client";

import { useState } from "react";
import { Chip } from "@/components/ui";
import type { DashboardDrilldown } from "@/lib/product/customer-intelligence/debt-intelligence";
import { DrilldownPanel } from "./DrilldownPanel";

export function MetricRow({
  label,
  value,
  status,
  statusTone = "idle",
  secondary,
  drilldown,
  defaultOpen = false,
}: {
  label: string;
  value?: string | null;
  status?: string | null;
  statusTone?: "pass" | "tight" | "navy" | "idle";
  secondary?: string | null;
  drilldown: DashboardDrilldown;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--border, #e5e7eb)" }}>
      <div className="row">
        <div className="row-label">{label}</div>
        <div className="row-value" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {value ? <span>{value}</span> : null}
          {status ? <Chip tone={statusTone}>{status}</Chip> : null}
          <button type="button" className="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Hide detail" : "Open detail"}
          </button>
        </div>
      </div>
      {secondary ? <div className="row-note">{secondary}</div> : null}
      {open ? <DrilldownPanel d={drilldown} /> : null}
    </div>
  );
}
