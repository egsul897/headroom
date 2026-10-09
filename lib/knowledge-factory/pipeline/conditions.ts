/**
 * Deterministic source-backed condition / exception discovery.
 * Not semantic compilation and not legal certification.
 */

import { createHash } from "node:crypto";
import type { StructuralNodeRecord } from "../types";

export interface ConditionExceptionRecord {
  id: string;
  sourceId: string;
  kind: "CONDITION" | "EXCEPTION" | "PROVISO";
  nodeId?: string;
  charStart: number;
  charEnd: number;
  excerpt: string;
  signals: string[];
  representationLevel: "DISCOVERED_CANDIDATE";
}

const PATTERNS: { kind: ConditionExceptionRecord["kind"]; signal: string; re: RegExp }[] = [
  { kind: "CONDITION", signal: "no_default", re: /\bno\s+(?:Default|Event of Default)\b/gi },
  { kind: "CONDITION", signal: "pro_forma_compliance", re: /\bpro\s+forma\s+compliance\b/gi },
  { kind: "CONDITION", signal: "subject_to", re: /\bsubject\s+to\b/gi },
  { kind: "CONDITION", signal: "so_long_as", re: /\bso\s+long\s+as\b/gi },
  { kind: "EXCEPTION", signal: "except_as", re: /\bexcept\s+(?:as|for|that)\b/gi },
  { kind: "EXCEPTION", signal: "other_than", re: /\bother\s+than\b/gi },
  { kind: "EXCEPTION", signal: "notwithstanding", re: /\bnotwithstanding\b/gi },
  { kind: "PROVISO", signal: "provided_that", re: /\bprovided\s*(?:,\s*)?(?:that|however)\b/gi },
];

export function extractConditionsAndExceptions(
  sourceId: string,
  text: string,
  nodes: StructuralNodeRecord[],
  maxPerDoc = 400,
): ConditionExceptionRecord[] {
  const out: ConditionExceptionRecord[] = [];
  const seen = new Set<string>();

  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null && out.length < maxPerDoc) {
      const charStart = m.index;
      const charEnd = Math.min(text.length, charStart + 280);
      const key = `${p.kind}:${charStart}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const node = nodes.find((n) => !n.ambiguous && n.charStart <= charStart && charStart < n.charEnd);
      out.push({
        id: createHash("sha256").update(`${sourceId}|${key}`).digest("hex").slice(0, 20),
        sourceId,
        kind: p.kind,
        nodeId: node?.nodeId,
        charStart,
        charEnd,
        excerpt: text.slice(charStart, charEnd),
        signals: [p.signal],
        representationLevel: "DISCOVERED_CANDIDATE",
      });
    }
  }
  return out;
}
