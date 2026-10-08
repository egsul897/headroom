import { sha256Text } from "./hash";
import type { SourceToCovenantRecord } from "./types";
import { DATASET_SCHEMA_VERSION } from "./types";

export interface ValidationProblem {
  exampleId: string;
  code: string;
  message: string;
}

const CONTAMINATION_DEFAULTS = {
  excludeFromClaudeAcceptanceCorpus: true as const,
  excludeFromVerifierFewShots: true as const,
  excludeFromCompilerPromptFewShots: true as const,
  usageRightsReviewRequiredBeforeSft: true as const,
};

export function validateRecord(record: SourceToCovenantRecord): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  const id = record.exampleId || "(missing-id)";

  if (!record.exampleId) problems.push({ exampleId: id, code: "MISSING_ID", message: "exampleId required" });
  if (record.schemaVersion !== DATASET_SCHEMA_VERSION) {
    problems.push({ exampleId: id, code: "SCHEMA_VERSION", message: `expected ${DATASET_SCHEMA_VERSION}` });
  }
  if (!record.input?.exactText || record.input.exactText.trim().length < 20) {
    problems.push({ exampleId: id, code: "EMPTY_OR_TINY_WINDOW", message: "controlling context must be complete, not a tiny snippet" });
  }
  if (record.input?.exactText) {
    const expected = sha256Text(record.input.exactText);
    if (record.input.windowSha256 !== expected) {
      problems.push({ exampleId: id, code: "WINDOW_HASH_MISMATCH", message: "windowSha256 does not match exactText" });
    }
  }
  if (!record.document?.sourceFixturePath) {
    problems.push({ exampleId: id, code: "MISSING_FIXTURE_PATH", message: "sourceFixturePath required" });
  }
  if (!record.structural?.sectionRef) {
    problems.push({ exampleId: id, code: "MISSING_SECTION_REF", message: "structural.sectionRef required" });
  }
  if (!record.output?.verificationStatus) {
    problems.push({ exampleId: id, code: "MISSING_VERIFICATION_STATUS", message: "output.verificationStatus required" });
  }
  if (record.output?.verificationStatus === "HUMAN_SOURCE_VERIFIED" && record.authoringMethod === "SYNTHETIC_NEGATIVE" && record.polarity !== "NEGATIVE") {
    problems.push({ exampleId: id, code: "VERIFIED_SYNTHETIC", message: "synthetic positives cannot be HUMAN_SOURCE_VERIFIED" });
  }
  if (!record.toolVersions?.pinsAreNotLabelAuthority) {
    problems.push({ exampleId: id, code: "PINS_AS_AUTHORITY", message: "tool version pins must declare pinsAreNotLabelAuthority: true" });
  }
  const c = record.contaminationRestrictions;
  for (const [k, v] of Object.entries(CONTAMINATION_DEFAULTS)) {
    if (!c || (c as Record<string, unknown>)[k] !== v) {
      problems.push({ exampleId: id, code: "CONTAMINATION_GUARD", message: `contaminationRestrictions.${k} must be ${v}` });
    }
  }
  if (record.split === "eval-heldout" && !record.document.issuerId) {
    problems.push({ exampleId: id, code: "HELDOUT_MISSING_ISSUER", message: "held-out records require issuerId" });
  }
  // Safety: verified labels must not claim they were copied from the compiler.
  const notes = (record.output?.labelNotes ?? "").toLowerCase();
  if (notes.includes("copied from compiler") || notes.includes("compiler ground truth")) {
    problems.push({ exampleId: id, code: "COMPILER_AS_GT", message: "label notes must not treat compiler output as ground truth" });
  }
  return problems;
}

export function validateCorpus(records: readonly SourceToCovenantRecord[]): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    if (seen.has(r.exampleId)) {
      problems.push({ exampleId: r.exampleId, code: "DUPLICATE_ID", message: "duplicate exampleId in corpus" });
    }
    seen.add(r.exampleId);
    problems.push(...validateRecord(r));
  }
  return problems;
}
