/**
 * Adapter for WS-CDA Covenant Dependency Atlas published exports.
 *
 * Looks for peer-owned export paths; does not copy or mutate atlas sources.
 * Regex-only local heuristics are never labeled as atlas-resolved edges.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PeerLoadResult } from "./types";

export interface AtlasEdgeView {
  edgeId: string;
  kind: string;
  fromNodeId: string;
  toNodeId: string;
  resolution: "RESOLVED" | "UNRESOLVED" | "AMBIGUOUS" | string;
  evidenceClass: string;
  rationale: string;
  sharedBasketKey: string | null;
  unresolvedReason?: string | null;
  fromLabel?: string | null;
  toLabel?: string | null;
  sectionRef?: string | null;
}

export interface AtlasDatasetView {
  schemaVersion: string;
  edges: AtlasEdgeView[];
  nodes?: Array<{ nodeId: string; label: string; sectionRef: string | null; documentId: string }>;
}

const DEFAULT_PATHS = [
  "tests/fixtures/covenant-dependency-atlas/export/atlas-dataset.json",
  "docs/covenant-dependency-atlas/export/atlas-dataset.json",
  "lib/precedent-comparison/adapters/fixtures/atlas-dataset.sample.json",
];

export function loadDependencyAtlas(baseDir: string = process.cwd(), extraPaths: string[] = []): PeerLoadResult<AtlasDatasetView> {
  const tried: string[] = [];
  for (const rel of [...extraPaths, ...DEFAULT_PATHS]) {
    const abs = join(baseDir, rel);
    tried.push(abs);
    if (!existsSync(abs)) continue;
    try {
      const raw = JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
      const edges = (raw.edges as AtlasEdgeView[] | undefined) ?? [];
      if (!Array.isArray(edges)) {
        return {
          peer: "WS-CDA",
          availability: "SCHEMA_MISMATCH",
          pathTried: tried,
          data: null,
          note: `file present but edges[] missing: ${rel}`,
        };
      }
      return {
        peer: "WS-CDA",
        availability: "AVAILABLE",
        pathTried: tried,
        data: {
          schemaVersion: String(raw.schemaVersion ?? raw.atlasSchemaVersion ?? "unknown"),
          edges,
          nodes: raw.nodes as AtlasDatasetView["nodes"],
        },
        note: `loaded ${edges.length} edges from ${rel}`,
      };
    } catch (err) {
      return {
        peer: "WS-CDA",
        availability: "SCHEMA_MISMATCH",
        pathTried: tried,
        data: null,
        note: `failed to parse ${rel}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  return {
    peer: "WS-CDA",
    availability: "UNAVAILABLE",
    pathTried: tried,
    data: null,
    note: "Dependency Atlas export not present in this worktree — use local heuristics with REGEX_HEURISTIC resolution only",
  };
}

/** Match atlas edges relevant to a section / provision label. */
export function atlasEdgesForSection(dataset: AtlasDatasetView, sectionRef: string): AtlasEdgeView[] {
  const needle = sectionRef.replace(/^Section\s+/i, "").toLowerCase();
  return dataset.edges.filter((e) => {
    const blob = `${e.fromNodeId} ${e.toNodeId} ${e.fromLabel ?? ""} ${e.toLabel ?? ""} ${e.sectionRef ?? ""} ${e.rationale}`.toLowerCase();
    return blob.includes(needle) || (e.sharedBasketKey != null && needle.length > 0);
  });
}
