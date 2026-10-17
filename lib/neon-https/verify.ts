/**
 * Per-table Neon HTTPS row counts.
 */

import type { NeonHttpsExecutor } from "../covenant-learning-factory/store/neon-transport";
import { VERIFY_TABLES, countTablesOverHttps } from "./precedent-import";

export async function verifyNeonHttps(
  executor: NeonHttpsExecutor,
): Promise<{
  ok: boolean;
  transport: "https";
  tables: Record<string, number | null>;
  generatedAt: string;
}> {
  const tables = await countTablesOverHttps(executor, VERIFY_TABLES);
  const anyPresent = Object.values(tables).some((n) => typeof n === "number");
  return {
    ok: anyPresent,
    transport: "https",
    tables,
    generatedAt: new Date().toISOString(),
  };
}
