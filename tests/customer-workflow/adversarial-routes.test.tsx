/**
 * HEADROOM-4 adversarial route/component tests.
 * No false favorable customer claim is acceptable.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import { CapacityClaimRow } from "@/components/customer-workflow/CapacityClaimRow";
import { WorkflowJourney } from "@/components/customer-workflow/WorkflowJourney";
import { VerifiedSimulatePanel } from "@/components/VerifiedSimulatePanel";
import {
  allCustomerStatusCodes,
  formatCustomerAmountMillions,
  mapAskAnswerKindToCustomerStatus,
  mapEngineLabelToCustomerStatus,
  mapSimulateStatusToCustomerStatus,
  presentCapacityClaim,
  presentCustomerStatus,
  wouldBeFalseFavorableAvailable,
} from "@/lib/customer-workflow/status-contract";
import { buildPositionView } from "@/lib/customer-workflow/position-view";
import {
  buildEvidenceReviewView,
  explainRuleExecutability,
} from "@/lib/customer-workflow/evidence-view";
import { presentAskAnswer } from "@/lib/customer-workflow/ask-view";
import type { CapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import type { RulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";

const readinessBase: CapacityReadiness = {
  companyId: "adv-co",
  status: "NO_FINANCIAL_SNAPSHOT",
  canEvaluateExecutableCapacity: false,
  capacityAuthority: "NONE",
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
  companyId: "adv-co",
  stage: "DISCOVERED",
  discoveredSummaries: 0,
  interpretedProvisions: 0,
  reviewedPermissions: 0,
  executablePermissions: 0,
  provisionRows: 0,
  blockers: ["No counsel-reviewed permissions"],
  headline: "test",
  note: "test",
};

describe("customer status contract", () => {
  it("exposes every required status code with mayPublishAvailable false except verified paths", () => {
    const codes = allCustomerStatusCodes();
    for (const required of [
      "VERIFIED_EXECUTABLE",
      "PARTIAL",
      "UNSUPPORTED",
      "AMBIGUOUS",
      "REVIEW_REQUIRED",
      "NEEDS_INPUT",
      "NOT_PRODUCTION_AUTHORITATIVE",
      "VERIFIED_UTILIZATION_COMPLETE",
      "UNKNOWN",
      "GROSS_CONTRACTUAL",
      "HYPOTHETICAL",
    ] as const) {
      expect(codes).toContain(required);
    }
    expect(presentCustomerStatus("UNKNOWN").mayPublishAvailable).toBe(false);
    expect(presentCustomerStatus("GROSS_CONTRACTUAL").mayPublishAvailable).toBe(false);
    expect(presentCustomerStatus("HYPOTHETICAL").mayPublishAvailable).toBe(false);
    expect(presentCustomerStatus("NOT_PRODUCTION_AUTHORITATIVE").mayPublishAvailable).toBe(false);
    expect(presentCustomerStatus("VERIFIED_EXECUTABLE").mayPublishAvailable).toBe(true);
  });

  it("never collapses UNKNOWN into zero or unlimited", () => {
    expect(formatCustomerAmountMillions(null)).toBe("—");
    expect(formatCustomerAmountMillions(undefined)).toBe("—");
    expect(formatCustomerAmountMillions(Number.NaN)).toBe("—");
    const unknown = presentCapacityClaim({
      claimKind: "REMAINING",
      amountMillions: null,
      publicationLabel: "UNKNOWN",
    });
    expect(unknown.displayValue).toBe("—");
    expect(unknown.displayValue).not.toMatch(/\$0/);
    expect(unknown.displayValue.toLowerCase()).not.toContain("unlimited");
  });

  it("does not label GROSS_CONTRACTUAL as AVAILABLE", () => {
    const gross = presentCapacityClaim({
      claimKind: "GROSS_CONTRACTUAL",
      amountMillions: 500,
      publicationLabel: "GROSS_CONTRACTUAL",
    });
    expect(gross.status).toBe("GROSS_CONTRACTUAL");
    expect(gross.claimLabel.toLowerCase()).not.toContain("available");
    expect(wouldBeFalseFavorableAvailable({ statusCode: "GROSS_CONTRACTUAL" })).toBe(true);
  });

  it("maps legacy AVAILABLE / CLEAR to non-authoritative customer statuses", () => {
    expect(mapEngineLabelToCustomerStatus("AVAILABLE")).toBe("NOT_PRODUCTION_AUTHORITATIVE");
    expect(mapEngineLabelToCustomerStatus("CLEAR")).toBe("HYPOTHETICAL");
    expect(mapSimulateStatusToCustomerStatus("clear")).toBe("HYPOTHETICAL");
    expect(mapAskAnswerKindToCustomerStatus("legacy_labeled")).toBe("HYPOTHETICAL");
    expect(mapAskAnswerKindToCustomerStatus("certified", { verifiedExecutable: false })).toBe(
      "REVIEW_REQUIRED",
    );
  });
});

describe("missing utilization", () => {
  it("Position view withholds authoritative remaining when ledger utilization is missing", () => {
    const view = buildPositionView({
      companyId: "adv-co",
      dashboard: null,
      readiness: { ...readinessBase, contractLedgerActiveCount: 0 },
      rulebook: rulebookBase,
      dashboardError: "No authenticated financial snapshot",
    });
    expect(view.remainingAuthoritative).toBe(false);
    expect(view.missingInputs.some((m) => /utilization/i.test(m))).toBe(true);
    for (const side of view.sides) {
      expect(side.remaining.claimLabel).not.toMatch(/^AVAILABLE$/i);
      expect(side.remaining.status).not.toBe("VERIFIED_EXECUTABLE");
    }
  });
});

describe("missing authenticated financials", () => {
  it("surfaces NEEDS_INPUT / UNKNOWN and never invents remaining", () => {
    const view = buildPositionView({
      companyId: "adv-co",
      dashboard: null,
      readiness: readinessBase,
      rulebook: rulebookBase,
      dashboardError: "No authenticated financial snapshot — engine position unavailable (not zero).",
    });
    expect(view.missingInputs.join(" ")).toMatch(/financial|snapshot/i);
    expect(view.sides.every((s) => s.remaining.displayValue === "—")).toBe(true);
    const html = renderToStaticMarkup(<StatusChip code="NEEDS_INPUT" />);
    expect(html).toMatch(/Needs input|NEEDS_INPUT/);
  });
});

describe("ambiguous covenant / conflicting amendments", () => {
  it("marks unresolved amendment precedence as AMBIGUOUS and blocks executability", () => {
    const evidence = buildEvidenceReviewView({
      companyId: "adv-co",
      documents: [{ id: "d1", name: "CA", type: "CREDIT_AGREEMENT", analysisOk: true }],
      clauses: [
        {
          sourceId: "s1",
          sectionRef: "7.2(a)",
          heading: "Indebtedness",
          citation: "§7.2(a)",
          unresolvedQuestions: ["Ambiguous basket interaction"],
        },
      ],
      amendment: {
        operativeResolution: "UNRESOLVED_PRECEDENCE",
        unresolvedReasons: ["Conflicting amendments on §7.2"],
      },
    });
    expect(evidence.overallStatus).toBe("AMBIGUOUS");
    expect(evidence.amendment?.conflicting).toBe(true);
    const exec = explainRuleExecutability({
      executable: false,
      blockers: ["AMBIGUOUS_COVENANT"],
      missingCitations: false,
      utilizationComplete: false,
      amendmentResolved: false,
    });
    expect(exec.status).toBe("AMBIGUOUS");
  });
});

describe("unsupported rule", () => {
  it("Ask presentation refuses permission when engine cannot establish it", () => {
    const ask = presentAskAnswer({
      answerKind: "refused",
      verifiedExecutable: false,
      verifiedBlockers: ["UNSUPPORTED_RULE"],
    });
    expect(ask.answerStatus).toBe("UNSUPPORTED");
    expect(ask.permissionNotEstablished).toBe(true);
    expect(ask.explicitLimitations.join(" ")).toMatch(/not established|blocker/i);
  });
});

describe("provisional document identity", () => {
  it("flags provisional identity as AMBIGUOUS reviewer work", () => {
    const evidence = buildEvidenceReviewView({
      companyId: "adv-co",
      documents: [
        {
          id: "d1",
          name: "Unknown indenture",
          type: "INDENTURE",
          analysisOk: true,
          provisionalIdentity: true,
        },
      ],
    });
    expect(evidence.documents[0]!.customerStatus).toBe("AMBIGUOUS");
    expect(evidence.reviewerRequired.join(" ")).toMatch(/provisional document identity/i);
  });
});

describe("hypothetical versus authoritative result", () => {
  it("Simulate CLEAR maps to HYPOTHETICAL; verified panel distinguishes executable", () => {
    expect(mapSimulateStatusToCustomerStatus("clear")).toBe("HYPOTHETICAL");
    expect(
      mapSimulateStatusToCustomerStatus("clear", { verifiedExecutable: true, authoritative: true }),
    ).toBe("VERIFIED_EXECUTABLE");

    const notExec = renderToStaticMarkup(
      <VerifiedSimulatePanel
        summary={{
          executable: false,
          blockers: ["NO_VEP"],
          capacityOutcome: null,
          simulationOutcome: null,
          simulationStatus: null,
          selectedPathResult: null,
          pathCandidateCount: 0,
          pathAutoSelected: false,
          capacityExecutedWithoutPermission: false,
          selectedPathId: null,
          authorityNote: "not verified",
        }}
      />,
    );
    expect(notExec).toMatch(/UNSUPPORTED|NOT EXECUTABLE/);
    expect(notExec).not.toMatch(/AVAILABLE/);

    const exec = renderToStaticMarkup(
      <VerifiedSimulatePanel
        summary={{
          executable: true,
          blockers: [],
          capacityOutcome: "CLEAR",
          simulationOutcome: "CLEAR",
          simulationStatus: "SIMULATED",
          selectedPathResult: "SATISFIED",
          pathCandidateCount: 1,
          pathAutoSelected: false,
          capacityExecutedWithoutPermission: false,
          selectedPathId: "path-1",
          authorityNote: "REQUIRE",
        }}
      />,
    );
    expect(exec).toMatch(/VERIFIED_EXECUTABLE|Verified executable/);
    expect(exec).toMatch(/HYPOTHETICAL|Hypothetical/);
  });

  it("SimulateClient source no longer subtracts capacity in React", () => {
    const src = readFileSync(
      path.join(process.cwd(), "app/[companyId]/simulate/SimulateClient.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/overallCapacity \?\? 0\)\s*-\s*simAmt/);
    expect(src).toMatch(/HYPOTHETICAL/);
    expect(src).toMatch(/LEGACY_ENGINE/);
    expect(src).toMatch(/recomputed in the UI/);
    expect(src).toMatch(/no capacity/);
  });
});

describe("source citation missing", () => {
  it("Evidence journey requires citation and Ask flags missing citations", () => {
    const evidence = buildEvidenceReviewView({
      companyId: "adv-co",
      documents: [{ id: "d1", name: "CA", type: "CREDIT_AGREEMENT", analysisOk: true }],
      clauses: [
        {
          sourceId: "s1",
          sectionRef: "7.1",
          heading: "Liens",
          citation: null,
        },
      ],
    });
    expect(evidence.reviewerRequired.join(" ")).toMatch(/citation missing/i);
    const ask = presentAskAnswer({
      answerKind: "review_required",
      verifiedExecutable: false,
      citations: [],
    });
    expect(ask.sourceCitations.length).toBe(0);
    expect(ask.permissionNotEstablished).toBe(true);
  });
});

describe("legacy gross capacity", () => {
  it("MODELED remaining is NOT_PRODUCTION_AUTHORITATIVE — never AVAILABLE", () => {
    const claim = presentCapacityClaim({
      claimKind: "REMAINING",
      amountMillions: 250,
      remainingIsAuthoritative: false,
      publicationLabel: "MODELED_CROSS_DOCUMENT",
    });
    expect(claim.status).toBe("NOT_PRODUCTION_AUTHORITATIVE");
    expect(claim.claimLabel).toBe("MODELED / NOT VERIFIED");
    expect(claim.claimLabel).not.toMatch(/AVAILABLE/i);

    const html = renderToStaticMarkup(
      <CapacityClaimRow label="Secured remaining" claim={claim} citations={[]} />,
    );
    expect(html).toMatch(/MODELED \/ NOT VERIFIED/);
    expect(html).not.toMatch(/>AVAILABLE</);
  });
});

describe("shared-capacity uncertainty", () => {
  it("PARTIAL attributed usage never publishes AVAILABLE remaining", () => {
    const usage = presentCapacityClaim({
      claimKind: "ATTRIBUTED_USAGE",
      amountMillions: 50,
      utilizationComplete: false,
    });
    expect(usage.status).toBe("PARTIAL");
    const remaining = presentCapacityClaim({
      claimKind: "REMAINING",
      amountMillions: 150,
      remainingIsAuthoritative: false,
      publicationLabel: "KNOWN_ATTRIBUTED_ONLY",
    });
    expect(remaining.status).toBe("NOT_PRODUCTION_AUTHORITATIVE");
    expect(mapEngineLabelToCustomerStatus("PARTIAL_ATTRIBUTED_USAGE")).toBe("PARTIAL");
    expect(mapEngineLabelToCustomerStatus("SHARED_POOL")).toBe("PARTIAL");
  });
});

describe("journey navigation", () => {
  it("renders the CFO workflow without inventing numbers", () => {
    const html = renderToStaticMarkup(<WorkflowJourney companyId="adv-co" current="position" />);
    expect(html).toMatch(/Documents/);
    expect(html).toMatch(/Position/);
    expect(html).toMatch(/Ask/);
    expect(html).toMatch(/Simulate/);
    expect(html).toMatch(/Evidence/);
    expect(html).not.toMatch(/\$\d/);
  });
});

describe("route source guards", () => {
  it("Position page labels remaining non-authoritative and references PR #268 gap", () => {
    const src = readFileSync(path.join(process.cwd(), "app/[companyId]/position/page.tsx"), "utf8");
    expect(src).toMatch(/MODELED \/ NOT VERIFIED|NOT_PRODUCTION_AUTHORITATIVE|remainingIsAuthoritative: false/);
    expect(src).toMatch(/#268|PR #268/);
    expect(src).toMatch(/buildPositionView/);
    expect(src).not.toMatch(/remainingCapacity.*AVAILABLE/);
  });

  it("Ask shell presents structured status and refuses narrative upgrade", () => {
    const src = readFileSync(path.join(process.cwd(), "components/ask/AskShell.tsx"), "utf8");
    expect(src).toMatch(/presentAskAnswer/);
    expect(src).toMatch(/permissionNotEstablished/);
    expect(src).toMatch(/Utilization completeness/);
  });
});
