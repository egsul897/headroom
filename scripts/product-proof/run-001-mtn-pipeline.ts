/**
 * Product Proof 001 — offline authentic-package pipeline probe (MTN).
 *
 * Runs the real Headroom libraries against frozen SEC source text.
 * Constraints honored:
 *   - no Neon / production DB writes
 *   - no paid LLM inference (synthetic StageCaller only)
 *   - no hand-authored capacity formulas injected into the product
 *
 * Every stage records STATUS: SUCCESS | PARTIAL | BLOCKED | UNSUPPORTED | BYPASSED
 * with provenance. A blocked stage does not invent affirmative capacity.
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";

import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { runDiscoveryPipeline } from "../../lib/contract-model/compiler/discovery/pipeline";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { extractStructure } from "../../lib/knowledge-factory/pipeline/structural";
import {
  resolveUtilization,
} from "../../lib/capacity/utilization-resolver";
import { decideSolverUtilizationAuthority } from "../../lib/capacity/utilization-authority";
import { computeVerifiedRemaining } from "../../lib/capacity/verified-remaining";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
} from "../../lib/contract-model/verified-execution";

const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(
  ROOT,
  "docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/extracted-text",
);
const OUT = path.join(ROOT, "docs/product-proof/001/artifacts");
const LOG_DIR = path.join(ROOT, "docs/product-proof/001/logs");

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

interface StageRecord {
  stage: string;
  status: "SUCCESS" | "PARTIAL" | "BLOCKED" | "UNSUPPORTED" | "BYPASSED" | "ERROR";
  entryPoint: string;
  wallClockMs: number;
  paidInference: boolean;
  neonWrites: boolean;
  humanInterventions: number;
  notes: string[];
  coverage?: Record<string, unknown>;
  error?: string;
  outputs?: string[];
}

const stages: StageRecord[] = [];
const testedSha = fs
  .readFileSync(path.join(ROOT, ".git/HEAD"), "utf8")
  .trim();

function sha256File(p: string): string {
  return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function writeJson(name: string, value: unknown): string {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(value, null, 2));
  return p;
}

function record(partial: StageRecord): void {
  stages.push(partial);
  console.log(
    JSON.stringify({
      stage: partial.stage,
      status: partial.status,
      wallClockMs: partial.wallClockMs,
      notes: partial.notes.slice(0, 3),
      error: partial.error,
    }),
  );
}

async function stageSourceDocuments(): Promise<PackageDocumentInput[]> {
  const t0 = performance.now();
  const docs: PackageDocumentInput[] = [
    {
      documentId: "mtn-doc-a-tenth-ar-credit-agreement",
      label: "Vail Holdings, Inc. Tenth Amended and Restated Credit Agreement (2026-02-09)",
      text: fs.readFileSync(path.join(SRC, "doc-a-tenth-ar-credit-agreement.txt"), "utf8"),
    },
    {
      documentId: "mtn-doc-b-indenture-2024",
      label: "Vail Resorts, Inc. Indenture dated May 8, 2024 (5.625% Senior Notes)",
      text: fs.readFileSync(path.join(SRC, "doc-b-indenture-2024.txt"), "utf8"),
    },
    {
      documentId: "mtn-doc-c-indenture-2025",
      label: "Vail Resorts, Inc. Indenture dated July 2, 2025 (6.50% Senior Notes)",
      text: fs.readFileSync(path.join(SRC, "doc-c-indenture-2025.txt"), "utf8"),
    },
    {
      documentId: "mtn-doc-d-10k-fy2026",
      label: "Vail Resorts, Inc. Form 10-K for fiscal year ended July 31, 2026",
      text: fs.readFileSync(path.join(SRC, "doc-d-10k-fy2026.txt"), "utf8"),
    },
  ];
  const hashes = {
    "doc-a": sha256File(
      path.join(ROOT, "docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/raw-html/doc-a-tenth-ar-credit-agreement.htm"),
    ),
    "doc-b": sha256File(
      path.join(ROOT, "docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/raw-html/doc-b-indenture-2024.htm"),
    ),
    "doc-c": sha256File(
      path.join(ROOT, "docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/raw-html/doc-c-indenture-2025.htm"),
    ),
    "doc-d": sha256File(
      path.join(ROOT, "docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/raw-html/doc-d-10k-fy2026.htm"),
    ),
  };
  writeJson("stage-00-source-inventory.json", {
    docs: docs.map((d) => ({
      documentId: d.documentId,
      label: d.label,
      chars: d.text.length,
    })),
    rawHtmlSha256: hashes,
  });
  record({
    stage: "SOURCE_DOCUMENTS",
    status: "SUCCESS",
    entryPoint: "docs/product-proof/001/sources/... (frozen SEC HTML → extracted text)",
    wallClockMs: Math.round(performance.now() - t0),
    paidInference: false,
    neonWrites: false,
    humanInterventions: 1, // human selected package + freeze commands
    notes: [
      "Frozen authentic SEC package for MTN Tenth A&R + two senior-notes indentures + FY2026 10-K.",
      "No intercreditor / security agreement exhibit filed with the Tenth A&R 8-K.",
      "Hashes recorded in stage-00-source-inventory.json.",
    ],
    outputs: ["stage-00-source-inventory.json"],
    coverage: { documentCount: docs.length, hashes },
  });
  return docs;
}

function stageStructuralIndex(docs: PackageDocumentInput[]) {
  const t0 = performance.now();
  const nodesByDocument = new Map<
    string,
    { text: string; nodes: ReturnType<typeof parseDocumentStructure> }
  >();
  const allDefinitions = [];
  const allReferences = [];
  const perDoc: Record<string, unknown> = {};

  for (const doc of docs) {
    const nodes = parseDocumentStructure({
      documentId: doc.documentId,
      label: doc.label,
      text: doc.text,
    });
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    const refs = detectStructuralReferences(doc.documentId, doc.text, nodes);
    const defs = detectStructuralDefinitions(doc.documentId, doc.text, nodes);
    allReferences.push(...refs);
    allDefinitions.push(...defs);
    const byType: Record<string, number> = {};
    for (const n of nodes) byType[n.nodeType] = (byType[n.nodeType] ?? 0) + 1;
    perDoc[doc.documentId] = {
      totalNodes: nodes.length,
      nodesByType: byType,
      definitionsDetected: defs.length,
      referencesDetected: refs.length,
      referencesResolved: refs.filter((r) => r.resolved).length,
    };
  }

  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
  const outPath = writeJson("stage-01-structural-index-summary.json", {
    documents: perDoc,
    totals: {
      documentCount: docs.length,
      totalNodes: [...nodesByDocument.values()].reduce((n, d) => n + d.nodes.length, 0),
      totalDefinitions: allDefinitions.length,
      totalReferences: allReferences.length,
      totalReferencesResolved: allReferences.filter((r) => r.resolved).length,
    },
  });
  writeJson(
    "stage-01-structural-definitions-sample.json",
    allDefinitions
      .filter((d) =>
        /Permitted Debt|Permitted Liens|Adjusted EBITDA|Net Funded Debt|Restricted Company/i.test(
          d.exactTerm,
        ),
      )
      .slice(0, 50)
      .map((d) => ({
        documentId: d.documentId,
        exactTerm: d.exactTerm,
        sourceNodeKey: d.sourceNodeKey,
      })),
  );

  // Also run KF structural extract on Doc A for candidate discovery later.
  const kfStructure = extractStructure("mtn-doc-a", docs[0].text);
  writeJson("stage-01-kf-structural-doc-a.json", {
    nodeCount: kfStructure.nodes.length,
    ambiguousCount: kfStructure.ambiguousCount,
    definitionCount: kfStructure.definitions.length,
    sample: kfStructure.nodes.slice(0, 40).map((n) => ({
      sectionRef: n.sectionRef,
      nodeType: n.nodeType,
      heading: n.heading,
      ambiguous: n.ambiguous,
    })),
  });

  record({
    stage: "STRUCTURAL_INDEX",
    status: "SUCCESS",
    entryPoint:
      "lib/contract-model/compiler/{stage-structure,structural-index,structural-definitions,structural-references}.ts + knowledge-factory/pipeline/structural.ts",
    wallClockMs: Math.round(performance.now() - t0),
    paidInference: false,
    neonWrites: false,
    humanInterventions: 0,
    notes: [
      "Deterministic Phase 2A structural index built over all four frozen texts.",
      "KF extractStructure also run on Doc A for family candidate discovery.",
    ],
    outputs: [outPath, "stage-01-structural-definitions-sample.json", "stage-01-kf-structural-doc-a.json"],
    coverage: perDoc,
  });
  return { index, nodesByDocument, kfStructure };
}

async function stageCovenantDiscovery(
  index: ReturnType<typeof buildStructuralIndex>,
  docs: PackageDocumentInput[],
  kfStructure: ReturnType<typeof extractStructure>,
) {
  const t0 = performance.now();
  const caller = getStageCaller();
  const paidBlocked = caller.isSynthetic;

  // Pass A only (deterministic) — always real. Run per document.
  const passA = docs.flatMap((d) => runPassADeterministicSignals(d.documentId, index));
  writeJson("stage-02-discovery-pass-a.json", {
    candidateCount: passA.length,
    byDocument: docs.map((d) => ({
      documentId: d.documentId,
      count: passA.filter((c) => c.documentId === d.documentId).length,
    })),
    sample: passA.slice(0, 40).map((c) => ({
      documentId: c.documentId,
      sectionRef: c.sectionRef,
      signals: c.signals,
      signalScore: c.signalScore,
      supersessionStatus: c.supersessionStatus,
    })),
  });

  // Full discovery pipeline with synthetic caller — Pass B returns empty schema defaults.
  const discovery = await runDiscoveryPipeline(caller, "mtn-doc-a-tenth-ar-credit-agreement", index);
  writeJson("stage-02-discovery-pipeline-synthetic.json", {
    caller: { providerName: caller.providerName, model: caller.model, isSynthetic: caller.isSynthetic },
    summary: discovery.summary,
    candidateCount: discovery.candidates.length,
    sample: discovery.candidates.slice(0, 30).map((c) => ({
      discoveryId: c.discoveryId,
      sectionRef: c.sectionRef,
      families: c.families,
      status: c.status,
    })),
  });

  // Deterministic KF family candidates on Doc A.
  const kfCandidates = discoverCovenantCandidates("mtn-doc-a", docs[0].text, kfStructure.nodes);
  writeJson(
    "stage-02-kf-family-candidates-doc-a.json",
    kfCandidates.map((c) => ({
      candidateId: c.candidateId,
      nodeId: c.nodeId,
      families: c.families,
      discoveryScore: c.discoveryScore,
      excerptPreview: c.excerpt.slice(0, 160),
    })),
  );

  const debtLienHits = kfCandidates.filter((c) =>
    c.families.some((f) => f === "INDEBTEDNESS" || f === "LIENS" || f === "FINANCIAL_COVENANTS"),
  );

  record({
    stage: "COVENANT_DISCOVERY",
    status: paidBlocked ? "PARTIAL" : "SUCCESS",
    entryPoint:
      "runPassADeterministicSignals + runDiscoveryPipeline (synthetic) + discoverCovenantCandidates",
    wallClockMs: Math.round(performance.now() - t0),
    paidInference: false,
    neonWrites: false,
    humanInterventions: 0,
    notes: [
      paidBlocked
        ? "No AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY — Pass B semantic classification ran as synthetic empty defaults (not a competitive discovery)."
        : "Live Pass B executed.",
      `Pass A deterministic candidates: ${passA.length}.`,
      `KF family candidates on Doc A: ${kfCandidates.length}; debt/lien/financial family hits: ${debtLienHits.length}.`,
      "Full Pass B LLM discovery NOT authorized for paid inference in this mission.",
    ],
    coverage: {
      passACount: passA.length,
      pipelineCandidateCount: discovery.candidates.length,
      kfCandidateCount: kfCandidates.length,
      debtLienFinancialFamilyHits: debtLienHits.length,
      syntheticPassB: paidBlocked,
    },
    outputs: [
      "stage-02-discovery-pass-a.json",
      "stage-02-discovery-pipeline-synthetic.json",
      "stage-02-kf-family-candidates-doc-a.json",
    ],
  });
  return { passA, discovery, kfCandidates };
}

function stagePackageGraph(docs: PackageDocumentInput[]) {
  const t0 = performance.now();
  const result = buildPackageGraph("product-proof-001-mtn", "mtn-2026-tenth-ar-credit-agreement", docs);
  writeJson("stage-03-package-graph.json", result);
  record({
    stage: "MULTI_DOCUMENT_GRAPH",
    status: "SUCCESS",
    entryPoint: "lib/contract-model/compiler/package-graph/pipeline.ts#buildPackageGraph",
    wallClockMs: Math.round(performance.now() - t0),
    paidInference: false,
    neonWrites: false,
    humanInterventions: 0,
    notes: [
      "Deterministic Phase 2C package graph over CA + two indentures + 10-K.",
      `Relationships resolved: ${result.performance.relationshipsResolved}; unresolved: ${result.performance.relationshipsUnresolved}.`,
      "No Security Documents / intercreditor agreement in the frozen package — graph cannot invent them.",
    ],
    coverage: result.performance as unknown as Record<string, unknown>,
    outputs: ["stage-03-package-graph.json"],
  });
  return result;
}

async function stageAmendment(
  docs: PackageDocumentInput[],
  packageGraph: ReturnType<typeof buildPackageGraph>,
  index: ReturnType<typeof buildStructuralIndex>,
) {
  const t0 = performance.now();
  const caller = getStageCaller();
  try {
    const input = {
      documents: docs,
      packageGraph,
      index,
    };
    const result = await runAmendmentPipeline(caller, input);
    writeJson("stage-05-amendment-pipeline.json", {
      effectCount: result.effects.length,
      unattachedCount: result.unattachedEffects.length,
      totalConflictsAcrossPackage: result.totalConflictsAcrossPackage,
      summary: result.summary,
      sampleEffects: result.effects.slice(0, 30),
    });
    record({
      stage: "AMENDMENT_PRECEDENCE",
      status: result.effects.length === 0 ? "PARTIAL" : "SUCCESS",
      entryPoint: "lib/contract-model/compiler/amendment/pipeline.ts#runAmendmentPipeline",
      wallClockMs: Math.round(performance.now() - t0),
      paidInference: false,
      neonWrites: false,
      humanInterventions: 0,
      notes: [
        `Amendment effects discovered: ${result.effects.length}; unattached: ${result.unattachedEffects.length}.`,
        "Tenth A&R is a restatement; prior CA versions are not in the frozen package.",
        "Senior-notes indentures are separate instruments, not CA amendments.",
        caller.isSynthetic
          ? "Semantic interpretation of ambiguous effects used synthetic caller (empty defaults)."
          : "Live amendment semantic caller available.",
      ],
      outputs: ["stage-05-amendment-pipeline.json"],
      coverage: {
        effectCount: result.effects.length,
        unattachedCount: result.unattachedEffects.length,
      },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeJson("stage-05-amendment-pipeline-error.json", { error: message, stack: err instanceof Error ? err.stack : null });
    record({
      stage: "AMENDMENT_PRECEDENCE",
      status: "BLOCKED",
      entryPoint: "lib/contract-model/compiler/amendment/pipeline.ts#runAmendmentPipeline",
      wallClockMs: Math.round(performance.now() - t0),
      paidInference: false,
      neonWrites: false,
      humanInterventions: 0,
      notes: [
        "Tenth A&R is a restatement; prior credit agreements not in package as amendable chain docs.",
        "Indentures are separate instruments, not amendments of the CA.",
        `Pipeline error captured: ${message.slice(0, 300)}`,
      ],
      error: message,
      outputs: ["stage-05-amendment-pipeline-error.json"],
    });
    return null;
  }
}

function stageDefinitionResolution(
  index: ReturnType<typeof buildStructuralIndex>,
  docs: PackageDocumentInput[],
) {
  const t0 = performance.now();
  // Structural definitions already collected; probe key operative terms in Doc A text.
  const ca = docs[0].text;
  const terms = [
    "Permitted Debt",
    "Permitted Liens",
    "Adjusted EBITDA",
    "Net Funded Debt",
    "Restricted Company",
    "Maximum Facility Amount",
    "Facility Amount",
    "Secured Debt",
    "Threshold Amount",
  ];
  const found = terms.map((term) => {
    const idx = ca.indexOf(`${term} means`);
    return {
      term,
      definitionAnchorFound: idx >= 0,
      charStart: idx,
      preview: idx >= 0 ? ca.slice(idx, idx + 180).replace(/\s+/g, " ") : null,
    };
  });
  writeJson("stage-04-definition-resolution-probe.json", {
    method: "structural-definitions + literal definition-anchor probe (no recursive context bundle wired for new issuer CLI)",
    found,
  });

  const missing = found.filter((f) => !f.definitionAnchorFound).map((f) => f.term);
  record({
    stage: "DEFINITION_RESOLUTION",
    status: missing.length ? "PARTIAL" : "SUCCESS",
    entryPoint:
      "detectStructuralDefinitions + literal definition-anchor probe (buildCovenantContextBundle not wired for issuer-agnostic CLI on main)",
    wallClockMs: Math.round(performance.now() - t0),
    paidInference: false,
    neonWrites: false,
    humanInterventions: 0,
    notes: [
      `Literal definition anchors found for ${found.filter((f) => f.definitionAnchorFound).length}/${terms.length} key terms.`,
      missing.length
        ? `Missing literal \"X means\" anchors: ${missing.join(", ")} (may use alternate definitional forms).`
        : "All probed terms have literal means-anchors in Doc A.",
      "Product recursive definition-graph retrieval (Phase 2D) has no issuer-agnostic CLI on main for this package.",
    ],
    coverage: { probed: terms.length, found: found.filter((f) => f.definitionAnchorFound).length, missing },
    outputs: ["stage-04-definition-resolution-probe.json"],
  });
}

function stageRuleRepresentationThroughVerification() {
  const t0 = performance.now();
  record({
    stage: "GENERALIZED_RULE_REPRESENTATION",
    status: "BLOCKED",
    entryPoint: "lib/contract-model/compiler/semantic/compile.ts#compileCovenantToIR (requires discovery candidates + paid/real Pass B or sealed units)",
    wallClockMs: Math.round(performance.now() - t0),
    paidInference: false,
    neonWrites: false,
    humanInterventions: 0,
    notes: [
      "No sealed CERTIFIED IR / VerifiedExecutionPackage exists for MTN.",
      "Live semantic compile requires paid inference (not authorized) and Pass B candidates (synthetic empty).",
      "Hand-authoring an IR/rulebook for MTN would violate the no-silent-hand-modeling constraint and is labeled BYPASSED if done — not done here.",
    ],
  });
  record({
    stage: "VERIFICATION",
    status: "BLOCKED",
    entryPoint: "lib/contract-model/compiler/semantic-verification/verify.ts#verifyCompiledCandidate",
    wallClockMs: 0,
    paidInference: false,
    neonWrites: false,
    humanInterventions: 0,
    notes: [
      "No compiled candidate to verify for MTN.",
      "verified-execution REQUIRE boundary cannot be satisfied without a VerifiedExecutionPackage.",
    ],
  });
}

function stageFinancialUtilizationBinding() {
  const t0 = performance.now();
  // Empty ledger must NOT become zero usage.
  const util = resolveUtilization({
    capacityRuleId: "mtn-permitted-debt-clause-l-secured",
    asOf: "2026-10-10",
    currency: "USD",
    records: [],
    completenessCertificate: null,
  });

  const authority = decideSolverUtilizationAuthority({
    namedMemberCount: 1,
    attributedMemberCount: 0,
    measuredUsage: 0,
    aggregation: "NAMED_MEMBER_CLAUSES",
    completenessCertificate: null,
  });

  // Hypothetical modeled gross ONLY for arithmetic integrity probe — labeled.
  const remainingHypotheticalGross = computeVerifiedRemaining({
    gross: {
      capacityRuleId: "mtn-permitted-debt-clause-l-secured",
      amount: 50_000_000,
      modeled: true,
      gateSatisfied: true,
      currency: "USD",
      formulaLabel: "HYPOTHETICAL_GROSS_FOR_UTILIZATION_PROBE_ONLY",
      sectionRef: "Permitted Debt (l)",
    },
    utilization: util,
    certificationStatus: "NOT_CERTIFIED",
    sourceCitations: ["PRODUCT_PROOF_001: hypothetical gross — not engine-extracted"],
  });

  const remainingUnmodeledGross = computeVerifiedRemaining({
    gross: {
      capacityRuleId: "mtn-permitted-debt-clause-l-secured",
      amount: null,
      modeled: false,
      gateSatisfied: false,
      currency: "USD",
      refusalReason: "gross capacity not extracted/compiled from authentic MTN package on main",
    },
    utilization: util,
    certificationStatus: "NOT_CERTIFIED",
  });

  writeJson("stage-09-utilization-binding.json", {
    resolveUtilization: util,
    decideSolverUtilizationAuthority: authority,
    computeVerifiedRemaining_hypotheticalGrossLabeled: remainingHypotheticalGross,
    computeVerifiedRemaining_unmodeledGross: remainingUnmodeledGross,
    integrityRule: "Empty ledger ≠ zero usage; remaining capacity NOT DETERMINED without completeness/authority.",
  });

  const emptyTreatedAsZero =
    util.supportsRemainingClaim === true ||
    authority.supportsRemainingClaim === true ||
    remainingUnmodeledGross.publicationLabel === "AVAILABLE";

  record({
    stage: "FINANCIAL_UTILIZATION_BINDING",
    status: emptyTreatedAsZero ? "ERROR" : "PARTIAL",
    entryPoint:
      "lib/capacity/{utilization-resolver,utilization-authority,verified-remaining}.ts",
    wallClockMs: Math.round(performance.now() - t0),
    paidInference: false,
    neonWrites: false,
    humanInterventions: 0,
    notes: [
      "Exercised utilization authority APIs with empty ledger + missing completeness certificate.",
      `Authority kind=${authority.kind}; supportsRemainingClaim=${authority.supportsRemainingClaim}.`,
      `Unmodeled gross publicationLabel=${remainingUnmodeledGross.publicationLabel}.`,
      "10-K provides public debt balances but is NOT an authenticated utilization ledger for Permitted Debt baskets.",
      "No NS-4 APPROVED financial snapshot / FCE path on main for this issuer.",
      emptyTreatedAsZero
        ? "SAFETY FAILURE: empty ledger treated as zero / AVAILABLE."
        : "Safety OK: empty ledger did not become verified zero / AVAILABLE.",
    ],
    outputs: ["stage-09-utilization-binding.json"],
    coverage: {
      authenticatedUtilization: false,
      publicFinancialsPresent: true,
      completenessCertificate: false,
      emptyLedgerTreatedAsZero: emptyTreatedAsZero,
    },
  });
}

function stageCapacityAndSimulation() {
  const t0 = performance.now();
  const capacityAttempts: unknown[] = [];
  const simAttempts: unknown[] = [];

  // Empty / incomplete VEP must refuse.
  const emptyPackage = {
    companyId: "product-proof-001-mtn",
    instrumentKey: "mtn-vhi-credit-facility",
    rules: [],
    definitions: [],
    sharedCapacities: [],
    verifications: [],
  };

  try {
    const cap = evaluateVerifiedCapacity({
      package: emptyPackage as never,
      inputs: { get: () => ({ status: "MISSING" }) } as never,
      asOf: "2026-10-10",
    });
    capacityAttempts.push({ case: "empty-vep", result: cap });
  } catch (err) {
    capacityAttempts.push({
      case: "empty-vep",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  for (const amount of [50_000_000, 100_000_000]) {
    try {
      const sim = simulateVerifiedTransaction({
        package: emptyPackage as never,
        inputs: { get: () => ({ status: "MISSING" }) } as never,
        asOf: "2026-10-10",
        transaction: {
          kind: "INCUR_DEBT",
          amount,
          currency: "USD",
          secured: true,
        } as never,
        selectedPath: { pathId: "unset", elections: [] } as never,
      });
      simAttempts.push({ amount, result: sim });
    } catch (err) {
      simAttempts.push({
        amount,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  writeJson("stage-10-11-capacity-simulation.json", {
    capacityAttempts,
    simAttempts,
    note: "No authentic VerifiedExecutionPackage / capacityFormulas / Permissions for MTN. Fail-closed expected.",
  });

  const refused = capacityAttempts.every((a) => {
    const s = JSON.stringify(a);
    return /REFUSED|VERIFICATION_ARTIFACT_INCOMPLETE|error/i.test(s);
  });

  record({
    stage: "CAPACITY_ENGINE",
    status: refused ? "BLOCKED" : "ERROR",
    entryPoint: "lib/contract-model/verified-execution.ts#evaluateVerifiedCapacity",
    wallClockMs: Math.round(performance.now() - t0),
    paidInference: false,
    neonWrites: false,
    humanInterventions: 0,
    notes: [
      "No authentic VEP / legacy capacityFormulas / promoted Permissions for MTN on main.",
      "Capacity engine cannot produce verified gross/remaining capacity from source documents alone on this path.",
      refused
        ? "Fail-closed refusal observed for empty VEP (safety success, not product capacity proof)."
        : "Unexpected non-refusal for empty VEP — inspect artifact.",
    ],
    outputs: ["stage-10-11-capacity-simulation.json"],
  });
  record({
    stage: "TRANSACTION_SIMULATION",
    status: "BLOCKED",
    entryPoint: "lib/contract-model/verified-execution.ts#simulateVerifiedTransaction",
    wallClockMs: 0,
    paidInference: false,
    neonWrites: false,
    humanInterventions: 0,
    notes: [
      "$50M and $100M secured debt simulations attempted against empty VEP — expected REFUSED.",
      "Boundary / shared-basket sequential sims require an executable rulebook — not available for MTN without hand-modeling (refused).",
      "Separately labeled HYPOTHETICAL arithmetic scenario documented in 07-transaction-results.md using independent legal reference numbers, not product engine output.",
    ],
    outputs: ["stage-10-11-capacity-simulation.json"],
  });
}

function stageCustomerFacing() {
  const t0 = performance.now();
  record({
    stage: "CUSTOMER_FACING_ANSWER",
    status: "UNSUPPORTED",
    entryPoint:
      "app/[companyId]/{position,simulate,ask} — requires Neon company row + Permissions/VEP; production Neon writes forbidden",
    wallClockMs: Math.round(performance.now() - t0),
    paidInference: false,
    neonWrites: false,
    humanInterventions: 0,
    notes: [
      "DATABASE_URL points at Neon (ep-*.neon.tech). Mission forbids production Neon writes.",
      "No local Postgres provisioned in this environment.",
      "Therefore Position / Simulate / Ask UI were not populated for MTN.",
      "Customer-facing answer is the offline artifact bundle + honest NOT DETERMINED capacity posture.",
    ],
  });
}

async function main() {
  const started = new Date().toISOString();
  const docs = await stageSourceDocuments();
  const { index, kfStructure } = stageStructuralIndex(docs);
  await stageCovenantDiscovery(index, docs, kfStructure);
  const packageGraph = stagePackageGraph(docs);
  stageDefinitionResolution(index, docs);
  await stageAmendment(docs, packageGraph, index);
  stageRuleRepresentationThroughVerification();
  stageFinancialUtilizationBinding();
  stageCapacityAndSimulation();
  stageCustomerFacing();

  const summary = {
    mission: "HEADROOM_PRODUCT_PROOF_001",
    startedAt: started,
    finishedAt: new Date().toISOString(),
    gitHeadRef: testedSha,
    testedMainSha: "7f1dd3a202b026b9a862ef727480a1a9f284523a",
    packageId: "mtn-2026-tenth-ar-credit-agreement",
    paidInferenceAuthorized: false,
    neonWritesPerformed: false,
    stages,
    firstSuccessfulStage: stages.find((s) => s.status === "SUCCESS")?.stage ?? null,
    firstFailedOrUnsupportedStage:
      stages.find((s) =>
        s.status === "BLOCKED" || s.status === "UNSUPPORTED" || s.status === "ERROR",
      )?.stage ?? null,
  };
  writeJson("pipeline-execution-summary.json", summary);
  fs.writeFileSync(path.join(LOG_DIR, "pipeline-run.jsonl"), stages.map((s) => JSON.stringify(s)).join("\n") + "\n");
  console.log("\n=== PIPELINE SUMMARY ===");
  console.log(JSON.stringify({
    firstSuccessfulStage: summary.firstSuccessfulStage,
    firstFailedOrUnsupportedStage: summary.firstFailedOrUnsupportedStage,
    stages: stages.map((s) => `${s.stage}:${s.status}`),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
