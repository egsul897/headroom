/**
 * Adapter for Negative Covenant Exception Database peer exports (when published).
 * No second exception ontology is invented here.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PeerLoadResult } from "./types";

export interface NegativeCovenantExceptionView {
  schemaVersion: string;
  exceptionCount: number;
  path: string;
}

const DEFAULT_PATHS = [
  "docs/negative-covenant-exception-database/export/exceptions.json",
  "lib/negative-covenant-exception-database/export/exceptions.json",
  "lib/precedent-comparison/adapters/fixtures/nced.sample.json",
];

export function loadNegativeCovenantExceptionDatabase(
  baseDir: string = process.cwd(),
  extraPaths: string[] = [],
): PeerLoadResult<NegativeCovenantExceptionView> {
  const tried: string[] = [];
  for (const rel of [...extraPaths, ...DEFAULT_PATHS]) {
    const abs = join(baseDir, rel);
    tried.push(abs);
    if (!existsSync(abs)) continue;
    try {
      const raw = JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
      const isSample = rel.includes("adapters/fixtures/");
      const exceptions = (raw.exceptions as unknown[] | undefined) ?? (raw.records as unknown[] | undefined) ?? [];
      return {
        peer: "WS-NCED",
        availability: isSample ? "UNAVAILABLE" : "AVAILABLE",
        pathTried: tried,
        data: isSample
          ? null
          : {
              schemaVersion: String(raw.schemaVersion ?? "nced"),
              exceptionCount: Array.isArray(exceptions) ? exceptions.length : 0,
              path: rel,
            },
        note: isSample ? `NCED sample only at ${rel}` : `NCED export visible at ${rel}`,
      };
    } catch (err) {
      return {
        peer: "WS-NCED",
        availability: "SCHEMA_MISMATCH",
        pathTried: tried,
        data: null,
        note: `failed to parse ${rel}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  return {
    peer: "WS-NCED",
    availability: "UNAVAILABLE",
    pathTried: tried,
    data: null,
    note: "Negative Covenant Exception Database export not present — exception asymmetries use local phrase heuristics only (REGEX_HEURISTIC standing)",
  };
}
