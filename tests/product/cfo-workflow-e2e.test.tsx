/**
 * Agent 3 — CFO product workflow presentation / honesty acceptance.
 *
 * These cases exercise issuer-neutral presentation assemblers with constructed
 * inputs. They are NOT full browser or database-backed end-to-end acceptance.
 *
 * Server-side access gating + authority integration coverage lives in
 * `tests/product/cfo-workflow-access-integration.test.ts`.
 *
 * Demonstrates Matthews + CONMED (second authentic issuer) without companyId
 * branches in generic product code.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowJourney } from "@/components/customer-workflow/WorkflowJourney";
import {
  buildUploadPackageView,
  buildAnalyzeView,
  buildReviewView,
  buildEvidenceReviewView,
  buildPositionView,
  buildSimulateView,
  buildAuditView,
  buildCfoWorkflowState,
  separateCapacityClaimsFromProductView,
  assertPositionSimulateCapacityConsistency,
  refuseCrossTenantCompanyId,
  gateWorkspaceAccess,
  customerWorkflowJourney,
  canonicalizeWorkflowStepId,
  presentCapacityClaim,
} from "@/lib/customer-workflow";
import type { CapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import type { RulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity/identity/activation";
import { authorizeDecision } from "@/lib/capacity/identity/authorize-decision";
import { PERMISSION_BUNDLES } from "@/lib/capacity/identity/permissions";

const readinessBase: CapacityReadiness = {
  companyId: "cfo-e2e",
  status: "DISCOVERY_ONLY",
  canEvaluateExecutableCapacity: false,
  capacityAuthority: "DISCOVERY_ONLY",
  analyzedDocumentCount: 0,
  summaryCount: 0,
  permissionCount: 0,
  unverifiedPermissionCount: 0,
  provisionCount: 0,
  hasFinancialSnapshot: false,
  ns4ApprovedSnapshotCount: 0,
  approvedNorthStarSnapshotCount: 0,
  contractLedgerActiveCount: 0,
  phase3TrustedUnitCount: 0,
  phase3TrustedRuleCount: 0,
  headline: "test",
  blockers: ["No dated FinancialState"],
  guidance: "fail closed",
};

const rulebookBase: RulebookReadiness = {
  companyId: "cfo-e2e",
  stage: "INTERPRETED",
  discoveredSummaries: 2,
  interpretedProvisions: 2,
  reviewedPermissions: 0,
  executablePermissions: 0,
  provisionRows: 2,
  blockers: ["No counsel-reviewed permissions"],
  headline: "test",
  note: "test",
};

function packageForIssuer(companyId: string, opts?: {
  extractionFailed?: boolean;
  unsupported?: boolean;
  amendmentUnresolved?: boolean;
  analyzed?: boolean;
}) {
  return buildUploadPackageView({
    companyId,
    documents: [
      {
        id: `${companyId}-ca`,
        name: "Credit Agreement",
        type: "CREDIT_AGREEMENT",
        role: "CREDIT_AGREEMENT",
        analysisOk: opts?.analyzed === true && !opts?.extractionFailed,
        processingStatus: opts?.extractionFailed
          ? "FAILED"
          : opts?.unsupported
            ? "UNSUPPORTED"
            : opts?.analyzed
              ? "ANALYZED"
              : "STAGED_PENDING_ANALYSIS",
        extractionStatus: opts?.unsupported
          ? "UNSUPPORTED_FORMAT"
          : opts?.extractionFailed
            ? "FAILED"
            : opts?.analyzed
              ? "CANDIDATES_DISCOVERED"
              : "PENDING",
        analysisError: opts?.extractionFailed ? "parse failed" : null,
        covenantItemCount: opts?.analyzed ? 3 : 0,
      },
    ],
    amendmentUnresolved: opts?.amendmentUnresolved,
    operativeAuthorityUncertainty: opts?.amendmentUnresolved
      ? ["Later restatement unresolved"]
      : [],
  });
}

describe("CFO workflow journey shape", () => {
  it("orders Upload → Analyze → Review → Position → Simulate → Audit", () => {
    const steps = customerWorkflowJourney("any-co").map((s) => s.id);
    expect(steps).toEqual(["upload", "analyze", "review", "position", "simulate", "audit"]);
    expect(canonicalizeWorkflowStepId("documents")).toBe("upload");
    expect(canonicalizeWorkflowStepId("evidence")).toBe("audit");
    const html = renderToStaticMarkup(<WorkflowJourney companyId="any-co" current="documents" />);
    expect(html).toMatch(/Upload/);
    expect(html).toMatch(/Audit/);
  });

  it("generic product routes have no Matthews / MHK companyId branches", () => {
    const files = [
      "app/[companyId]/analyze/page.tsx",
      "app/[companyId]/review/page.tsx",
      "app/[companyId]/audit/page.tsx",
      "lib/customer-workflow/assemble-cfo-workflow.ts",
      "lib/customer-workflow/capacity-state.ts",
      "lib/customer-workflow/journey.ts",
    ];
    for (const f of files) {
      const src = readFileSync(path.join(process.cwd(), f), "utf8");
      expect(src).not.toMatch(/companyId\s*===\s*["']matthews/i);
      expect(src).not.toMatch(/companyId\s*===\s*["']mhk/i);
      expect(src).not.toMatch(/if\s*\(\s*companyId\s*===\s*["']matthews-international["']/i);
    }
  });
});

describe("A. Onboarding / Upload", () => {
  it("new company onboarding shows empty package — upload ≠ analysis success", () => {
    const upload = buildUploadPackageView({ companyId: "new-co", documents: [] });
    expect(upload.documentsReceived).toHaveLength(0);
    expect(upload.uploadIsNotAnalysisSuccess).toBe(true);
    expect(upload.overallStatus).toBe("NEEDS_INPUT");
    expect(upload.missingDocuments.length).toBeGreaterThan(0);
  });

  it("authentic document upload records receipt without implying analysis success", () => {
    const upload = packageForIssuer("matthews-international", { analyzed: false });
    expect(upload.documentsReceived[0]!.analysisSucceeded).toBe(false);
    expect(upload.processingSummary.STAGED + upload.processingSummary.RECEIVED_NOT_ANALYZED).toBeGreaterThan(0);
    expect(upload.overallGuidance).toMatch(/upload records receipt only/i);
  });

  it("extraction failure surfaces errors — not ANALYZED", () => {
    const upload = packageForIssuer("issuer-a", { extractionFailed: true });
    expect(upload.extractionErrors.length).toBeGreaterThan(0);
    expect(upload.documentsReceived[0]!.analysisSucceeded).toBe(false);
    expect(upload.overallStatus).toBe("REVIEW_REQUIRED");
  });

  it("unsupported files are listed separately", () => {
    const upload = packageForIssuer("issuer-a", { unsupported: true });
    expect(upload.unsupportedFiles).toHaveLength(1);
    expect(upload.documentsReceived[0]!.processingState).toBe("UNSUPPORTED");
  });
});

describe("B. Review honesty", () => {
  it("unresolved amendment blocks as AMBIGUOUS / outstanding blocker", () => {
    const upload = packageForIssuer("issuer-a", { analyzed: true, amendmentUnresolved: true });
    const analyze = buildAnalyzeView({ companyId: "issuer-a", upload });
    const evidence = buildEvidenceReviewView({
      companyId: "issuer-a",
      documents: upload.documentsReceived.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.role,
        analysisOk: d.analysisSucceeded,
        processingStatus: d.processingState,
        extractionStatus: d.extractionStatus,
      })),
      amendment: {
        operativeResolution: "UNRESOLVED_PRECEDENCE",
        unresolvedReasons: ["Competing restatement"],
      },
    });
    const review = buildReviewView({
      companyId: "issuer-a",
      evidence,
      rulebook: rulebookBase,
      readiness: readinessBase,
    });
    expect(review.overallStatus === "AMBIGUOUS" || review.outstandingBlockers.some((b) => /amend|precedence|restatement/i.test(b))).toBe(true);
    expect(review.executableRuleCoverage.fabricatedReviewed).toBe(false);
    expect(review.executableRuleCoverage.stage).toBe("INTERPRETED");
    expect(analyze.operativeAuthorityUncertainty.length).toBeGreaterThan(0);
  });

  it("does not fabricate REVIEWED or APPROVED from INTERPRETED stage", () => {
    const upload = packageForIssuer("issuer-a", { analyzed: true });
    const evidence = buildEvidenceReviewView({
      companyId: "issuer-a",
      documents: upload.documentsReceived.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.role,
        analysisOk: true,
      })),
      clauses: [
        {
          sourceId: "s1",
          sectionRef: "§7.01",
          heading: "Indebtedness",
          decision: null,
          citation: null,
        },
      ],
    });
    const review = buildReviewView({
      companyId: "issuer-a",
      evidence,
      rulebook: { ...rulebookBase, stage: "INTERPRETED" },
      readiness: readinessBase,
    });
    expect(review.executableRuleCoverage.stage).not.toMatch(/REVIEWED|APPROVED/);
    expect(review.approvals.every((a) => !a.hasRecordedDecision)).toBe(true);
    expect(review.outstandingBlockers.some((b) => /not fabricated/i.test(b))).toBe(true);
  });
});

describe("C. Position capacity separation", () => {
  it("missing financial evidence keeps remaining unavailable — not zero", () => {
    const position = buildPositionView({
      companyId: "issuer-a",
      dashboard: null,
      readiness: readinessBase,
      rulebook: rulebookBase,
      dashboardError: "No authenticated financial snapshot",
    });
    expect(position.remainingAuthoritative).toBe(false);
    expect(position.missingInputs.some((m) => /financial|snapshot/i.test(m))).toBe(true);
    for (const side of position.sides) {
      expect(side.remaining.displayValue).not.toMatch(/\$0/);
      expect(side.remaining.status).not.toBe("VERIFIED_EXECUTABLE");
    }
  });

  it("missing utilization completeness never becomes zero remaining", () => {
    const claims = separateCapacityClaimsFromProductView(null, {
      modeledAmountMillions: null,
      missingInputs: ["No active attributed utilization ledger rows"],
    });
    expect(claims.verifiedRemaining.amountMillions).toBeNull();
    expect(claims.verifiedRemaining.displayValue).toBe("—");
    expect(claims.unknownUnsupported.status).toMatch(/UNKNOWN|NEEDS_INPUT|UNSUPPORTED/);
    expect(claims.remainingAuthoritative).toBe(false);
  });

  it("null remaining is not converted into a modeled number", () => {
    const claims = separateCapacityClaimsFromProductView(null, {
      modeledAmountMillions: 250,
      missingInputs: [],
    });
    expect(claims.hypotheticalModeled.amountMillions).toBe(250);
    expect(claims.verifiedRemaining.amountMillions).toBeNull();
    expect(claims.verifiedRemaining.claimLabel).not.toMatch(/^AVAILABLE$/i);
  });

  it("unsupported covenant surfaces as non-authoritative", () => {
    const claim = presentCapacityClaim({
      claimKind: "UNAVAILABLE",
      amountMillions: null,
      publicationLabel: "UNSUPPORTED",
      unavailableReason: "Covenant family not executable",
    });
    expect(claim.status).not.toBe("VERIFIED_EXECUTABLE");
    expect(claim.amountMillions).toBeNull();
  });
});

describe("D. Simulate shares Position capacity state", () => {
  it("valid hypothetical simulation never posts to ledger and stays HYPOTHETICAL", () => {
    const pre = separateCapacityClaimsFromProductView(null, {
      modeledAmountMillions: 100,
      missingInputs: ["No VEP"],
    });
    const sim = buildSimulateView({
      companyId: "issuer-a",
      amountMillions: 25,
      currency: "USD",
      verified: null,
      preCapacity: pre,
      readinessBlockers: ["No VEP"],
    });
    expect(sim.postsToLedger).toBe(false);
    expect(sim.overallStatus).toBe("HYPOTHETICAL");
    expect(sim.executable).toBe(false);
    expect(sim.preTransactionCapacity).toEqual(pre);
  });

  it("Position and Simulate capacity claims stay consistent", () => {
    const claims = separateCapacityClaimsFromProductView(null, {
      modeledAmountMillions: 80,
      missingInputs: ["utilization incomplete"],
    });
    const check = assertPositionSimulateCapacityConsistency(claims, claims);
    expect(check).toEqual({ ok: true });
    const drifted = separateCapacityClaimsFromProductView(null, {
      modeledAmountMillions: 80,
      missingInputs: [],
    });
    // verified remaining both null — still consistent on authoritative fields
    expect(assertPositionSimulateCapacityConsistency(claims, drifted).ok).toBe(true);
  });
});

describe("E. Audit publishability", () => {
  it("explains non-publishable result while trusted identity is BLOCKED", () => {
    const upload = packageForIssuer("issuer-a", { analyzed: true });
    const analyze = buildAnalyzeView({
      companyId: "issuer-a",
      upload,
      canEvaluateExecutableCapacity: false,
    });
    const evidence = buildEvidenceReviewView({
      companyId: "issuer-a",
      documents: upload.documentsReceived.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.role,
        analysisOk: true,
      })),
    });
    const review = buildReviewView({
      companyId: "issuer-a",
      evidence,
      rulebook: rulebookBase,
      readiness: readinessBase,
    });
    const capacity = separateCapacityClaimsFromProductView(null, {
      modeledAmountMillions: 50,
      missingInputs: readinessBase.blockers,
    });
    const audit = buildAuditView({ companyId: "issuer-a", analyze, review, capacity });
    expect(audit.publishability.publishable).toBe(false);
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");
    expect(audit.publishability.reasons.some((r) => /trusted identity|BLOCKED/i.test(r))).toBe(true);
    expect(audit.assumptionsMade.some((a) => /GROSS|AVAILABLE|MODELED/i.test(a))).toBe(true);
  });
});

describe("F. Cross-tenant / forged identity refusal (unit)", () => {
  it("refuseCrossTenantCompanyId blocks out-of-scope company", () => {
    const ok = refuseCrossTenantCompanyId({
      requestedCompanyId: "tenant-b",
      allowedCompanyIds: ["tenant-a"],
    });
    expect(ok.ok).toBe(false);
    if (!ok.ok) expect(ok.blockers.join(" ")).toMatch(/cross-tenant/i);
  });

  it("forged principal is refused (DB-backed gate coverage in access-integration)", async () => {
    const forged = await gateWorkspaceAccess({
      companyId: "tenant-b",
      principal: { role: "admin", companyId: "tenant-a" },
      companyIdentity: { id: "tenant-b", tenantKind: "CUSTOMER" },
    });
    expect(forged.allowed).toBe(false);
    const denied = await authorizeDecision({
      principal: { role: "COUNSEL_REVIEWER", actorId: "forged" },
      companyId: "tenant-b",
      decision: "AUTHORIZE_PRODUCTION_CAPACITY",
    });
    expect(denied.granted).toBe(false);
    expect(PERMISSION_BUNDLES.PRODUCTION_CAPACITY_AUTHORIZER).toContain("AUTHORIZE_PRODUCTION_CAPACITY");
  });
});

describe("G. Demonstration — Matthews + second authentic issuer (CONMED)", () => {
  it("Matthews authentic financial fixture exists and stays non-production", () => {
    const matthewsPath = path.join(
      process.cwd(),
      "tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json",
    );
    expect(existsSync(matthewsPath)).toBe(true);
    const fixture = JSON.parse(readFileSync(matthewsPath, "utf8")) as {
      companyId: string;
      label: string;
    };
    expect(fixture.companyId).toMatch(/matthews/i);
    expect(fixture.label).toMatch(/AUTHENTIC/i);

    const upload = packageForIssuer(fixture.companyId, { analyzed: true });
    const analyze = buildAnalyzeView({
      companyId: fixture.companyId,
      upload,
      canEvaluateExecutableCapacity: false,
      compilationLimitation:
        "Backend executable compilation incomplete for this workspace — UI exposes limitation; no fixture capacity fill.",
    });
    expect(analyze.compilationLimitation).toMatch(/incomplete|limitation/i);
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");
  });

  it("second authentic issuer (CONMED package) uses the same issuer-neutral workflow assemblers", () => {
    const conmedFixture = path.join(
      process.cwd(),
      "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
    );
    expect(existsSync(conmedFixture)).toBe(true);

    const upload = packageForIssuer("conmed-demo", { analyzed: true, amendmentUnresolved: true });
    const analyze = buildAnalyzeView({ companyId: "conmed-demo", upload, canEvaluateExecutableCapacity: false });
    const evidence = buildEvidenceReviewView({
      companyId: "conmed-demo",
      documents: upload.documentsReceived.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.role,
        analysisOk: true,
      })),
      amendment: {
        operativeResolution: "UNRESOLVED_PRECEDENCE",
        unresolvedReasons: ["Omnibus amendment precedence unresolved"],
      },
    });
    const review = buildReviewView({
      companyId: "conmed-demo",
      evidence,
      rulebook: rulebookBase,
      readiness: readinessBase,
    });
    const capacity = separateCapacityClaimsFromProductView(null, {
      modeledAmountMillions: null,
      missingInputs: ["Utilization completeness unknown"],
    });
    const position = buildPositionView({
      companyId: "conmed-demo",
      dashboard: null,
      readiness: readinessBase,
      rulebook: rulebookBase,
      separatedClaims: { secured: capacity, unsecured: capacity },
    });
    const simulate = buildSimulateView({
      companyId: "conmed-demo",
      amountMillions: 10,
      preCapacity: capacity,
      readinessBlockers: readinessBase.blockers,
    });
    const audit = buildAuditView({
      companyId: "conmed-demo",
      analyze,
      review,
      capacity,
    });
    const state = buildCfoWorkflowState({
      companyId: "conmed-demo",
      upload,
      analyze,
      review,
      position,
      simulate,
      audit,
      capacity,
    });

    expect(state.productionReady).toBe(false);
    expect(state.steps.map((s) => s.id)).toEqual([
      "upload",
      "analyze",
      "review",
      "position",
      "simulate",
      "audit",
    ]);
    expect(audit.publishability.publishable).toBe(false);
    expect(simulate.postsToLedger).toBe(false);
    expect(assertPositionSimulateCapacityConsistency(capacity, simulate.preTransactionCapacity!).ok).toBe(
      true,
    );
  });
});
