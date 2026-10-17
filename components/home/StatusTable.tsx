"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { DetailDrawer } from "@/components/motion/DetailDrawer";
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
      <DetailDrawer open={open != null} title={open?.covenant ?? "Detail"} onClose={() => setOpenIndex(null)}>
        {open ? (
          <dl className="drawer-facts">
            <div>
              <dt>Facility</dt>
              <dd>{open.facility}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={open.status} />
              </dd>
            </div>
            <div>
              <dt>Headroom</dt>
              <dd>{open.headroom}</dd>
            </div>
            <div>
              <dt>Trend</dt>
              <dd>{open.trend && open.trend !== "—" ? open.trend : "Unknown"}</dd>
            </div>
            <div>
              <dt>Next test</dt>
              <dd>{open.nextTest}</dd>
            </div>
          </dl>
        ) : null}
        <p className="drawer-note">These are the fields already on this row. Nothing new was loaded.</p>
      </DetailDrawer>
    </RegionCard>
  );
}
