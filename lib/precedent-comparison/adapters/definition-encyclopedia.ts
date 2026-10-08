/**
 * Adapter for WS-DEF Definition Encyclopedia published exports.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PeerLoadResult } from "./types";

export interface EncyclopediaDefinitionView {
  exampleId: string;
  canonicalTerm: string;
  exactTerm: string;
  exactText: string;
  charStart: number;
  charEnd: number;
  packageKey?: string;
  documentId?: string;
  dependencies?: Array<{ exactTerm: string; normalizedTerm: string }>;
  provenanceValidated?: boolean;
}

export interface EncyclopediaView {
  schemaVersion: string;
  definitions: EncyclopediaDefinitionView[];
}

const DEFAULT_PATHS = [
  "docs/definition-encyclopedia/definitions.json",
  "docs/definition-encyclopedia/knowledge-factory-export.json",
  "lib/precedent-comparison/adapters/fixtures/definitions.sample.json",
];

export function loadDefinitionEncyclopedia(baseDir: string = process.cwd(), extraPaths: string[] = []): PeerLoadResult<EncyclopediaView> {
  const tried: string[] = [];
  for (const rel of [...extraPaths, ...DEFAULT_PATHS]) {
    const abs = join(baseDir, rel);
    tried.push(abs);
    if (!existsSync(abs)) continue;
    try {
      const raw = JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
      const definitions =
        (raw.definitions as EncyclopediaDefinitionView[] | undefined) ??
        (raw.examples as EncyclopediaDefinitionView[] | undefined) ??
        (Array.isArray(raw) ? (raw as EncyclopediaDefinitionView[]) : null);
      if (!definitions) {
        return {
          peer: "WS-DEF",
          availability: "SCHEMA_MISMATCH",
          pathTried: tried,
          data: null,
          note: `file present but definitions/examples missing: ${rel}`,
        };
      }
      return {
        peer: "WS-DEF",
        availability: "AVAILABLE",
        pathTried: tried,
        data: {
          schemaVersion: String(raw.schemaVersion ?? "unknown"),
          definitions,
        },
        note: `loaded ${definitions.length} definitions from ${rel}`,
      };
    } catch (err) {
      return {
        peer: "WS-DEF",
        availability: "SCHEMA_MISMATCH",
        pathTried: tried,
        data: null,
        note: `failed to parse ${rel}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  return {
    peer: "WS-DEF",
    availability: "UNAVAILABLE",
    pathTried: tried,
    data: null,
    note: "Definition Encyclopedia export not present — definition links remain heuristic/unresolved",
  };
}

export function encyclopediaHitsForTerm(view: EncyclopediaView, term: string): EncyclopediaDefinitionView[] {
  const t = term.toLowerCase();
  return view.definitions.filter(
    (d) => d.exactTerm.toLowerCase().includes(t) || d.canonicalTerm.toLowerCase().includes(t) || d.exactText.toLowerCase().includes(t),
  );
}
