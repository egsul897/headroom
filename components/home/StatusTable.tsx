"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { OpenProvenanceButton, ProvenanceDrawer } from "@/components/motion/ProvenanceDrawer";
import { UNLOADED_CLAUSE, UNLOADED_HISTORY, UNLOADED_SOURCE } from "@/components/motion/provenance-copy";
import { UNKNOWN_STATE, presentStatus, type StatusLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

const COLUMNS = ["Covenant", "Facility / Document", "Status", "Headroom", "Trend", "Next test"] as const;

export function StatusTable({ state = UNKNOWN_STATE }: { state?: StatusLoadState }) {
  const presented = presentStatus(state);
  const rows = presented.kind === "VERIFIED_POPULATED" ? presented.rows : [];
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex == null ? null : rows[openIndex] ?? null;

  if (presented.kind !== "VERIFIED_POPULATED") {
    return (
      <RegionCard region="headroom-status" eyebrow="Headroom status">
        <EmptyCopy slot="statusTable" state={presented} />
        <OpenProvenanceButton title="Headroom status" note="Rows stay on the card. This panel did not load a source, a clause, or a history.">
          Open detail
        </OpenProvenanceButton>
      </RegionCard>
    );
  }

  return (
    <RegionCard region="headroom-status" eyebrow="Headroom status">
      <div className="home-table-wrap">
        <table className="home-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column} scope="col" className={column === "Headroom" ? "num" : undefined}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.covenant}-${row.facility}-${row.headroom}`} data-load-kind="VERIFIED_POPULATED">
                <td>
                  <button type="button" className="row-detail" onClick={() => setOpenIndex(index)}>
                    {row.covenant}
                  </button>
                </td>
                <td>{row.facility}</td>
                <td>
                  <StatusBadge status={row.status} />
                </td>
                <td className="num">{row.headroom}</td>
                <td className="home-trend-cell">{row.trend && row.trend !== "—" ? row.trend : "Unknown"}</td>
                <td>{row.nextTest}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ProvenanceDrawer
        open={open != null}
        title={open?.covenant ?? "Detail"}
        onClose={() => setOpenIndex(null)}
        source={open?.facility?.trim() ? open.facility : UNLOADED_SOURCE}
        clause={UNLOADED_CLAUSE}
        history={UNLOADED_HISTORY}
        note={
          open
            ? `Status ${open.status}. Headroom ${open.headroom}. Next test ${open.nextTest}. Trend ${open.trend && open.trend !== "—" ? open.trend : "Unknown"}. These are the fields already on this row. Nothing new was loaded.`
            : undefined
        }
      />
    </RegionCard>
  );
}
