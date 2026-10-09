import { UNKNOWN_STATE, presentStatus, type StatusLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

const COLUMNS = ["Covenant", "Facility / Document", "Status", "Headroom", "Trend", "Next test"] as const;

function statusPillClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "healthy" || s === "within capacity") return "home-status-pill home-status-ok";
  if (s === "moderate" || s === "needs review") return "home-status-pill home-status-warn";
  if (s === "at risk" || s === "at capacity") return "home-status-pill home-status-risk";
  return "home-status-pill";
}

export function StatusTable({ state = UNKNOWN_STATE }: { state?: StatusLoadState }) {
  const presented = presentStatus(state);
  return (
    <RegionCard region="headroom-status" eyebrow="Headroom status">
      <div className="home-table-wrap">
        <table className="home-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column} scope="col">
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
                    <span className={statusPillClass(row.status)}>{row.status}</span>
                  </td>
                  <td>{row.headroom}</td>
                  <td className="home-trend-cell">
                    {row.trend === "—" ? (
                      <span className="home-trend-flat" aria-hidden="true">
                        <svg viewBox="0 0 48 16" width="48" height="16">
                          <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points="0,10 8,9 16,11 24,7 32,8 40,5 48,6" />
                        </svg>
                      </span>
                    ) : (
                      row.trend
                    )}
                  </td>
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
