import { StatusBadge } from "@/components/StatusBadge";
import { UNKNOWN_STATE, presentStatus, type StatusLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

const COLUMNS = ["Covenant", "Facility / Document", "Status", "Headroom", "Trend", "Next test"] as const;

export function StatusTable({ state = UNKNOWN_STATE }: { state?: StatusLoadState }) {
  const presented = presentStatus(state);
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
            {presented.kind === "VERIFIED_POPULATED" ? (
              presented.rows.map((row) => (
                <tr key={`${row.covenant}-${row.facility}-${row.headroom}`} data-load-kind="VERIFIED_POPULATED">
                  <td>{row.covenant}</td>
                  <td>{row.facility}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="num">{row.headroom}</td>
                  <td className="home-trend-cell">{row.trend && row.trend !== "—" ? row.trend : "Unknown"}</td>
                  <td>{row.nextTest}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={COLUMNS.length}>
                  <EmptyCopy slot="statusTable" state={presented} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </RegionCard>
  );
}
