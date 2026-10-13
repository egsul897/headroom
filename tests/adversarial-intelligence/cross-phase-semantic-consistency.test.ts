/**
 * Parallel Adversarial Intelligence — Mission 1
 * Cross-phase semantic consistency counterexamples.
 *
 * These tests encode North Star v2 / utilization-authority fail-closed invariants.
 * `it.fails` cases document CONFIRMED defects at starting SHA (failing-before evidence).
 * Passing cases document existing safeguards that already prevent the suspected collapse.
 *
 * Production code is not modified. Evaluation fixtures are not altered.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { computeOperativeDocument } from "@/lib/contract-model/compiler/amendment/chain";
import type { AmendmentEffectCandidate } from "@/lib/contract-model/compiler/amendment/types";
import { resolveGoverningProvision } from "@/lib/contract-model/compiler/operative-authority";
import type { RestatementAuthorityResolution } from "@/lib/contract-model/compiler/operative-authority";
import { buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import { decideSolverUtilizationAuthority } from "@/lib/capacity/utilization-authority";
import { computeVerifiedRemaining } from "@/lib/capacity/verified-remaining";
import { resolveUtilization } from "@/lib/capacity/utilization-resolver";
import { evaluateProvision } from "@/lib/covenant-engine";
import { adaptLegacyCovenantProvision } from "@/lib/contract-model/ir/legacy-adapter";
import {
  AS_OF,
  CO,
  INST,
  MONEY,
  UNSUPPORTED,
  amountString,
  resetIds,
  rule,
} from "../contract-model/runtime/capacity/helpers";
import {
  cash,
  consume,
  nodeOf,
  proposal,
  provision,
  resetIds as resetTxIds,
  route,
  simulate,
  world,
} from "../contract-model/runtime/transaction/helpers";

beforeEach(() => {
  resetIds();
  resetTxIds();
});

function restateEffect(opts: {
  effectId: string;
  amendmentDocumentId: string;
  targetDocumentId: string;
  date: string;
  status?: AmendmentEffectCandidate["status"];
  unresolvedReason?: string | null;
}): AmendmentEffectCandidate {
  return {
    effectId: opts.effectId,
    amendmentDocumentId: opts.amendmentDocumentId,
    target: {
      kind: "DOCUMENT",
      targetDocumentId: opts.targetDocumentId,
      targetInstrumentKey: "instrument:family",
      targetStructuralNodeKey: null,
      targetSectionRef: null,
      targetDefinedTermRef: null,
      targetHint: null,
    },
    operation: "RESTATE_AGREEMENT",
    effectiveDate: {
      date: opts.date,
      status: "EXPLICIT_EFFECTIVE_DATE",
      evidence: opts.date,
      reason: "adversarial fixture",
    },
    newText: null,
    oldText: null,
    sourceCitation: "adversarial fixture",
    sourceExcerpt: "adversarial fixture",
    confidence: 0.55,
    status: opts.status ?? "RESOLVED",
    unresolvedReason: opts.unresolvedReason ?? null,
    resolutionMethod: "DETERMINISTIC_CHRONOLOGICAL_PREDECESSOR",
  };
}

function confirmedUnknownScope(
  successorDocumentId: string,
  predecessorDocumentId: string,
  effectiveDateIso: string,
): RestatementAuthorityResolution {
  return {
    successorDocumentId,
    predecessorDocumentId,
    status: "OPERATIVE_AUTHORITY_CONFIRMED",
    effectiveDateIso,
    effectivenessInference: "INFERRED_FROM_DATED_AS_OF_WITH_EXECUTION",
    conditionsPrecedentSatisfaction: "NOT_STATED",
    caveats: [],
    reasons: [`Confirmed restatement ${successorDocumentId} with UNKNOWN scope`],
    doesNotMutatePackageGraphRelationship: true,
    evidence: {
      successorDocumentId,
      predecessorDocumentId,
      captionRestatement: {
        present: true,
        excerpt: "AMENDED AND RESTATED",
        charStart: 0,
        ordinalLabel: "Second",
      },
      executionDate: { value: effectiveDateIso, isoDate: effectiveDateIso, excerpt: effectiveDateIso },
      priorAgreementRecital: {
        present: true,
        excerpt: "Existing Credit Agreement",
        charStart: 1,
        namedAgreementLabel: "Prior Credit Agreement",
        namedExecutionDate: "2020-01-15",
        definedTerm: "Existing Credit Agreement",
      },
      operativeRestatementLanguage: {
        present: true,
        excerpt: "amended and restated as follows",
        charStart: 2,
        location: "NOW_THEREFORE",
        supersedesEntirety: false,
        novationDisclaimed: true,
      },
      conditionsPrecedent: { present: false, excerpt: null, charStart: null, sectionRef: null },
      signatureEvidence: { present: true, excerpt: "signature page", charStart: 3 },
      facilityIdentity: {
        administrativeAgentMatch: true,
        revolvingFacilityContinuity: true,
        borrowerContinuitySignals: ["Borrower"],
        mismatchReasons: [],
      },
      restatementScope: "UNKNOWN",
      partialProvisionRefs: [],
      packageGraphRelationshipStatus: "RESOLVED",
      packageGraphEvidenceClass: "STRONG_TARGET_EVIDENCE",
      packageGraphUnresolvedReason: null,
    },
  };
}

describe("Mission 1 — safeguards already holding", () => {
  it("product utilization authority: empty ledger is UNKNOWN, not authoritative remaining", () => {
    const decision = decideSolverUtilizationAuthority({
      namedMemberCount: 2,
      attributedMemberCount: 0,
      measuredUsage: 0,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: null,
    });
    expect(decision.kind).toBe("UNKNOWN");
    expect(decision.authoritativeForRemaining).toBe(false);
    expect(decision.supportsRemainingClaim).toBe(false);
  });

  it("verified remaining: unknown utilization never publishes AVAILABLE / numeric remaining", () => {
    const utilization = resolveUtilization({
      asOf: AS_OF,
      capacityRuleId: "rule-flat",
      companyId: CO,
      records: [],
      completenessCertificate: null,
    });
    const result = computeVerifiedRemaining({
      gross: {
        amount: 100_000_000,
        gateSatisfied: true,
        modeled: true,
        capacityRuleId: "rule-flat",
      },
      utilization,
    });
    expect(result.remainingStatus).toBe("GROSS_ONLY");
    expect(result.publicationLabel).toBe("GROSS_CONTRACTUAL");
    expect(result.supportedRemaining).toBeNull();
    expect(result.mayPublishAvailable).toBe(false);
  });

  it("UNSUPPORTED expression never becomes unlimited capacity", () => {
    const rules = [rule("rule-unsup", UNSUPPORTED("bespoke carve-out not representable"))];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules, inputs: EMPTY_RESOLVER, ledger: [], asOf: AS_OF });
    const c = state.capacities[0]!;
    expect(c.status).toBe("UNSUPPORTED");
    expect(c.grossCapacity.kind).toBe("NOT_DETERMINED");
    expect(JSON.stringify(c)).not.toContain("Infinity");
    expect(c.grossCapacity.kind).not.toBe("UNLIMITED");
  });

  it("IR adapter refuses missing grower % instead of assuming zero", () => {
    const adapted = adaptLegacyCovenantProvision(
      {
        id: "p1",
        documentId: "doc",
        code: "secured-grower",
        basketName: "Secured Debt Cap",
        sectionRef: "7.01(a)",
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdValue: 100,
        params: {},
      },
      CO,
      INST,
    );
    expect(adapted.rule).toBeNull();
    expect(adapted.refusalReason).toMatch(/pctEbitda/);
  });
});

describe("Mission 1 — confirmed cross-phase defects (failing-before)", () => {
  /**
   * DEF-C1: Phase-4C treats empty ledger as determined zero usage → AVAILABLE remaining = gross.
   * Utilization-authority (#237) treats the same fact as UNKNOWN and withholds remaining.
   */
  it.fails("Phase-4C empty ledger must not publish AVAILABLE remaining equal to gross", () => {
    const rules = [rule("rule-flat", MONEY(100_000_000))];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({
      graph,
      rules,
      inputs: EMPTY_RESOLVER,
      ledger: [],
      asOf: AS_OF,
    });
    const c = state.capacities[0]!;
    // Desired North Star / utilization-authority semantics:
    expect(c.status).not.toBe("AVAILABLE");
    expect(amountString(c.remaining)).toBeNull();
    expect(c.usage.kind).toBe("NOT_DETERMINED");
  });

  /**
   * DEF-C4: legacy evaluateProvision assumes missing pctEbitda = 0 and still reports modeled.
   */
  it.fails("legacy grower with missing pct must not report modeled complete capacity", () => {
    const evaluated = evaluateProvision(
      {
        id: "p-grower",
        documentId: "doc",
        code: "grower",
        basketName: "General Debt Cap",
        sectionRef: "7.01",
        formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
        thresholdValue: 100,
        params: {},
      },
      {
        ebitda: 800,
        cash: 0,
        interestExpense: 0,
        cumulativeNetIncome: 0,
        equityProceedsSinceIssue: 0,
        assumedNewDebtRatePct: 0,
        totalDebt: 0,
        securedDebt: 0,
      },
      {
        netDebt: 0,
        netSecured: 0,
        totalNetLeverage: 0,
        seniorSecuredNetLeverage: 0,
        fixedChargeCoverage: 1,
      },
    );
    expect(evaluated.status).not.toBe("modeled");
    expect(evaluated.status).toMatch(/review|need|refus/i);
  });

  /**
   * DEF-AUTH-1: computeOperativeDocument ignores as-of; future restatement becomes tip.
   */
  it.fails("whole-document operative tip must not resolve to a future-dated restatement without as-of filter", () => {
    const effects = [
      restateEffect({
        effectId: "e-future",
        amendmentDocumentId: "v2",
        targetDocumentId: "v1",
        date: "2030-06-01",
        status: "RESOLVED",
      }),
    ];
    const resolution = computeOperativeDocument("v1", effects);
    // Desired: either NOT_APPLICABLE / REVIEW_REQUIRED as of "today", or an as-of-aware API.
    // At minimum a future tip must not be confidently RESOLVED as currently operative.
    expect(resolution.status).not.toBe("RESOLVED");
    expect(resolution.operativeDocumentId).not.toBe("v2");
  });

  /**
   * DEF-AUTH-2: REVIEW_REQUIRED restatement edges still yield operativeDocument RESOLVED.
   */
  it.fails("REVIEW_REQUIRED restatement effect must not yield operativeDocument status RESOLVED", () => {
    const effects = [
      restateEffect({
        effectId: "e-rr",
        amendmentDocumentId: "v2",
        targetDocumentId: "v1",
        date: "2024-06-01",
        status: "REVIEW_REQUIRED",
        unresolvedReason: "inferential chronological predecessor",
      }),
    ];
    const resolution = computeOperativeDocument("v1", effects);
    expect(resolution.status).toBe("REVIEW_REQUIRED");
    expect(resolution.operativeDocumentId).toBeNull();
  });

  /**
   * DEF-AUTH-3: confirmed restatement with UNKNOWN scope falls through to base CONFIRMED_OPERATIVE.
   */
  it.fails("UNKNOWN restatement scope must fail closed, not leave base CONFIRMED_OPERATIVE", () => {
    const gov = resolveGoverningProvision({
      asOfDate: "2025-01-01",
      sectionRef: "6.01",
      instrumentDocumentIds: ["base", "successor"],
      baseDocumentId: "base",
      restatementAuthorities: [confirmedUnknownScope("successor", "base", "2024-06-01")],
    });
    expect(gov.authorityClassification).toBe("REVIEW_REQUIRED");
    expect(gov.governingDocumentId).not.toBe("base");
  });

  /**
   * DEF-M2-ENTITY: omitted transaction entities map to path SATISFIED.
   */
  it.fails("omitted transaction entities must not satisfy entity-scope path result", () => {
    const w = world({
      rules: [provision("p-a", MONEY(100), { entityScope: ["BORROWER"] })],
    });
    const r = simulate(
      w,
      proposal("tx-no-entities", [consume("e1", nodeOf("p-a"), cash("10"))], { entities: [] }),
      route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }),
    );
    expect(r.selectedPathResult).not.toBe("SATISFIED");
    expect(["REVIEW_REQUIRED", "INDETERMINATE", "NOT_APPLICABLE"]).toContain(r.selectedPathResult);
  });
});

describe("Mission 1 — cross-phase fork documentation (observable today)", () => {
  it("documents the Phase-4C vs utilization-authority semantic fork on empty ledger", () => {
    const rules = [rule("rule-flat", MONEY(50_000_000))];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const phase4c = evaluateCapacityState({
      graph,
      rules,
      inputs: EMPTY_RESOLVER,
      ledger: [],
      asOf: AS_OF,
    }).capacities[0]!;

    const util = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 0,
      measuredUsage: 0,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: null,
    });

    // Observable fork at this SHA — not the desired end state.
    expect(phase4c.status).toBe("AVAILABLE");
    expect(amountString(phase4c.remaining)).toBe("50000000");
    expect(util.authoritativeForRemaining).toBe(false);
    expect(util.kind).toBe("UNKNOWN");
  });

  it("documents simulate isolation: commitPlan stays unexecuted on satisfied hypo", () => {
    const w = world({ rules: [provision("p-a", MONEY(100))] });
    const r = simulate(
      w,
      proposal("tx-iso", [consume("e1", nodeOf("p-a"), cash("10"))]),
      route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }),
    );
    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(r.commitPlan.executed).toBe(false);
    expect(r.commitPlan.committable).toBe(true);
    // Hypothetical effects must not mutate the caller's pre-state ledger.
    expect(w.context.ledger ?? []).toHaveLength(0);
  });
});
