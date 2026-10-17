"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { ProofDrawer, ProofTrigger } from "@/components/ux/ProofDrawer";
import { UNKNOWN_STATE, presentStatus, type StatusLoadState, type StatusRow } from "@/lib/home/load-state";
import { FIGURE_INPUTS, unloadedProof, type FigureProof } from "@/lib/ux/present";
import { EmptyCopy, RegionCard } from "./RegionCard";

function rowProof(row: StatusRow): FigureProof {
  return unloadedProof(row.covenant, row.headroom, FIGURE_INPUTS.statusHeadroom, {
    clause: row.facility?.trim() ? row.facility : null,
    review: row.status,
  });
}

export function StatusTable({ state = UNKNOWN_STATE, viewAllHref = null }: { state?: StatusLoadState; viewAllHref?: string | null }) {
  const presented = presentStatus(state);
  const rows = presented.kind === "VERIFIED_POPULATED" ? presented.rows : [];
  const visible = rows.slice(0, 5);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex == null ? null : rows[openIndex] ?? null;

  if (presented.kind !== "VERIFIED_POPULATED") {
    return (
      <RegionCard region="headroom-status" eyebrow="Headroom status">
        <EmptyCopy slot="statusTable" state={presented} />
        <ProofTrigger proof={unloadedProof("Headroom status", null, FIGURE_INPUTS.statusHeadroom)}>How we got this</ProofTrigger>
      </RegionCard>
    );
  }

    return (
      <RegionCard
        region="headroom-status"
        eyebrow="Headroom status"
        toolbar={viewAllHref ? <a className="home-view-all" href={viewAllHref}>View all</a> : null}
      >
      <div className="home-table-wrap">
        <table className="home-table">
          <thead>
            <tr>
              <th scope="col">Covenant</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">
                Headroom
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={`${row.covenant}-${row.facility}-${row.headroom}`} data-load-kind="VERIFIED_POPULATED">
                <td className="covenant-cell">
                  <button type="button" className="covenant-name" title={row.covenant} onClick={() => setOpenIndex(index)}>
                    {row.covenant}
                  </button>
                  <span className="covenant-meta" title={row.facility}>
                    {row.facility}
                  </span>
                </td>
                <td>
                  <StatusBadge status={row.status} />
                </td>
                <td className="num">
                  <button type="button" className="figure-hit" onClick={() => setOpenIndex(index)}>
                    {row.headroom}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ProofDrawer open={open != null} proof={open ? rowProof(open) : null} onClose={() => setOpenIndex(null)} />
    </RegionCard>
  );
}
