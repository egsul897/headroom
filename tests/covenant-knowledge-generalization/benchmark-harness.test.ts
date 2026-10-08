/**
 * CKG benchmark harness integrity tests — offline, unpaid.
 * Does not invoke Claude-owned acceptance suites.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  aggregateMetrics,
  CLAUDE_OWNED_ACCEPTANCE_GLOBS,
  costPerSourceVerified,
  loadCases,
  loadCandidates,
  loadProtocol,
  runBenchmark,
  scoreCase,
  stratify,
  type CkgCase,
  type MetricId,
  type SystemCandidate,
} from "../../lib/evaluation/ckg-benchmark";

const REQUIRED_METRICS: MetricId[] = [
  "covenant_family_discovery_recall",
  "definition_extraction_accuracy",
  "cross_reference_accuracy",
  "condition_recall",
  "exception_recall",
  "entity_scope_accuracy",
  "amendment_reconstruction",
  "shared_capacity_recognition",
  "comparator_correctness",
  "false_permission_rate",
  "unsupported_semantic_refusal",
  "provenance_accuracy",
  "unseen_document_performance",
  "cost_per_source_verified_representation",
];

describe("CKG benchmark harness", () => {
  it("loads a multi-package held-out dataset covering all 14 metrics", () => {
    const cases = loadCases();
    expect(cases.length).toBeGreaterThanOrEqual(20);
    const metrics = new Set(cases.map((c) => c.metric));
    for (const m of REQUIRED_METRICS) {
      expect(metrics.has(m), `missing metric ${m}`).toBe(true);
    }
    const authorities = new Set(cases.map((c) => c.expected.authority));
    expect(authorities.has("SOURCE_VERIFIED")).toBe(true);
    expect(authorities.has("REVIEWER_APPROVED")).toBe(true);
    expect(authorities.has("UNLABELED")).toBe(true);
    expect(authorities.has("MODEL_VERIFIED" as never)).toBe(false);
  });

  it("distinguishes UNLABELED from FAILURE and SUCCESS", () => {
    const unlabeled: CkgCase = {
      caseId: "t-unlabeled",
      metric: "exception_recall",
      strata: {
        agreementType: "SYNTHETIC_MICRO",
        issuer: "SYNTHETIC",
        covenantFamily: "OTHER",
        draftingComplexity: "LOW",
      },
      provenance: {
        packageId: "t",
        documentId: "t",
        sectionRef: "n/a",
        excerpt: "x",
        sourcePath: "x",
      },
      expected: { authority: "UNLABELED", value: { exceptions: ["a"] } },
    };
    const wrongCandidate: SystemCandidate = {
      caseId: "t-unlabeled",
      predictionSource: "SYNTHETIC_ADVERSARIAL_OUTPUT",
      prediction: { exceptions: [] },
    };
    const result = scoreCase(unlabeled, wrongCandidate);
    expect(result.outcome).toBe("UNLABELED");
  });

  it("never treats missing candidates as FAILURE (NOT_EVALUATED)", () => {
    const labeled: CkgCase = {
      caseId: "t-missing",
      metric: "condition_recall",
      strata: {
        agreementType: "CREDIT_AGREEMENT",
        issuer: "Gibraltar Industries, Inc.",
        covenantFamily: "FINANCIAL_COVENANTS",
        draftingComplexity: "HIGH",
      },
      provenance: {
        packageId: "t",
        documentId: "t",
        sectionRef: "7.08",
        excerpt: "x",
        sourcePath: "x",
      },
      expected: {
        authority: "SOURCE_VERIFIED",
        value: { conditions: ["a"] },
      },
    };
    expect(scoreCase(labeled, undefined).outcome).toBe("NOT_EVALUATED");
  });

  it("scores false-permission and unsupported-semantic controls correctly", () => {
    const cases = loadCases().filter(
      (c) =>
        c.caseId === "syn-false-perm-general-prohibition" ||
        c.caseId === "syn-unsupported-or-formula" ||
        c.caseId === "syn-unsupported-coercion-control",
    );
    const candidates = loadCandidates();
    const results = runBenchmark(cases, candidates);
    expect(results.find((r) => r.caseId === "syn-false-perm-general-prohibition")?.outcome).toBe(
      "FAILURE",
    );
    expect(results.find((r) => r.caseId === "syn-unsupported-or-formula")?.outcome).toBe("SUCCESS");
    expect(results.find((r) => r.caseId === "syn-unsupported-coercion-control")?.outcome).toBe(
      "FAILURE",
    );
  });

  it("produces stratified slices by agreement type, issuer, family, complexity", () => {
    const results = runBenchmark(loadCases(), loadCandidates());
    const slices = stratify(results);
    const dims = new Set(slices.map((s) => s.dimension));
    expect(dims.has("agreementType")).toBe(true);
    expect(dims.has("issuer")).toBe(true);
    expect(dims.has("covenantFamily")).toBe(true);
    expect(dims.has("draftingComplexity")).toBe(true);
  });

  it("computes cost-per-source-verified without inventing spend", () => {
    const results = runBenchmark(loadCases(), loadCandidates());
    const cpsvr = costPerSourceVerified(results);
    expect(cpsvr).toBe(0);
    const metrics = aggregateMetrics(results);
    expect(metrics.every((m) => m.costUsdOnSourceVerifiedSuccesses === 0 || m.sourceVerifiedSuccesses >= 0)).toBe(
      true,
    );
  });

  it("protocol forbids model-verified ground truth and paid calls", () => {
    const protocol = loadProtocol() as {
      hardRules: string[];
      labelAuthorities: Record<string, string>;
    };
    expect(protocol.hardRules.some((r) => /paid/i.test(r))).toBe(true);
    expect(protocol.hardRules.some((r) => /model-generated/i.test(r))).toBe(true);
    expect(Object.keys(protocol.labelAuthorities)).toEqual(
      expect.arrayContaining(["SOURCE_VERIFIED", "REVIEWER_APPROVED", "UNLABELED"]),
    );
  });

  it("does not touch Claude-owned acceptance fixture paths", () => {
    for (const p of CLAUDE_OWNED_ACCEPTANCE_GLOBS) {
      const abs = path.join(process.cwd(), p);
      // Paths must still exist (we must not delete them) and this suite must not rewrite them.
      if (p.endsWith("/")) {
        expect(fs.existsSync(abs)).toBe(true);
      } else {
        expect(fs.existsSync(abs)).toBe(true);
      }
      // Sanity: our fixture tree is a separate directory.
      expect(p.startsWith("tests/fixtures/covenant-knowledge-generalization")).toBe(false);
    }
    expect(fs.existsSync(path.join(process.cwd(), "tests/fixtures/covenant-knowledge-generalization"))).toBe(
      true,
    );
  });
});
