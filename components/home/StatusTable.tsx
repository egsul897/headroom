import { HOME_SLOTS } from "@/lib/home/copy";
import { EmptyCopy, RegionCard } from "./RegionCard";

const COLUMNS = ["Covenant", "Facility / Document", "Status", "Headroom", "Trend", "Next test"] as const;

export function StatusTable() {
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
            <tr>
              <td colSpan={COLUMNS.length}>
                <EmptyCopy slot={HOME_SLOTS.statusTable} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </RegionCard>
  );
}
