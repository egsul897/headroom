/**
 * Reference-label corrections for the scoreboard (append-only log, see
 * scripts/covenant-learning-factory/scoreboard/reference-relabels.json).
 * Applied at score time; snapshot / Neon rows are never modified. Fail closed: an entry whose
 * oldLabel does not match the current label, or that names an unknown candidate, throws.
 */
import { createHash } from "node:crypto";
import type { ScoreboardSourceInput } from "./index";

export const NOT_COVENANT_SCOPE = "NOT_COVENANT_SCOPE";

export interface ReferenceRelabel {
  id: string;
  date: string;
  sourceId: string;
  locator: { candidateId: string };
  oldLabel: string;
  newLabel: string;
  quote: string;
  reason: string;
  approver: string;
}
export interface ReferenceRelabelLog {
  schema: "clf-scoreboard-reference-relabels/v1";
  entries: ReferenceRelabel[];
  ambiguousUnchanged?: unknown[];
}

export function validateRelabelLog(log: ReferenceRelabelLog): string[] {
  const bad: string[] = [];
  if (log?.schema !== "clf-scoreboard-reference-relabels/v1") bad.push("unsupported schema");
  const seen = new Set<string>();
  (log?.entries ?? []).forEach((e, i) => {
    const miss = (["id", "date", "sourceId", "oldLabel", "newLabel", "quote", "reason", "approver"] as const).filter((k) => !e[k] || typeof e[k] !== "string");
    if (!e.locator?.candidateId) miss.push("locator.candidateId" as never);
    if (miss.length) bad.push(`entry #${i} (${e.id ?? "?"}) missing ${miss.join(", ")}`);
    if (e.id !== `RL-${String(i + 1).padStart(4, "0")}`) bad.push(`entry #${i}: id must be RL-${String(i + 1).padStart(4, "0")} (append-only, contiguous)`);
    if (e.oldLabel === e.newLabel) bad.push(`entry ${e.id}: oldLabel equals newLabel`);
    const k = `${e.sourceId}\u0000${e.locator?.candidateId}`;
    if (seen.has(k)) bad.push(`entry ${e.id}: duplicate locator (append a correction only after the original is applied)`);
    seen.add(k);
  });
  return bad;
}

export function relabelLogSha256(log: ReferenceRelabelLog): string {
  const core = log.entries.map((e) => [e.sourceId, e.locator.candidateId, e.oldLabel, e.newLabel]);
  return createHash("sha256").update(JSON.stringify(core)).digest("hex");
}

export function indexRelabels(log: ReferenceRelabelLog): Map<string, ReferenceRelabel[]> {
  const bad = validateRelabelLog(log);
  if (bad.length) throw new Error(`reference relabel log invalid: ${bad.join("; ")}`);
  const m = new Map<string, ReferenceRelabel[]>();
  for (const e of log.entries) m.set(e.sourceId, [...(m.get(e.sourceId) ?? []), e]);
  return m;
}

/** Returns a copy of the input with the source's relabels applied. Throws on any mismatch. */
export function applyRelabels(input: ScoreboardSourceInput, idx: Map<string, ReferenceRelabel[]>): ScoreboardSourceInput {
  const rel = idx.get(input.source.sourceId);
  if (!rel?.length) return input;
  const byId = new Map(rel.map((e) => [e.locator.candidateId, e]));
  const hit = new Set<string>();
  const candidates = [];
  for (const c of input.candidates) {
    const e = byId.get(c.candidateId);
    if (!e) { candidates.push(c); continue; }
    if ((c.family ?? null) !== e.oldLabel) throw new Error(`relabel ${e.id}: ${input.source.sourceId}/${c.candidateId} label is ${c.family}, log says ${e.oldLabel}`);
    hit.add(e.locator.candidateId);
    if (e.newLabel === NOT_COVENANT_SCOPE) continue;
    candidates.push({ ...c, family: e.newLabel });
  }
  for (const e of rel) if (!hit.has(e.locator.candidateId)) throw new Error(`relabel ${e.id}: candidate ${e.locator.candidateId} not found in ${input.source.sourceId}`);
  return { ...input, candidates };
}
