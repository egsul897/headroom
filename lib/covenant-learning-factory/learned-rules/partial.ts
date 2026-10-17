/**
 * Crash-safe append-only accepted-rule journal.
 * Each ACCEPT appends one JSON line to learned-rules/vN.partial.jsonl
 * before the finalized vN.json is written at epoch end.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { DEFAULT_LEARNED_RULES_DIR } from "./load";
import type { LearnedRule } from "./types";

export interface PartialAcceptRecord {
  rule: LearnedRule;
  candidateIndex: number;
  acceptedAt: string;
  errorsBefore: number;
  errorsAfter: number;
  epoch: number;
  epochRunId: string;
}

export function partialJsonlPath(version: number, dir = DEFAULT_LEARNED_RULES_DIR): string {
  return join(dir, `v${version}.partial.jsonl`);
}

export function appendPartialAccept(
  version: number,
  record: PartialAcceptRecord,
  dir = DEFAULT_LEARNED_RULES_DIR,
): string {
  mkdirSync(dir, { recursive: true });
  const path = partialJsonlPath(version, dir);
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
  return path;
}

export function loadPartialAccepts(
  version: number,
  dir = DEFAULT_LEARNED_RULES_DIR,
): PartialAcceptRecord[] {
  const path = partialJsonlPath(version, dir);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim().length > 0);
  const out: PartialAcceptRecord[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as PartialAcceptRecord);
    } catch {
      // skip corrupt trailing line from a hard kill mid-write
    }
  }
  return out;
}

export function clearPartialAccepts(version: number, dir = DEFAULT_LEARNED_RULES_DIR): void {
  const path = partialJsonlPath(version, dir);
  if (existsSync(path)) unlinkSync(path);
}

/** Rewrite partial file compactly (dedupe by ruleId, keep last). */
export function rewritePartialAccepts(
  version: number,
  records: PartialAcceptRecord[],
  dir = DEFAULT_LEARNED_RULES_DIR,
): void {
  mkdirSync(dir, { recursive: true });
  const path = partialJsonlPath(version, dir);
  const byId = new Map<string, PartialAcceptRecord>();
  for (const r of records) byId.set(r.rule.ruleId, r);
  const body = [...byId.values()]
    .sort((a, b) => a.candidateIndex - b.candidateIndex)
    .map((r) => JSON.stringify(r))
    .join("\n");
  writeFileSync(path, body ? `${body}\n` : "", "utf8");
}
