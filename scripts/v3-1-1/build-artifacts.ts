/**
 * Deterministic generator for docs/phase-3-v3.1-final-reconciliation/.
 *
 * Every artifact is a pure function of: the frozen V3.1 packet, the frozen V3 adjudicator
 * files, the frozen integrity-audit artifacts, the primary-source fixtures, and the
 * authored data modules in this directory. Two runs from the same inputs produce
 * byte-identical output, which 10-regression-and-determinism.json records and the
 * reconciliation tests assert.
 *
 * Nothing here writes to any frozen artifact.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { locateOperativeSection, locateDefinition, placeExcerpt } from "./source-locator";
import { EXCERPT_REPAIRS } from "./excerpt-repairs";
import { ADJUDICATIONS_BENCHMARK_CHANGE } from "./adjudications-a";
import { ADJUDICATIONS_EVIDENCE_REPAIR } from "./adjudications-b";
import { ADJUDICATIONS_SOURCE_RESOLUTION } from "./adjudications-c";
import { ADJUDICATIONS_RUBRIC_DEPENDENCY } from "./adjudications-d";
import { RUBRIC_SCREEN } from "./rubric-screen";
import { CASE_ROOT_CAUSES, DEFECT_GROUPS } from "./defect-backlog";
import { PROPOSITION_RESTATEMENTS } from "./proposition-restatements";
import { toBinarySurfacing, type Adjudication } from "./adjudication-types";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs/phase-3-v3.1-final-reconciliation");

export const BENCHMARK_VERSION = "evaluation-contract-v3.1.1";
const GENERATED_AT = "2026-09-21T00:00:00.000Z"; // fixed so regeneration is byte-identical

const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const readJson = (p: string) => JSON.parse(read(p));
const sha256 = (s: string | Buffer) => crypto.createHash("sha256").update(s).digest("hex");

const PACKET = "docs/phase-3-final-closure-resolution/review-packets/R1.json";
const AUDIT_GT = "docs/phase-3-v3.1-benchmark-integrity/03-atomic-ground-truth.json";

const SOURCE_PATHS: Record<string, string> = {
  fwrg: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
  lsb: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
  "conmed-doc-a-eighth-ar-credit-agreement":
    "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
  "doc-a": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt",
  "doc-b": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt",
  "doc-d": "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
};

const FROZEN_FILES = [
  PACKET,
  "docs/phase-3-final-closure-resolution/review-packets/R2.json",
  "docs/phase-3-final-closure-resolution/review-packets/R3.json",
  "docs/phase-3-final-closure-resolution/02-v31-atomic-surfacing-contract.json",
  "docs/phase-3-final-closure-resolution/07-consensus-contract.json",
  "docs/phase-3-final-closure-resolution/08-historical-adjudication-preservation.json",
  "docs/phase-3-final-closure-resolution/19-independent-review-import.json",
  "docs/phase-3-final-closure-resolution/20-final-agreement-metrics.json",
  "docs/phase-3-final-closure-resolution/22-phase3-final-gate.json",
  "docs/evaluation-contract-v3/05-operational-rubric.json",
  "docs/evaluation-contract-v3/07-validation-sample.json",
  "docs/evaluation-contract-v3/08-validation-packets-BLINDED.json",
  "docs/evaluation-contract-v3/09-adjudicator-a.json",
  "docs/evaluation-contract-v3/10-adjudicator-b.json",
  "docs/evaluation-contract-v3/11-adjudicator-c.json",
  "docs/evaluation-contract-v3/19-evaluator-vs-consensus.json",
  "docs/evaluation-contract-v3/_sample-labels-SEALED.json",
  "docs/phase-3-v3.1-benchmark-integrity/01-benchmark-universe.json",
  "docs/phase-3-v3.1-benchmark-integrity/02-primary-source-map.json",
  AUDIT_GT,
  "docs/phase-3-v3.1-benchmark-integrity/04-benchmark-correction-ledger.json",
  "docs/phase-3-v3.1-benchmark-integrity/04-benchmark-correction-ledger.md",
  "docs/phase-3-v3.1-benchmark-integrity/05-impact-analysis.json",
  "docs/phase-3-v3.1-benchmark-integrity/06-final-benchmark-integrity-report.md",
  ...Object.values(SOURCE_PATHS),
];

export const ALL_ADJUDICATIONS: Adjudication[] = [
  ...ADJUDICATIONS_BENCHMARK_CHANGE,
  ...ADJUDICATIONS_EVIDENCE_REPAIR,
  ...ADJUDICATIONS_SOURCE_RESOLUTION,
  ...ADJUDICATIONS_RUBRIC_DEPENDENCY,
];

/** The V3 2-of-3 majority, recomputed from the frozen adjudicator files. */
export function v3Consensus() {
  const files = ["09-adjudicator-a.json", "10-adjudicator-b.json", "11-adjudicator-c.json"].map((f) =>
    readJson(`docs/evaluation-contract-v3/${f}`),
  );
  const byUnit: Record<string, any[]> = {};
  for (const f of files) for (const r of f.results) (byUnit[r.caseId] ||= []).push(r);
  const majority = (values: string[]) => {
    const counts: Record<string, number> = {};
    for (const v of values) counts[v] = (counts[v] || 0) + 1;
    const winner = Object.keys(counts).sort().find((k) => (counts[k] ?? 0) >= 2);
    return winner ?? "NO_CONSENSUS";
  };
  const out: Record<string, { credit: string; surfacing: string; completeness: string }> = {};
  for (const [unit, rs] of Object.entries(byUnit)) {
    out[unit] = {
      credit: majority(rs.map((r) => r.creditEligibility)),
      surfacing: majority(rs.map((r) => r.surfacingStatus)),
      completeness: majority(rs.map((r) => r.representationCompleteness)),
    };
  }
  return out;
}

/** §4 — build a repaired excerpt and prove it comes from the operative provision. */
export function buildRepairs() {
  const packet = readJson(PACKET);
  const byId: Record<string, any> = {};
  for (const c of packet.cases) byId[c.caseId] = c;
  const cache: Record<string, string> = {};
  const loadSource = (documentId: string) => (cache[documentId] ||= read(SOURCE_PATHS[documentId] ?? ""));

  return EXCERPT_REPAIRS.map((repair) => {
    const frozen = byId[repair.caseId];
    const text = loadSource(frozen.documentId);
    const span =
      repair.locator.kind === "section"
        ? locateOperativeSection(text, repair.locator.key)
        : locateDefinition(text, repair.locator.key);
    if (!span) throw new Error(`no operative span for ${repair.caseId}`);

    const anchorRe = new RegExp(repair.anchor, "g");
    anchorRe.lastIndex = span.start;
    const hit = anchorRe.exec(text);
    if (!hit || hit.index >= span.end) throw new Error(`anchor did not match inside the span for ${repair.caseId}`);

    const start = hit.index;
    const end = Math.min(span.end, start + repair.maxChars);
    const repairedExcerpt = text.slice(start, end);

    const frozenPlacement = placeExcerpt(text, frozen.sourceExcerpt, span);

    return {
      caseId: repair.caseId,
      documentId: frozen.documentId,
      claimSectionRef: frozen.claimSectionRef,
      primarySourcePath: SOURCE_PATHS[frozen.documentId],
      operativeSpan: { start: span.start, end: span.end, heading: span.heading },
      spanCandidatesConsidered: span.candidates,
      frozenExcerpt: {
        length: (frozen.sourceExcerpt || "").length,
        resolutionLabel: frozen.sourceExcerptResolution,
        offsetInSource: frozenPlacement.offset,
        insideOperativeSpan: frozenPlacement.insideOperativeSpan,
        landedIn: repair.originalExcerptLandedIn,
        text: frozen.sourceExcerpt,
      },
      repairedExcerpt: {
        anchor: repair.anchor,
        offsetInSource: start,
        endOffsetInSource: end,
        length: repairedExcerpt.length,
        insideOperativeSpan: true,
        text: repairedExcerpt,
      },
      /** §4's deterministic check, stated as a proposition the tests re-assert. */
      firstOccurrenceIsNotTheOperativeSection: {
        firstOccurrenceOffset: frozenPlacement.offset,
        operativeSpanStart: span.start,
        distinct: frozenPlacement.offset !== span.start,
        distanceChars: Math.abs(span.start - frozenPlacement.offset),
      },
      claimStillCorrect: repair.claimStillCorrect,
      claimDefectFound: repair.claimDefectFound,
      note: repair.note,
    };
  });
}

/** §6 — the versioned corrected 47-case corpus. */
export function buildCorpus() {
  const packet = readJson(PACKET);
  const audit = readJson(AUDIT_GT);
  const auditByCase: Record<string, any> = {};
  for (const c of audit.cases) auditByCase[c.caseId] = c;
  const repairs = buildRepairs();
  const repairByCase: Record<string, any> = {};
  for (const r of repairs) repairByCase[r.caseId] = r;
  const adjByCase: Record<string, Adjudication> = {};
  for (const a of ALL_ADJUDICATIONS) adjByCase[a.caseId] = a;

  const cases = packet.cases
    .map((frozen: any) => {
      const auditCase = auditByCase[frozen.caseId];
      const repair = repairByCase[frozen.caseId];
      const adj = adjByCase[frozen.caseId];

      const correctedClaim = adj?.correctedGroundTruthClaim ?? frozen.groundTruthClaim;
      const claimChanged = Boolean(adj?.correctedGroundTruthClaim);

      const propositions = adj
        ? adj.propositions.map((p) => ({
            id: p.id,
            proposition: p.proposition,
            status: "SOURCE_CONFIRMED",
            sourceQuotation: p.sourceQuotation,
            independence: p.independence,
          }))
        : auditCase.propositions.map((p: any) => ({
            id: p.id,
            proposition: PROPOSITION_RESTATEMENTS[frozen.caseId]?.[p.id] ?? p.proposition,
            status: p.status,
            sourceQuotation: p.sourceQuotation,
            independence: "MATERIAL_INDEPENDENT",
            restatedFrom: PROPOSITION_RESTATEMENTS[frozen.caseId]?.[p.id] ? p.proposition : undefined,
          }));

      let status: string;
      if (claimChanged) status = "CORRECTED_FROM_PRIMARY_SOURCE";
      else if (repair) status = "EVIDENCE_REPAIRED";
      else if (auditCase.classification === "BENCHMARK_IMPRECISE_NONMATERIAL") status = "IMPRECISE_NONMATERIAL";
      else status = "VERIFIED";

      return {
        caseId: frozen.caseId,
        benchmarkVersion: BENCHMARK_VERSION,
        originalBenchmarkVersion: "evaluation-contract-v3.1.v1",
        groundTruthUnitId: auditCase.groundTruthUnitId,
        documentId: frozen.documentId,
        claimSectionRef: frozen.claimSectionRef,
        materiality: frozen.materiality,
        correctedGroundTruthClaim: correctedClaim,
        correctedSourceExcerpt: repair ? repair.repairedExcerpt.text : frozen.sourceExcerpt,
        sourceExcerptResolution: repair
          ? "RESOLVED_FROM_OPERATIVE_PROVISION"
          : frozen.sourceExcerpt
            ? frozen.sourceExcerptResolution
            : "UNRESOLVED_DESCRIPTION_ONLY",
        primarySourcePath: SOURCE_PATHS[frozen.documentId],
        primarySourceLocation: repair
          ? `offset ${repair.repairedExcerpt.offsetInSource}–${repair.repairedExcerpt.endOffsetInSource} inside the operative span [${repair.operativeSpan.start}, ${repair.operativeSpan.end})`
          : `${frozen.documentId} ${frozen.claimSectionRef}`,
        benchmarkIntegrityStatus: status,
        propositions,
        correctionProvenance: {
          changedFromV31: claimChanged || Boolean(repair),
          changeKind: claimChanged ? "CLAIM_CORRECTION" : repair ? "EVIDENCE_REPAIR" : "NONE",
          originatingAudit: "docs/phase-3-v3.1-benchmark-integrity/",
          foundBy:
            repair && ["CASE-5c33066800", "CASE-768547a920"].includes(frozen.caseId)
              ? "THIS_MISSION"
              : claimChanged && frozen.caseId === "CASE-e555117f4c"
                ? "THIS_MISSION"
                : claimChanged || repair
                  ? "PRIOR_INTEGRITY_AUDIT"
                  : null,
          supersededClaimText: claimChanged ? frozen.groundTruthClaim : null,
          supersededExcerptOffset: repair ? repair.frozenExcerpt.offsetInSource : null,
          defectType: claimChanged ? auditCase.classification : repair ? "CONTAMINATED_SOURCE_EXCERPT" : null,
        },
      };
    })
    .sort((a: any, b: any) => a.caseId.localeCompare(b.caseId));

  const semanticPayload = cases.map((c: any) => ({
    caseId: c.caseId,
    correctedGroundTruthClaim: c.correctedGroundTruthClaim,
    correctedSourceExcerpt: c.correctedSourceExcerpt,
    propositions: c.propositions,
    benchmarkIntegrityStatus: c.benchmarkIntegrityStatus,
  }));

  return { cases, benchmarkContentHash: sha256(JSON.stringify(semanticPayload)) };
}

/** §7 — every one of the 47 cases classified into exactly one bucket. */
export function buildAffectedManifest() {
  const packet = readJson(PACKET);
  const adjByCase: Record<string, Adjudication> = {};
  for (const a of ALL_ADJUDICATIONS) adjByCase[a.caseId] = a;
  const screenByCase: Record<string, any> = {};
  for (const s of RUBRIC_SCREEN) screenByCase[s.caseId] = s;

  return packet.cases
    .map((c: any) => {
      const adj = adjByCase[c.caseId];
      return {
        caseId: c.caseId,
        documentId: c.documentId,
        claimSectionRef: c.claimSectionRef,
        classification: adj ? adj.bucket : "PRIOR_ADJUDICATION_STILL_VALID",
        rubricScreen: screenByCase[c.caseId] ?? null,
      };
    })
    .sort((a: any, b: any) => a.caseId.localeCompare(b.caseId));
}

/**
 * §11 — the canonical 47-case result.
 *
 * Affected cases take the new source-grounded adjudication. Unaffected cases carry the
 * prior adjudication forward. For an unaffected NO_CREDIT case the composite surfacing
 * state is FULLY_SURFACED only where the rubric screen positively established whole-unit
 * coverage; otherwise the prior binary is carried and the composite state is recorded as
 * carried-forward so nothing is claimed that was not measured.
 */
export function buildFinalResults() {
  const packet = readJson(PACKET);
  const consensus = v3Consensus();
  const audit = readJson(AUDIT_GT);
  const unitByCase: Record<string, string> = {};
  for (const c of audit.cases) unitByCase[c.caseId] = c.groundTruthUnitId;
  const adjByCase: Record<string, Adjudication> = {};
  for (const a of ALL_ADJUDICATIONS) adjByCase[a.caseId] = a;
  const cleared = new Set(RUBRIC_SCREEN.filter((s) => s.outcome === "CLEARED").map((s) => s.caseId));

  const rows = packet.cases
    .map((c: any) => {
      const adj = adjByCase[c.caseId];
      const prior = consensus[unitByCase[c.caseId] ?? ""]!;
      if (adj) {
        return {
          caseId: c.caseId,
          groundTruthUnitId: unitByCase[c.caseId],
          documentId: c.documentId,
          materiality: c.materiality,
          source: "READJUDICATED",
          credit: adj.credit,
          completeness: adj.completeness,
          compositeSurfacing: adj.compositeSurfacing,
          binarySurfacing: toBinarySurfacing(adj.compositeSurfacing),
          dangerousSilentOmission: adj.dangerousSilentOmission,
          priorCredit: prior.credit,
          priorSurfacingBinary: prior.surfacing,
          creditChanged: adj.credit !== prior.credit,
          surfacingBinaryChanged: toBinarySurfacing(adj.compositeSurfacing) !== prior.surfacing,
        };
      }
      const compositeSurfacing =
        prior.credit === "CREDIT"
          ? "NOT_APPLICABLE"
          : cleared.has(c.caseId)
            ? "FULLY_SURFACED"
            : prior.surfacing === "SPECIFICALLY_SURFACED"
              ? "FULLY_SURFACED"
              : "NOT_SPECIFICALLY_SURFACED";
      return {
        caseId: c.caseId,
        groundTruthUnitId: unitByCase[c.caseId],
        documentId: c.documentId,
        materiality: c.materiality,
        source: "CARRIED_FORWARD",
        credit: prior.credit,
        completeness: prior.completeness,
        compositeSurfacing,
        binarySurfacing: prior.credit === "CREDIT" ? "NOT_APPLICABLE" : prior.surfacing,
        dangerousSilentOmission: prior.credit === "NO_CREDIT" && prior.surfacing === "NOT_SPECIFICALLY_SURFACED",
        priorCredit: prior.credit,
        priorSurfacingBinary: prior.surfacing,
        creditChanged: false,
        surfacingBinaryChanged: false,
      };
    })
    .sort((a: any, b: any) => a.caseId.localeCompare(b.caseId));

  const tally = (key: string) =>
    rows.reduce((acc: Record<string, number>, r: any) => {
      acc[r[key]] = (acc[r[key]] || 0) + 1;
      return acc;
    }, {});

  const noCredit = rows.filter((r: any) => r.credit === "NO_CREDIT");
  return {
    rows,
    counts: {
      credit: tally("credit"),
      completeness: tally("completeness"),
      compositeSurfacing: tally("compositeSurfacing"),
      binarySurfacing: tally("binarySurfacing"),
      surfacingDenominator: noCredit.length,
      dangerousSilentOmissions: rows.filter((r: any) => r.dangerousSilentOmission).length,
      fullySurfacedNoCredit: noCredit.filter((r: any) => r.compositeSurfacing === "FULLY_SURFACED").length,
      partiallySurfacedNoCredit: noCredit.filter((r: any) => r.compositeSurfacing === "PARTIALLY_SURFACED").length,
      notSpecificallySurfacedNoCredit: noCredit.filter((r: any) => r.compositeSurfacing === "NOT_SPECIFICALLY_SURFACED").length,
      readjudicated: rows.filter((r: any) => r.source === "READJUDICATED").length,
      carriedForward: rows.filter((r: any) => r.source === "CARRIED_FORWARD").length,
      creditDecisionsChanged: rows.filter((r: any) => r.creditChanged).length,
      surfacingDecisionsChanged: rows.filter((r: any) => r.surfacingBinaryChanged).length,
    },
  };
}

export { FROZEN_FILES, SOURCE_PATHS, GENERATED_AT, OUT, sha256, readJson, read, PACKET };

// ---------------------------------------------------------------------------
// Artifact writers
// ---------------------------------------------------------------------------

function write(name: string, value: unknown) {
  fs.mkdirSync(OUT, { recursive: true });
  const body = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(path.join(OUT, name), body);
  return sha256(body);
}

export function buildAll() {
  const headSha = process.env.V311_HEAD_SHA ?? "";
  const frozenHashes: Record<string, string> = {};
  for (const f of FROZEN_FILES) frozenHashes[f] = sha256(fs.readFileSync(path.join(ROOT, f)));

  const repairs = buildRepairs();
  const corpus = buildCorpus();
  const manifest = buildAffectedManifest();
  const results = buildFinalResults();

  const startingState = {
    artifact: "§2 — starting state and the frozen history, hashed before anything was written.",
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: GENERATED_AT,
    startingSha: {
      statedInMission: "5cdcfac",
      actualHeadAtStart: "5c665bed62dae3e7b6a7e2f1d77da684e54fc78c",
      discrepancy:
        "The mission names 5cdcfac as the starting point. Actual HEAD was 5c665be, one commit further on. That commit adds CLAUDE.md and records a reporting preference; it touches no benchmark, evidence, adjudication or production file, so the benchmark state this mission starts from is byte-identical to 5cdcfac. Recorded rather than silently absorbed.",
      branch: "claude/headroom-scaffold-covenant-engine-jrijk8",
      workingTree: "clean",
      remote: "synchronized",
    },
    priorAuditVerdict: "PHASE3_V3_1_BENCHMARK_REQUIRES_CORRECTION",
    frozenFileHashes: frozenHashes,
    frozenFileCount: FROZEN_FILES.length,
    reviewerResponseArtifacts: {
      present: false,
      note: "No R1/R2/R3 response file exists. 19-independent-review-import.json records that the V3.1 reviewer round never ran, so there are no V3.1 reviewer decisions to preserve or to reuse. The prior adjudication this mission carries forward is the V3 2-of-3 consensus of adjudicators A, B and C.",
    },
    promise: "No file listed in frozenFileHashes is written by this mission. 10-regression-and-determinism.json re-hashes every one of them after generation.",
  };

  const correctedCases = {
    artifact: "§3 — the four source-proven claim corrections, plus one further claim omission this mission found.",
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: GENERATED_AT,
    corrections: ALL_ADJUDICATIONS.filter((a) => a.correctedGroundTruthClaim).map((a) => {
      const frozen = readJson(PACKET).cases.find((c: any) => c.caseId === a.caseId);
      return {
        caseId: a.caseId,
        documentId: frozen.documentId,
        claimSectionRef: frozen.claimSectionRef,
        originalGroundTruthClaim: frozen.groundTruthClaim,
        correctedGroundTruthClaim: a.correctedGroundTruthClaim,
        originalAtomicPropositions: readJson(AUDIT_GT).cases.find((c: any) => c.caseId === a.caseId).propositions,
        correctedAtomicPropositions: a.propositions,
        sourcePath: SOURCE_PATHS[frozen.documentId],
        sourceSection: frozen.claimSectionRef,
        defectClassification: readJson(AUDIT_GT).cases.find((c: any) => c.caseId === a.caseId).classification,
        scoringImpact: {
          creditChanged: a.credit !== "NO_CREDIT" || a.caseId === "CASE-1284ab8e71",
          decision: a.credit,
          surfacing: a.compositeSurfacing,
        },
        provenance: "docs/phase-3-v3.1-benchmark-integrity/04-benchmark-correction-ledger.json",
      };
    }),
    note:
      "The prior assertion in CASE-e3520246bd that the basket had “no default condition attached” is preserved verbatim in originalGroundTruthClaim as the superseded benchmark error. Headroom's NO_DEFAULT extraction is NOT classified as a system defect.",
  };

  const unresolved = {
    artifact: "§5 — the two cases the integrity audit could not locate in the primary source.",
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: GENERATED_AT,
    cases: [
      {
        caseId: "CASE-e555117f4c",
        priorStatus: "BENCHMARK_SOURCE_UNRESOLVED",
        newStatus: "RESOLVED_FROM_PRIMARY_SOURCE",
        whyItWasNotFound:
          "The audit searched for the bare term “EBITDA”, whose first occurrence in the document is inside the “Acquired Entity or Business” definition. The operative definition is found by matching the defined-term lead-in form (curly-quoted term followed by “means”), which occurs exactly once.",
        offset: 88521,
        verifiedAgainstSource: "twenty add-backs (a)(i)–(a)(xx) and six deductions (b)(i)–(b)(vi), counted from the operative text",
        furtherDefectFound:
          "The frozen claim omits the 20% Combined Cap on clauses (a)(vii), (a)(viii) and (a)(xviii)(b), and the stipulated 2021 quarterly EBITDA amounts. Both are added to the corrected propositions.",
        eligibleForCanonicalScoring: true,
        reviewerOutputUsed: false,
      },
      {
        caseId: "CASE-4a1c6a48a0",
        priorStatus: "BENCHMARK_SOURCE_UNRESOLVED",
        newStatus: "RESOLVED_FROM_PRIMARY_SOURCE",
        whyItWasNotFound:
          "The provision is an unnumbered flush paragraph 6,734 characters inside the operative Section 6.04 span. The audit's excerpt stopped at the chapeau and never reached it.",
        offset: 461959,
        verifiedAgainstSource:
          "“For purposes of the definition of ‘Unrestricted Subsidiary’ and the covenants described under Section 5.15 and under this Section 6.04: (x) ‘investments’ shall include ... (y) any property transferred to or from an Unrestricted Subsidiary shall be valued at its fair market value at the time of such transfer.”",
        furtherDefectFound: null,
        eligibleForCanonicalScoring: true,
        reviewerOutputUsed: false,
      },
    ],
    remainingUnresolved: 0,
    note: "No source was invented. Both resolutions are string locations in files already mapped by the integrity audit, reproducible by the locator in scripts/v3-1-1/source-locator.ts.",
  };

  const readjudication = {
    artifact: "§8/§9/§10 — source-grounded deterministic adjudication of the affected set.",
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: GENERATED_AT,
    method: {
      whatWasNotDone: "No second three-model review was commissioned (§8). No reviewer majority was treated as the source of truth (§11).",
      perCaseSteps: [
        "read the corrected ground-truth claim",
        "decompose it into explicit material atomic propositions, each stated as the source states it",
        "inspect the exact systemOutput candidate pool",
        "identify the exact candidate IDs relied on",
        "evaluate same-claim identity by address and by content",
        "evaluate material completeness proposition by proposition",
        "evaluate the representation role of each candidate against §10",
        "determine CREDIT / NO_CREDIT / ABSTAIN",
        "for NO_CREDIT, determine the composite surfacing state over the UNREPRESENTED propositions only",
        "cite the exact evidence",
      ],
      materialityTest:
        "A proposition is MATERIAL_INDEPENDENT when losing it would change whether a transaction is permitted, or how much capacity exists. A measurement, delivery or transitional convention attached to a proposition already listed is a QUALIFIER.",
      surfacingRule:
        "The gap set is the set of material propositions with no SUBSTANTIVE_REPRESENTATION. FULLY_SURFACED when every gap proposition carries a claim-specific flag; PARTIALLY_SURFACED when at least one does and at least one does not; NOT_SPECIFICALLY_SURFACED when none does. This is V3.1's own instruction that an explicit atomic decomposition takes precedence over its derived structural and correspondence signals.",
      prohibitedAtoms: ["remaining material components", "rest of claim", "other elements"],
    },
    affectedCaseCount: ALL_ADJUDICATIONS.length,
    adjudications: [...ALL_ADJUDICATIONS].sort((a, b) => a.caseId.localeCompare(b.caseId)),
    rubricScreen: {
      population: "every case whose prior adjudication said SPECIFICALLY_SURFACED, because the AMB-1 resolution can only demote",
      populationSize: RUBRIC_SCREEN.length,
      cleared: RUBRIC_SCREEN.filter((s) => s.outcome === "CLEARED").length,
      reAdjudicated: RUBRIC_SCREEN.filter((s) => s.outcome === "RE_ADJUDICATED").length,
      records: RUBRIC_SCREEN,
    },
  };

  const finalResults = {
    artifact: "§11 — the canonical 47-case result under the corrected benchmark and the V3.1 contract.",
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: GENERATED_AT,
    benchmarkContentHash: corpus.benchmarkContentHash,
    counts: results.counts,
    changedDecisions: {
      byBenchmarkCorrection: results.rows.filter((r: any) => r.creditChanged || r.surfacingBinaryChanged)
        .filter((r: any) => ["CASE-e3520246bd", "CASE-9001417020", "CASE-a898053843", "CASE-1284ab8e71"].includes(r.caseId))
        .map((r: any) => r.caseId),
      byEvidenceRepair: results.rows.filter((r: any) => r.creditChanged || r.surfacingBinaryChanged)
        .filter((r: any) => ["CASE-88cfbb3bb8"].includes(r.caseId))
        .map((r: any) => r.caseId),
      bySourceResolution: results.rows.filter((r: any) => r.creditChanged || r.surfacingBinaryChanged)
        .filter((r: any) => ["CASE-4a1c6a48a0", "CASE-e555117f4c"].includes(r.caseId))
        .map((r: any) => r.caseId),
      byRubricDependency: results.rows.filter((r: any) => r.creditChanged || r.surfacingBinaryChanged)
        .filter((r: any) =>
          ["CASE-2034884b7a", "CASE-5ac1cd56ef", "CASE-e008d4278a", "CASE-b2658c02e7", "CASE-579c5d3f33", "CASE-963cc44044", "CASE-166617b06a"].includes(
            r.caseId,
          ),
        )
        .map((r: any) => r.caseId),
    },
    sourceUnresolvedCases: [],
    rows: results.rows,
    comparisonToPriorConsensus: {
      note:
        "The prior V3 consensus is shown for comparison only. §11 forbids treating reviewer majority as the canonical source of truth; where the corrected primary source and the prior majority disagree, the source controls.",
      priorCredit: { CREDIT: 11, NO_CREDIT: 36 },
      priorDangerousSilentOmissions: 15,
    },
  };

  const backlog = {
    artifact: "§12 — the Phase-3 defect backlog, derived only after the benchmark was corrected. Nothing here is implemented (§16).",
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: GENERATED_AT,
    noCreditCaseCount: results.counts.credit.NO_CREDIT ?? 0,
    perCase: CASE_ROOT_CAUSES.map((rc) => {
      const row = results.rows.find((r: any) => r.caseId === rc.caseId);
      return {
        ...rc,
        surfacingDisposition:
          row.compositeSurfacing === "FULLY_SURFACED"
            ? "FULLY_SURFACED"
            : row.compositeSurfacing === "PARTIALLY_SURFACED"
              ? "PARTIALLY_SURFACED"
              : "SILENT",
        materiality: row.materiality,
      };
    }).sort((a, b) => a.caseId.localeCompare(b.caseId)),
    rootCauseTally: CASE_ROOT_CAUSES.reduce((acc: Record<string, number>, rc) => {
      acc[rc.rootCause] = (acc[rc.rootCause] || 0) + 1;
      return acc;
    }, {}),
    groups: DEFECT_GROUPS,
    genuineProductionDefectGroups: DEFECT_GROUPS.filter((g) => g.id.startsWith("P3-DEFECT-")).length,
    notDefects: DEFECT_GROUPS.filter((g) => g.id.startsWith("P3-OBSERVATION-")).map((g) => g.id),
    prohibition: "No fix is implemented in this mission. §16 stops before production.",
  };

  const h01 = write("01-starting-state.json", startingState);
  const h02 = write("02-corrected-benchmark-cases.json", correctedCases);
  const h03 = write("03-source-excerpt-repairs.json", {
    artifact: "§4/§9 — excerpt repairs, each proved to come from the operative provision.",
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: GENERATED_AT,
    repairCount: repairs.length,
    namedByPriorAudit: 9,
    addedByThisMission: ["CASE-5c33066800", "CASE-768547a920"],
    deterministicCheck:
      "For every repair, firstOccurrenceIsNotTheOperativeSection.distinct is true: the offset the frozen packet used is not the offset of the operative provision. CASE-4a1c6a48a0 is the exception that proves the rule — its frozen excerpt WAS inside the operative span and still failed to carry the claimed provision, which is why claim support, not span containment, is the test that matters.",
    repairs,
  });
  const h04 = write("04-source-unresolved-resolution.json", unresolved);
  const h05 = write("05-v3.1.1-corrected-47-case-corpus.json", {
    artifact: "§6 — the versioned corrected 47-case corpus.",
    benchmarkVersion: BENCHMARK_VERSION,
    originalBenchmarkVersion: "evaluation-contract-v3.1.v1",
    generatedAt: GENERATED_AT,
    caseCount: corpus.cases.length,
    benchmarkContentHash: corpus.benchmarkContentHash,
    determinism: "cases are sorted by caseId and the content hash covers only the semantic payload, so regeneration is byte-identical.",
    cases: corpus.cases,
  });
  const h06 = write("06-affected-case-manifest.json", {
    artifact: "§7 — every one of the 47 cases classified into exactly one bucket.",
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: GENERATED_AT,
    tally: manifest.reduce((acc: Record<string, number>, m: any) => {
      acc[m.classification] = (acc[m.classification] || 0) + 1;
      return acc;
    }, {}),
    cases: manifest,
  });
  const h07 = write("07-readjudication.json", readjudication);
  const h08 = write("08-final-47-case-results.json", finalResults);
  const h09 = write("09-phase3-defect-backlog.json", backlog);

  return { repairs, corpus, manifest, results, hashes: { h01, h02, h03, h04, h05, h06, h07, h08, h09 }, frozenHashes, headSha };
}

export function buildClosureArtifacts(built: ReturnType<typeof buildAll>) {
  const frozenAfter: Record<string, string> = {};
  for (const f of FROZEN_FILES) frozenAfter[f] = sha256(fs.readFileSync(path.join(ROOT, f)));
  const frozenUnchanged = FROZEN_FILES.every((f) => frozenAfter[f] === built.frozenHashes[f]);

  const results = built.results;
  const noCredit = results.counts.credit.NO_CREDIT ?? 0;
  const dangerous = results.counts.dangerousSilentOmissions;

  const determinism = {
    artifact: "§15 — determinism and regression.",
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: GENERATED_AT,
    frozenArtifactsUnchanged: frozenUnchanged,
    frozenArtifactCount: FROZEN_FILES.length,
    frozenHashesAfterGeneration: frozenAfter,
    artifactHashes: built.hashes,
    benchmarkContentHash: built.corpus.benchmarkContentHash,
    determinismProof:
      "buildCorpus() and buildFinalResults() are pure functions of the frozen inputs and the authored data modules, with a fixed generatedAt and caseId-sorted output. tests/benchmark-v311/v311-reconciliation.test.ts calls each twice and asserts hash equality.",
    regressionRun: {
      environment: "local Postgres 16 on :5432, started before the run; the first full-suite attempt ran with the database down and its 103 connectivity failures are not reported as results.",
      targetedSuites: {
        "tests/benchmark-v311 (new)": { files: 1, tests: 17, failed: 0 },
        "tests/benchmark-integrity": { files: 1, tests: 11, failed: 0 },
        "tests/evaluation-v2": { files: 9, tests: 164, failed: 0 },
        "tests/contract-model/semantic-accountability": { files: 12, tests: 380, failed: 0 },
        "Phase 4A \u2014 tests/contract-model/runtime (core)": { files: 5, tests: 82, failed: 0 },
        "Phase 4B \u2014 tests/contract-model/runtime/input": { files: 4, tests: 98, failed: 0 },
        "Phase 4C \u2014 tests/contract-model/runtime/capacity": { files: 7, tests: 177, failed: 0 },
        "Phase 4D \u2014 tests/contract-model/runtime/transaction": { files: 6, tests: 186, failed: 0 },
      },
      fullSuite: {
        before: { at: "HEAD 5c665be, run in a detached worktree", files: "4 failed / 345 passed (349)" },
        after: { at: "working tree", files: "3 failed / 347 passed (350)" },
        newFailingIdentities: [],
        failingIdentitiesBefore: [
          "tests/certification/open2-final-direct-patch-independent-confirmation.test.ts > Item 15 \u2014 real end-to-end persistence",
          "tests/contract-model/architecture-proposal-node-identity.test.ts > no new directory under tests/fixtures/unseen-packages/",
          "tests/contract-model/phase-3f1-1-forensic-machinery.test.ts > no new package directory under tests/fixtures/unseen-packages/",
          "tests/contract-model/part-b-terminal-recert-open3-independent.test.ts > OPEN-3 probe 4: measured multi-point scaling is consistent with O(n)",
        ],
        failingIdentitiesAfter: [
          "tests/certification/open2-final-direct-patch-independent-confirmation.test.ts > Item 15 \u2014 real end-to-end persistence",
          "tests/contract-model/architecture-proposal-node-identity.test.ts > no new directory under tests/fixtures/unseen-packages/",
          "tests/contract-model/phase-3f1-1-forensic-machinery.test.ts > no new package directory under tests/fixtures/unseen-packages/",
        ],
        note:
          "Identities, not counts. The three failures after are the same three as before. The two contamination guards fail on a tracked fixture directory, chwy-2026-credit-agreement, committed in 8241605 \u2014 the guards' allowed-prefix lists were never extended for it; nothing in this mission touches tests/fixtures/. The OPEN-3 O(n) scaling probe failed in the baseline run and passed in the working-tree run; it is CPU-contention sensitive and is not counted as a fix.",
      },
      tsc: "clean for every file this mission adds. Six pre-existing errors remain in tests/foundation-audit/, all in files this mission does not touch.",
      lint: "next lint \u2014 no warnings or errors",
      build: "next build \u2014 succeeded",
    },
  };

  const closureCriteria = [
    {
      n: 1,
      requirement: "The benchmark's claims are correct against primary legal source",
      status: "PASS",
      evidence: "4 claim corrections applied additively; 1 further claim omission (the EBITDA Combined Cap) found and added; 47/47 cases now carry a primary-source location.",
    },
    {
      n: 2,
      requirement: "The benchmark's evidence layer points at the operative provision",
      status: "PARTIAL",
      evidence:
        "11 of the 20 RESOLVED_FROM_RAW_SOURCE excerpts were contaminated and are repaired. The remaining 27 cases still carry sourceExcerpt = \"\" with UNRESOLVED_DESCRIPTION_ONLY — they are description-only and a reviewer still cannot check them from the packet alone. This mission did not manufacture excerpts for them because none of the four claim defects it inherited required it and §4 scoped the repair to the contaminated nine.",
    },
    { n: 3, requirement: "No frozen artifact was modified", status: frozenUnchanged ? "PASS" : "FAIL", evidence: `${FROZEN_FILES.length} frozen files re-hashed after generation; unchanged=${frozenUnchanged}.` },
    { n: 4, requirement: "Every case has an adjudication traceable to exact candidate IDs", status: "PASS", evidence: `${results.counts.readjudicated} re-adjudicated with cited candidate IDs; ${results.counts.carriedForward} carried forward from the frozen V3 2-of-3 consensus.` },
    { n: 5, requirement: "All 14 historical false-credit controls remain NO_CREDIT", status: "PASS", evidence: "No case moved from NO_CREDIT to CREDIT except CASE-e3520246bd, which is not a false-credit control; the controls are recorded in docs/evaluation-contract-v3/18-known-false-credit-controls.json and none appears in the changed set." },
    { n: 6, requirement: "Dangerous silent omissions are at or below the level Phase-3 closure requires", status: "FAIL", evidence: `${dangerous} of ${noCredit} NO_CREDIT cases are dangerous silent omissions on material claims. Phase-3 closure cannot be asserted with a material claim silently unrepresented, let alone ${dangerous}.` },
    { n: 7, requirement: "The residual NO_CREDIT population is explained by identified production defects, not by unknown causes", status: "PASS", evidence: `All ${noCredit} NO_CREDIT cases are root-caused; 4 genuine production defect groups and 2 non-defect observations.` },
    { n: 8, requirement: "No production defect remains that would change a capacity or permission conclusion", status: "FAIL", evidence: "P3-DEFECT-1 (20 cases) and P3-DEFECT-2 (6 cases) each leave material provisions unrepresented. P3-DEFECT-3 discards independently-gated exceptions, which over-permits." },
    { n: 9, requirement: "Independent human re-adjudication exists", status: "NOT MEASURED", evidence: "No V3.1 reviewer round has been run. This mission's §8 adjudication is deterministic and source-grounded, and it is not a substitute for the independent round the prior mission's gate item 4 requires." },
  ];

  const failing = closureCriteria.filter((c) => c.status === "FAIL");
  const verdict = "PHASE3_SEMANTIC_REMEDIATION_REQUIRED";

  const gate = {
    artifact: "§13 — the Phase-3 closure gate.",
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: GENERATED_AT,
    verdict,
    verdictBasis:
      "The measuring instrument is now sound enough to read: the four claim defects are corrected, eleven contaminated excerpts are repaired, both source-unresolved cases are resolved, and 47/47 cases carry a primary-source location. So the answer is no longer PHASE3_BENCHMARK_STILL_UNSAFE. But the corrected measurement shows genuine production defects that prevent closure, and the corrected score is WORSE on the dimension that matters: dangerous silent omissions rise from 15 to " +
      String(dangerous) +
      ". Closure criteria were not redefined; the same criteria applied to a corrected benchmark return a worse result.",
    criteria: closureCriteria,
    failingCriteria: failing.map((c) => c.n),
    phase4eAuthorized: false,
    phase4eNote: "Phase 4E is not authorized. Phase 3 closure is not established.",
    doNotRedefine:
      "The corrected benchmark improved one credit decision and worsened seven surfacing decisions. Neither movement was allowed to change a threshold, a denominator or a closure criterion.",
  };

  const h10 = write("10-regression-and-determinism.json", determinism);
  const h11 = write("11-phase3-closure-gate.json", gate);
  return { determinism, gate, h10, h11 };
}

if (require.main === module) {
  const built = buildAll();
  const closure = buildClosureArtifacts(built);
  console.log(JSON.stringify({
    caseCount: built.corpus.cases.length,
    benchmarkContentHash: built.corpus.benchmarkContentHash,
    repairs: built.repairs.length,
    counts: built.results.counts,
    manifestTally: built.manifest.reduce((a: Record<string, number>, m: any) => { a[m.classification] = (a[m.classification] || 0) + 1; return a; }, {}),
    verdict: closure.gate.verdict,
    frozenUnchanged: closure.determinism.frozenArtifactsUnchanged,
  }, null, 2));
}
