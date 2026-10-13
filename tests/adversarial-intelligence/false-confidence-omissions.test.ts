/**
 * Parallel Adversarial Intelligence — Mission 2
 * Dangerous omission / false confidence counterexamples.
 *
 * A correct refusal is preferable to an unsupported numerical answer.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import { decideSolverUtilizationAuthority } from "@/lib/capacity/utilization-authority";
import { computeVerifiedRemaining } from "@/lib/capacity/verified-remaining";
import { resolveUtilization } from "@/lib/capacity/utilization-resolver";
import { resolveCrossReferences } from "@/lib/negative-covenant-exceptions/cross-reference";
import { attachProvisos } from "@/lib/negative-covenant-exceptions/proviso-attachment";
import {
  AS_OF,
  CO,
  INST,
  METRIC,
  MONEY,
  MUL,
  PCT,
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

describe("Mission 2 — safeguards preferring refusal over unsupported numbers", () => {
  it("missing metric → NEEDS_INPUT with no numeric remaining (not zero)", () => {
    const rules = [rule("rule-pct", MUL(PCT(0.25), METRIC("metric-absent")))];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const c = evaluateCapacityState({
      graph,
      rules,
      inputs: EMPTY_RESOLVER,
      ledger: [],
      asOf: AS_OF,
    }).capacities[0]!;
    expect(c.status).toBe("NEEDS_INPUT");
    expect(amountString(c.remaining)).toBeNull();
    expect(c.missingInputKeys).toContain("metric-absent");
  });

  it("APPROVED completeness alone without authenticity never supports remaining", () => {
    const decision = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 0,
      measuredUsage: 0,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: {
        certificateId: "cert-1",
        capacityPathId: "path-1",
        companyId: CO,
        asOf: AS_OF,
        kind: "VERIFIED_EMPTY",
        approvalState: "APPROVED",
        issuer: { actorId: "actor", role: "TREASURY" },
      } as never,
    });
    expect(decision.authoritativeForRemaining).toBe(false);
    expect(decision.supportsRemainingClaim).toBe(false);
  });

  it("proviso detector NONE is not proof of unconditional permission — only absence of detector hit", () => {
    const attachment = attachProvisos({
      exceptionRef: "7.01(a)",
      parentBlockText: "Section 7.01. The Company shall not incur Indebtedness except:",
      exceptionLimbText: "Indebtedness incurred in the ordinary course of business.",
    });
    expect(attachment.primaryAttachment).toBe("NONE");
    expect(attachment.ambiguous).toBe(false);
    // Consumers must not treat NONE as UNCONDITIONAL_SOURCE_VERIFIED.
    expect(attachment.hits).toHaveLength(0);
  });
});

describe("Mission 2 — closed false-confidence defects (regression locks)", () => {
  /** PAI-04 */
  it("empty historical utilization must not publish AVAILABLE remaining = gross", () => {
    const rules = [rule("rule-flat", MONEY(75_000_000))];
    const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const c = evaluateCapacityState({
      graph,
      rules,
      inputs: EMPTY_RESOLVER,
      ledger: [],
      asOf: AS_OF,
    }).capacities[0]!;
    expect(c.status).not.toBe("AVAILABLE");
    expect(amountString(c.remaining)).toBeNull();
  });

  /** PAI-10 */
  it("empty knownSectionRefs must not mark Section refs RESOLVED_CONTROLLING", () => {
    const classified = resolveCrossReferences({
      texts: ["Subject to Section 7.05 and the definition of Permitted Investment"],
      knownSectionRefs: new Set<string>(),
    });
    expect(classified.hits.some((h) => h.resolution === "RESOLVED_CONTROLLING")).toBe(false);
    expect(classified.unresolvedOrNonResolved.length).toBeGreaterThan(0);
  });

  /** PAI-07 */
  it("omitted entities on a scoped rule must not yield SATISFIED path", () => {
    const w = world({ rules: [provision("p-a", MONEY(50), { entityScope: ["GUARANTOR_RS"] })] });
    const r = simulate(
      w,
      proposal("tx", [consume("e1", nodeOf("p-a"), cash("5"))]),
      route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }),
    );
    expect(r.selectedPathResult).not.toBe("SATISFIED");
  });
});

describe("Mission 2 — product publication honesty still holds for verified remaining", () => {
  it("GROSS_ONLY when utilization unknown — never AVAILABLE", () => {
    const utilization = resolveUtilization({
      asOf: AS_OF,
      capacityRuleId: "rule-flat",
      companyId: CO,
      records: [],
      completenessCertificate: null,
    });
    const result = computeVerifiedRemaining({
      gross: {
        amount: 75_000_000,
        gateSatisfied: true,
        modeled: true,
        capacityRuleId: "rule-flat",
      },
      utilization,
    });
    expect(result.remainingStatus).toBe("GROSS_ONLY");
    expect(result.publicationLabel).toBe("GROSS_CONTRACTUAL");
    expect(result.mayPublishAvailable).toBe(false);
    expect(result.supportedRemaining).toBeNull();
  });
});
