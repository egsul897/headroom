/**
 * Adapter for Financial Definitions Precedent (WS-FDP) published dataset export.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PeerLoadResult } from "./types";

export interface FinancialDefinitionsPrecedentView {
  schemaVersion: string;
  recordCount: number;
  path: string;
}

const DEFAULT_PATHS = [
  "docs/financial-definitions-precedent/10-dataset-export.json",
  "docs/financial-definitions-precedent/02-precedent-atlas.json",
  "lib/precedent-comparison/adapters/fixtures/financial-definitions-precedent.sample.json",
];

export function loadFinancialDefinitionsPrecedent(baseDir: string = process.cwd(), extraPaths: string[] = []): PeerLoadResult<FinancialDefinitionsPrecedentView> {
  const tried: string[] = [];
  for (const rel of [...extraPaths, ...DEFAULT_PATHS]) {
    const abs = join(baseDir, rel);
    tried.push(abs);
    if (!existsSync(abs)) continue;
    try {
      const raw = JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
      const isSample = rel.includes("adapters/fixtures/");
      const records = (raw.records as unknown[] | undefined) ?? (raw.examples as unknown[] | undefined) ?? [];
      return {
        peer: "WS-FDP",
        availability: isSample ? "UNAVAILABLE" : "AVAILABLE",
        pathTried: tried,
        data: isSample
          ? null
          : {
              schemaVersion: String(raw.version ?? raw.schemaVersion ?? "financial-definitions-precedent"),
              recordCount: Array.isArray(records) ? records.length : 0,
              path: rel,
            },
        note: isSample ? `FDP sample only at ${rel}` : `FDP export visible (${Array.isArray(records) ? records.length : 0} records) at ${rel}`,
      };
    } catch (err) {
      return {
        peer: "WS-FDP",
        availability: "SCHEMA_MISMATCH",
        pathTried: tried,
        data: null,
        note: `failed to parse ${rel}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  return {
    peer: "WS-FDP",
    availability: "UNAVAILABLE",
    pathTried: tried,
    data: null,
    note: "Financial Definitions Precedent export not mounted in this worktree",
  };
}
