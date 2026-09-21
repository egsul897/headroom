/**
 * Deterministic importer for completed V3.1 reviewer packets (§12).
 *
 * Validates FIRST and computes nothing until every reviewer file passes. If
 * any check fails the process exits non-zero and no metric is produced —
 * "do not calculate final metrics until the reviewer set validates".
 *
 * Usage: npx tsx scripts/import-v31-review-responses.ts
 * Reads:  docs/phase-3-final-closure-resolution/review-packets/R{1,2,3}-responses.json
 * Writes: docs/phase-3-final-closure-resolution/19-independent-review-import.json
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DIR = join(ROOT, "docs/phase-3-final-closure-resolution/review-packets");
const RUBRIC_VERSION = "evaluation-contract-v3.1.v1";
const REVIEWERS = ["R1", "R2", "R3"] as const;
const CREDIT = new Set(["CREDIT", "NO_CREDIT", "ABSTAIN"]);
const SURFACING = new Set(["FULLY_SURFACED", "PARTIALLY_SURFACED", "NOT_SPECIFICALLY_SURFACED", "NOT_APPLICABLE", "ABSTAIN"]);
/** A reviewer file must carry the reviewer's own judgement, not a copy of anything already decided. */
const LEAKAGE = [/evaluatorSealed/i, /adjudicator[ABC]\b/i, /priorConsensus/i, /compositeSurfacing/i, /dangerousSilentOmission/i];

interface Response {
  caseId: string; creditDecision: string; surfacingDecision: string;
  atomicPropositionsConsidered: string[]; specificallySurfacedAtomicPropositions: string[]; unsurfacedAtomicPropositions: string[];
  partialSurfacing: boolean; sourceAmbiguous: boolean; contractAmbiguous: boolean; abstain: boolean; rationale: string; rubricVersion: string;
}

const errors: string[] = [];
const fail = (reviewer: string, msg: string) => errors.push(`${reviewer}: ${msg}`);

const imported: { reviewer: string; sha256: string; responses: Response[] }[] = [];
const missing: string[] = [];

for (const reviewer of REVIEWERS) {
  const packetPath = join(DIR, `${reviewer}.json`);
  const responsePath = join(DIR, `${reviewer}-responses.json`);
  if (!existsSync(responsePath)) { missing.push(`review-packets/${reviewer}-responses.json`); continue; }

  const raw = readFileSync(responsePath, "utf8");
  for (const re of LEAKAGE) if (re.test(raw)) fail(reviewer, `response file contains material it must not carry: ${re}`);

  let parsed: { rubricVersion?: string; reviewerCode?: string; responses?: Response[] };
  try { parsed = JSON.parse(raw); } catch (e) { fail(reviewer, `not valid JSON: ${(e as Error).message}`); continue; }

  if (parsed.rubricVersion !== RUBRIC_VERSION) fail(reviewer, `envelope rubricVersion is ${parsed.rubricVersion}, expected ${RUBRIC_VERSION}`);
  if (parsed.reviewerCode !== reviewer) fail(reviewer, `reviewerCode is ${parsed.reviewerCode}, expected ${reviewer}`);
  if (!/^R[0-9]+$/.test(String(parsed.reviewerCode))) fail(reviewer, `malformed reviewer code ${parsed.reviewerCode}`);

  const responses = parsed.responses ?? [];
  const expected = new Set((JSON.parse(readFileSync(packetPath, "utf8")) as { cases: { caseId: string }[] }).cases.map((c) => c.caseId));

  const seen = new Set<string>();
  for (const r of responses) {
    if (!expected.has(r.caseId)) { fail(reviewer, `case ${r.caseId} is not in this reviewer's packet`); continue; }
    if (seen.has(r.caseId)) fail(reviewer, `duplicate response for ${r.caseId}`);
    seen.add(r.caseId);
    if (!CREDIT.has(r.creditDecision)) fail(reviewer, `${r.caseId}: creditDecision ${r.creditDecision} is not an allowed value`);
    if (!SURFACING.has(r.surfacingDecision)) fail(reviewer, `${r.caseId}: surfacingDecision ${r.surfacingDecision} is not an allowed value`);
    if (r.rubricVersion !== RUBRIC_VERSION) fail(reviewer, `${r.caseId}: rubricVersion ${r.rubricVersion}`);
    if (typeof r.rationale !== "string" || r.rationale.trim().length === 0) fail(reviewer, `${r.caseId}: rationale is required on every case`);
    const abstained = r.creditDecision === "ABSTAIN" || r.surfacingDecision === "ABSTAIN";
    if (r.abstain !== abstained) fail(reviewer, `${r.caseId}: abstain=${r.abstain} contradicts the decision fields`);
    if (r.surfacingDecision === "NOT_APPLICABLE" && r.creditDecision !== "CREDIT") fail(reviewer, `${r.caseId}: NOT_APPLICABLE surfacing requires a CREDIT decision`);
    if (r.partialSurfacing !== (r.surfacingDecision === "PARTIALLY_SURFACED")) fail(reviewer, `${r.caseId}: partialSurfacing contradicts surfacingDecision`);
    const considered = new Set(r.atomicPropositionsConsidered ?? []);
    if (considered.size === 0) fail(reviewer, `${r.caseId}: atomicPropositionsConsidered must not be empty`);
    for (const p of r.specificallySurfacedAtomicPropositions ?? []) if (!considered.has(p)) fail(reviewer, `${r.caseId}: surfaced proposition "${p}" is not in atomicPropositionsConsidered`);
    for (const p of r.unsurfacedAtomicPropositions ?? []) if (!considered.has(p)) fail(reviewer, `${r.caseId}: unsurfaced proposition "${p}" is not in atomicPropositionsConsidered`);
  }
  for (const caseId of expected) if (!seen.has(caseId)) fail(reviewer, `missing response for ${caseId}`);

  imported.push({ reviewer, sha256: createHash("sha256").update(raw).digest("hex"), responses });
}

const out = {
  artifact: "§12/§19 — independent reviewer import",
  at: new Date().toISOString(),
  rubricVersion: RUBRIC_VERSION,
  expectedReviewers: [...REVIEWERS],
  missingReviewerFiles: missing,
  validationErrors: errors,
  validated: missing.length === 0 && errors.length === 0,
  reviewers: imported.map((i) => ({ reviewer: i.reviewer, responseCount: i.responses.length, sha256: i.sha256 })),
  metricsComputed: false,
  note: missing.length > 0
    ? "No reviewer responses are present yet. Metrics are deliberately NOT computed. This agent must not generate these files — see §9."
    : errors.length > 0
      ? "Validation failed. Metrics are deliberately NOT computed."
      : "All reviewer files validate. Run the agreement computation next.",
};
writeFileSync(join(ROOT, "docs/phase-3-final-closure-resolution/19-independent-review-import.json"), `${JSON.stringify(out, null, 2)}\n`);
console.error(out.note);
if (!out.validated) process.exit(1);
