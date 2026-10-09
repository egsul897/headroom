import { Chip } from "@/components/ui";
import { UNKNOWN_STATE, presentStatus, type StatusLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

const COLUMNS = ["Covenant", "Facility / Document", "Status", "Headroom", "Trend", "Next test"] as const;

function statusTone(status: string): "pass" | "tight" | "idle" | "navy" {
  const s = status.toLowerCase();
  if (s.includes("healthy") || s.includes("reviewed")) return "pass";
  if (s.includes("at risk") || s.includes("rejected") || s.includes("blocking")) return "tight";
  if (s.includes("moderate") || s.includes("needs review")) return "navy";
  return "idle";
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
                <tr key={`${row.covenant}-${row.facility}`} data-load-kind="VERIFIED_POPULATED">
                  <td>{row.covenant}</td>
                  <td>{row.facility}</td>
                  <td>
                    <Chip tone={statusTone(row.status)}>{row.status}</Chip>
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
