/**
 * Adapter for Amendment Chain Research published exports (peer WS).
 * PCI does not modify the production amendment compiler.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PeerLoadResult } from "./types";

export interface AmendmentChainView {
  schemaVersion: string;
  chainCount: number;
  beforeAfterCount: number;
  path: string;
}

const DEFAULT_PATHS = [
  "docs/amendment-chain-research/knowledge-factory-export/amendment-chains-export.json",
  "docs/amendment-chain-research/corpus-index.json",
  "lib/precedent-comparison/adapters/fixtures/amendment-chains.sample.json",
];

export function loadAmendmentChainResearch(baseDir: string = process.cwd(), extraPaths: string[] = []): PeerLoadResult<AmendmentChainView> {
  const tried: string[] = [];
  for (const rel of [...extraPaths, ...DEFAULT_PATHS]) {
    const abs = join(baseDir, rel);
    tried.push(abs);
    if (!existsSync(abs)) continue;
    try {
      const raw = JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
      const isSample = rel.includes("adapters/fixtures/");
      const chains = (raw.chains as unknown[] | undefined) ?? (raw.records as unknown[] | undefined) ?? [];
      const beforeAfter = (raw.beforeAfter as unknown[] | undefined) ?? [];
      return {
        peer: "WS-ACR",
        availability: isSample ? "UNAVAILABLE" : "AVAILABLE",
        pathTried: tried,
        data: isSample
          ? null
          : {
              schemaVersion: String(raw.schemaVersion ?? "amendment-chain-research"),
              chainCount: Array.isArray(chains) ? chains.length : Number(raw.chainCount ?? 0),
              beforeAfterCount: Array.isArray(beforeAfter) ? beforeAfter.length : Number(raw.beforeAfterCount ?? 0),
              path: rel,
            },
        note: isSample
          ? `ACR sample fixture only at ${rel} — published export not mounted`
          : `ACR export visible at ${rel}`,
      };
    } catch (err) {
      return {
        peer: "WS-ACR",
        availability: "SCHEMA_MISMATCH",
        pathTried: tried,
        data: null,
        note: `failed to parse ${rel}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  return {
    peer: "WS-ACR",
    availability: "UNAVAILABLE",
    pathTried: tried,
    data: null,
    note: "Amendment Chain Research export not in worktree — amendment-version claims remain local documentRole heuristics",
  };
}
