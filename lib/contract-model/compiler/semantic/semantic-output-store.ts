/**
 * Local persistence for a semantic compilation when the experiment asks for
 * inspectable rules. A count-only record is summary diagnostic evidence.
 * It is not a reconstructed rule set and it is not a certification.
 *
 * Writes are atomic: a leftover temporary file is not a complete artifact.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export type SemanticEvidenceClass = "COMPLETE_SEMANTIC_OUTPUT" | "SUMMARY_ONLY_DIAGNOSTIC_EVIDENCE" | "PARTIAL" | "MISSING";

export interface SemanticOutputRecord {
  schema: "semantic-output.v1";
  evidenceClass: Exclude<SemanticEvidenceClass, "MISSING">;
  attemptId: string;
  compilerAlgorithmVersion: string;
  model: string;
  rules: unknown[] | null;
  definitions: unknown[] | null;
  sourceSha256: string;
  complete: boolean;
  artifactSha256?: string;
}

export interface SemanticOutputRead {
  evidenceClass: SemanticEvidenceClass;
  complete: boolean;
  hashMatches: boolean;
  record: SemanticOutputRecord | null;
  reason: string;
}

function sha256Utf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "artifactSha256").sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stable(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function semanticRecordHash(record: SemanticOutputRecord): string {
  return sha256Utf8(stable(record));
}

/** A count without the rule objects is summary evidence. Absence is MISSING. A present rule array is not summary evidence. */
export function classifySemanticEvidence(record: { rules?: unknown; evidenceClass?: string } | null | undefined): SemanticEvidenceClass {
  if (!record) return "MISSING";
  if (record.evidenceClass === "SUMMARY_ONLY_DIAGNOSTIC_EVIDENCE") return "SUMMARY_ONLY_DIAGNOSTIC_EVIDENCE";
  if (record.evidenceClass === "PARTIAL") return "PARTIAL";
  if (!Array.isArray(record.rules)) return record.evidenceClass === "COMPLETE_SEMANTIC_OUTPUT" ? "MISSING" : "SUMMARY_ONLY_DIAGNOSTIC_EVIDENCE";
  return record.evidenceClass === "COMPLETE_SEMANTIC_OUTPUT" ? "COMPLETE_SEMANTIC_OUTPUT" : "PARTIAL";
}

export function writeSemanticOutputAtomic(file: string, record: SemanticOutputRecord): { path: string; sha256: string } {
  const body: SemanticOutputRecord = { ...record, artifactSha256: semanticRecordHash(record) };
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`);
  renameSync(tmp, file);
  return { path: file, sha256: body.artifactSha256! };
}

export function readSemanticOutput(file: string): SemanticOutputRead {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return { evidenceClass: "MISSING", complete: false, hashMatches: false, record: null, reason: "MISSING: no committed artifact at this path. A temporary file is not a complete write." };
  }
  let parsed: SemanticOutputRecord;
  try {
    parsed = JSON.parse(raw) as SemanticOutputRecord;
  } catch {
    return { evidenceClass: "MISSING", complete: false, hashMatches: false, record: null, reason: "MISSING: the committed bytes are not a semantic-output record." };
  }
  const evidenceClass = classifySemanticEvidence(parsed);
  const actual = semanticRecordHash(parsed);
  const hashMatches = parsed.artifactSha256 === actual;
  const complete = evidenceClass === "COMPLETE_SEMANTIC_OUTPUT" && hashMatches && parsed.complete === true && Array.isArray(parsed.rules);
  if (!hashMatches) {
    return { evidenceClass, complete: false, hashMatches: false, record: parsed, reason: "HASH_MISMATCH: the artifact hash does not match the payload." };
  }
  return { evidenceClass, complete, hashMatches: true, record: parsed, reason: complete ? "COMPLETE_SEMANTIC_OUTPUT" : evidenceClass };
}
