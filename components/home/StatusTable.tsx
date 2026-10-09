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
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {presented.kind === "VERIFIED_POPULATED" ? (
              presented.rows.map((row) => (
                <tr key={`${row.covenant}-${row.facility}`} data-load-kind="VERIFIED_POPULATED">
                  <td>{row.covenant}</td>
                  <td>{row.facility}</td>
                  <td>
                    <span
                      className={
                        row.status === "Within capacity"
                          ? "home-status-pill home-status-ok"
                          : row.status === "At capacity" || row.status === "Needs review"
                            ? "home-status-pill home-status-warn"
                            : "home-status-pill"
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td>{row.headroom}</td>
                  <td>{row.trend}</td>
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
