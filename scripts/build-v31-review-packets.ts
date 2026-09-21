/**
 * Builds the blinded V3.1 re-adjudication packets (§8).
 *
 * Each reviewer receives the same 47 cases, in a deterministic per-reviewer
 * order derived from a recorded seed, under an anonymized case id. A packet
 * carries ONLY what is needed to adjudicate: the source excerpt, the ground-
 * truth claim, the system's candidate representations with their own self-
 * reports, and provenance.
 *
 * A packet must never carry: evaluator output, any prior reviewer decision,
 * the old consensus, any threshold or aggregate score, whether a case is
 * currently failing, or any Phase-4E readiness implication. build-time
 * assertions below enforce that.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "docs/phase-3-final-closure-resolution/review-packets");
const RUBRIC = "docs/phase-3-final-closure-resolution/02-v31-atomic-surfacing-contract.json";
const RUBRIC_VERSION = "evaluation-contract-v3.1.v1";
const REVIEWERS = ["R1", "R2", "R3"] as const;
/** Recorded so the presentation order is reproducible and auditable. */
const SEED_BASE = "headroom-v3.1-readjudication:1189a1be883933c4670ca856ed67ed11db04c2d5";

interface Packet { packetId: string; gtUnitId: string; datasetKey: string; documentId: string; sectionRef: string; materiality: string; groundTruthExcerpt: string; groundTruthExcerptResolution: string; groundTruthSemanticDescription: string; groundTruthAdjudication: unknown; candidates: unknown[] }

/** Deterministic PRNG so a reviewer's order is reproducible from the seed alone. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(reviewer: string): number {
  const h = createHash("sha256").update(`${SEED_BASE}:${reviewer}`).digest();
  return h.readUInt32BE(0);
}

function shuffle<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function anonymousId(gtUnitId: string): string {
  return `CASE-${createHash("sha256").update(`${SEED_BASE}:case:${gtUnitId}`).digest("hex").slice(0, 10)}`;
}

const source = JSON.parse(readFileSync(join(ROOT, "docs/evaluation-contract-v3/08-validation-packets-BLINDED.json"), "utf8")) as { cases: Packet[] };
const cases = source.cases;
if (cases.length !== 47) throw new Error(`expected 47 frozen cases, got ${cases.length}`);

const idMap: Record<string, string> = {};
const blinded = cases.map((c) => {
  const caseId = anonymousId(c.gtUnitId);
  idMap[caseId] = c.gtUnitId;
  return {
    caseId,
    // Structural address is adjudication-necessary under V3.1 (the atomic
    // coverage question is literally about what the flag is anchored to).
    documentId: c.documentId,
    claimSectionRef: c.sectionRef,
    materiality: c.materiality,
    groundTruthClaim: c.groundTruthSemanticDescription,
    sourceExcerpt: c.groundTruthExcerpt,
    sourceExcerptResolution: c.groundTruthExcerptResolution,
    groundTruthProvenance: c.groundTruthAdjudication,
    systemOutput: c.candidates,
  };
});

/**
 * Patterns that would betray an answer, a prior decision or a target score.
 * Deliberately NOT a bare /threshold/ or /0\.9/: covenant text is full of
 * genuine legal thresholds and ratios, and stripping those would destroy the
 * evidence a reviewer needs.
 */
const FORBIDDEN = [
  /creditEligibility/i, /surfacingStatus/i, /compositeSurfacing/i, /dangerousSilentOmission/i, /derivedDiagnosticLabel/i,
  /adjudicator[ABC]\b/i, /reviewer[ABC]\b/i, /\bconsensus\b/i, /evaluatorSealed/i, /sealed[- ]?label/i,
  /agreement\s*threshold/i, /inter-?reviewer/i, /\b90\s*%/, /0\.9(0)?\s*(threshold|required)/i,
  /PHASE\s*4E/i, /readiness/i, /FULLY_SURFACED/, /NOT_SPECIFICALLY_SURFACED/, /PARTIALLY_SURFACED/, /NO_CREDIT/,
  /currently\s+fail/i, /gate\s*item/i,
];

mkdirSync(OUT, { recursive: true });
const manifest: unknown[] = [];
for (const reviewer of REVIEWERS) {
  const seed = seedFor(reviewer);
  const ordered = shuffle(blinded, mulberry32(seed));
  const packet = {
    schemaVersion: "1.0",
    rubricVersion: RUBRIC_VERSION,
    rubricPath: RUBRIC,
    reviewerCode: reviewer,
    instructions: [
      "Adjudicate each case independently, using ONLY this packet and the rubric at rubricPath.",
      "Do not consult any other artifact in this repository, and do not confer with the other reviewers.",
      "Record a rationale for every case. Where you are unsure, say so in the rationale rather than guessing.",
      "creditDecision: does the system's output constitute a substantive representation of the ground-truth claim?",
      "surfacingDecision: of the atomic propositions in this claim that need an unsafe/review warning, which ones did the system actually warn about? Answer at the level of the claim, per the rubric.",
      "List the atomic propositions you identified, and which of them you consider specifically surfaced.",
      "Use ABSTAIN only when the packet genuinely does not let you decide; say why.",
    ],
    allowedCreditDecisions: ["CREDIT", "NO_CREDIT", "ABSTAIN"],
    allowedSurfacingDecisions: ["FULLY_SURFACED", "PARTIALLY_SURFACED", "NOT_SPECIFICALLY_SURFACED", "NOT_APPLICABLE", "ABSTAIN"],
    responseSchema: "docs/phase-3-final-closure-resolution/06-reviewer-response-schema.json",
    presentationOrderSeed: `${SEED_BASE}:${reviewer}`,
    presentationOrderSeedUint32: seed,
    caseCount: ordered.length,
    cases: ordered,
  };
  const body = `${JSON.stringify(packet, null, 2)}\n`;
  // The blinding check runs over the EVIDENCE, not over the rubric's own
  // allowed-decision vocabulary, which a reviewer obviously must be given.
  const evidence = JSON.stringify(ordered);
  for (const re of FORBIDDEN) {
    if (re.test(evidence)) throw new Error(`BLINDING VIOLATION in ${reviewer}: evidence matches ${re}`);
  }
  writeFileSync(join(OUT, `${reviewer}.json`), body);
  manifest.push({ reviewer, file: `review-packets/${reviewer}.json`, caseCount: ordered.length, sha256: createHash("sha256").update(body).digest("hex"), presentationOrderSeed: `${SEED_BASE}:${reviewer}`, firstFiveCaseIds: ordered.slice(0, 5).map((c) => c.caseId) });
  console.error(`${reviewer}: ${ordered.length} cases`);
}

writeFileSync(join(OUT, "_case-id-map-DO-NOT-OPEN-BEFORE-REVIEW.json"), `${JSON.stringify({ warning: "Reviewers must not open this file. It maps anonymized case ids back to ground-truth unit ids and exists only so the import step and future auditors can reproduce the mapping.", map: idMap }, null, 2)}\n`);
writeFileSync(join(ROOT, "docs/phase-3-final-closure-resolution/05-blinded-reviewer-packet-manifest.json"), `${JSON.stringify({
  artifact: "§8 — blinded re-adjudication packet manifest",
  generatedAt: new Date().toISOString(),
  builtBy: "scripts/build-v31-review-packets.ts",
  sourcePackets: { path: "docs/evaluation-contract-v3/08-validation-packets-BLINDED.json", sha256: createHash("sha256").update(readFileSync(join(ROOT, "docs/evaluation-contract-v3/08-validation-packets-BLINDED.json"))).digest("hex"), modified: false },
  rubricVersion: RUBRIC_VERSION,
  caseCount: cases.length,
  seedBase: SEED_BASE,
  blindingAssertions: {
    enforcedAtBuildTime: true,
    forbiddenPatterns: FORBIDDEN.map((r) => r.source),
    whatIsWithheld: ["evaluator output", "prior Reviewer A/B/C decisions", "the old consensus", "every threshold and aggregate score", "whether a case currently fails", "Phase-4E readiness implications"],
    whatIsProvided: ["anonymized case id", "source excerpt", "ground-truth claim", "the claim's structural address", "the system's candidate representations and their own self-reports", "provenance", "the V3.1 rubric", "allowed decisions", "required rationale fields"],
  },
  presentationOrder: "deterministically shuffled per reviewer from the recorded seed; the seed is stored in each packet so the order is reproducible",
  reviewers: manifest,
}, null, 2)}\n`);
console.error("wrote manifest");
