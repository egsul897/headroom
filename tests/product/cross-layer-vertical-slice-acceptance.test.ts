/**
 * Cross-layer vertical-slice acceptance — production interfaces + persisted in-memory state.
 *
 * Chain exercised (dependency graph, not mocks of helpers alone):
 *   synthetic certificate → NS-4 propose/approve (delivery persisted)
 *   → NS-6 selector + snapshot bind
 *   → Phase 4B snapshotInputResolver
 *   → Phase 4C ledger usage
 *   → verified-execution 4A/4C capacity + 4D simulation
 *   → customer figure semantics (gross ≠ remaining ≠ hypothetical)
 *
 * Soft gates: SYNTHETIC / FIXTURE_IR only; no production Neon writes; no IdP activation;
 * UNKNOWN/missing delivery never becomes RESOLVED via asOf invention; supersession invalidates.
 */
import { describe, expect, it } from "vitest";
import {
  CONMED_FORM_INSPIRED_CERT,
  InMemoryApprovedSnapshotStore,
  InMemoryContractLedgerStore,
  LedgerProposalRecorder,
  approveCertificateProposal,
  deliveriesFromApprovedSnapshots,
  extractDeliveredAtFromApprovalRef,
  proposeFromCertificate,
  resolveContractualSelector,
  selectSnapshotForResolvedSelector,
  snapshotInputResolver,
  temporalAxesFromSnapshot,
} from "@/lib/contract-model/north-star-bridge";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  type HypotheticalTransaction,
  type SelectedPath,
} from "@/lib/contract-model/verified-execution";
import {
  DEMO_COMPANY_ID,
  DEMO_EVALUATION_DATE,
  DEMO_INSTRUMENT_KEY,
  getDemoExercise,
} from "@/lib/product/north-star-workflow/demo-exercises";
import {
  buildFixtureVerifiedPackage,
  moneyAmountOf,
  type FixtureVerifiedPackage,
} from "@/lib/product/north-star-workflow/fixture-verified-package";
import { classifyCustomerFigure } from "@/lib/product/north-star-workflow/customer-figure-semantics";
import { resolveInput } from "@/lib/contract-model/runtime/input/resolve";
import { toCanonicalString } from "@/lib/contract-model/runtime/decimal";

describe("cross-layer vertical-slice acceptance (SYNTHETIC)", () => {
  it("certificate → delivery → cutoff → 4B resolve → 4C ledger → 4A/4D → figure semantics", () => {
    const exercise = getDemoExercise("secured-borrowing-100m");
    const companyId = CONMED_FORM_INSPIRED_CERT.companyId;
    expect(companyId).toBe(DEMO_COMPANY_ID);

    // --- NS-4 propose / approve with distinct temporal axes ---
    const snapStore = new InMemoryApprovedSnapshotStore();
    const ledgerProposals = new LedgerProposalRecorder();
    const proposed = proposeFromCertificate(snapStore, CONMED_FORM_INSPIRED_CERT, ledgerProposals);
    expect(proposed.ok).toBe(true);

    const approved = approveCertificateProposal(snapStore, {
      snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
      reviewedBy: "cross-layer-counsel",
      reviewedAt: "2026-07-20T18:00:00Z",
      approvalRef: "apr-cross-layer-vslice",
      deliveredAsOfDate: "2026-07-10",
      sourceDocumentId: CONMED_FORM_INSPIRED_CERT.documentId,
      sourceVersionHash: CONMED_FORM_INSPIRED_CERT.versionHash,
      proposerKind: "human",
    });
    expect(approved.ok).toBe(true);

    const snap = snapStore.getSnapshot(CONMED_FORM_INSPIRED_CERT.snapshotId)!;
    expect(snap.status).toBe("APPROVED");
    expect(snap.asOf).toBe("2026-06-30");
    expect(extractDeliveredAtFromApprovalRef(snap.review.approvalRef)).toBe("2026-07-10");
    const axes = temporalAxesFromSnapshot(snap, DEMO_EVALUATION_DATE);
    expect(axes.periodEndAsOf).toBe("2026-06-30");
    expect(axes.certificateDeliveryDate).toBe("2026-07-10");
    expect(axes.approvalReviewedAt).toBe("2026-07-20");
    expect(axes.evaluationDate).toBe(DEMO_EVALUATION_DATE);
    expect(axes.axesDistinct).toBe(true);

    // --- NS-6 selector + snapshot bind (production bridge helpers) ---
    const deliveries = deliveriesFromApprovedSnapshots(
      companyId,
      snapStore.getSnapshots(companyId),
      "REQUIRE_PERSISTED_DELIVERY",
    );
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.deliveredAtIsoDate).toBe("2026-07-10");
    expect(deliveries[0]!.asOfIsoDate).toBe("2026-06-30");

    const cutoff = resolveContractualSelector({
      companyId,
      evaluationDate: DEMO_EVALUATION_DATE,
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
      fiscalCalendar: { companyId, fiscalYearEndMonth: 12, fiscalYearEndDay: 31 },
      deliveries,
    });
    expect(cutoff.state).toBe("RESOLVED");
    if (cutoff.state !== "RESOLVED") return;
    expect(cutoff.reportingPeriodKey).toBe("FY2026-Q2");

    const bound = selectSnapshotForResolvedSelector(
      cutoff,
      snapStore.getSnapshots(companyId),
      companyId,
    );
    expect(bound).toEqual({
      state: "RESOLVED",
      snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
    });

    // --- Phase 4B exact identity resolve (reported financial) ---
    const ebitda = resolveInput({
      query: {
        companyId,
        instrumentKey: DEMO_INSTRUMENT_KEY,
        inputKind: "METRIC",
        key: "Consolidated EBITDA",
        period: cutoff.period,
        asOf: cutoff.asOf,
        expectedType: "MONEY",
        currency: "USD",
      },
      snapshots: [snap],
    });
    expect(ebitda.state).toBe("RESOLVED");
    if (ebitda.input?.value.type !== "MONEY") throw new Error("expected MONEY EBITDA");
    const ebitdaAmount = toCanonicalString(ebitda.input.value.amount);
    expect(ebitdaAmount).toBe("125000000");

    const reported = classifyCustomerFigure({
      kind: "REPORTED_FINANCIAL",
      amount: ebitdaAmount,
      currency: "USD",
      provenanceRefs: [snap.snapshotId, "Consolidated EBITDA"],
      approvedSnapshotBound: true,
    });
    expect(reported.kind).toBe("REPORTED_FINANCIAL");
    expect(reported.mayPresentAsAvailableHeadroom).toBe(false);

    // --- Fail-closed: missing delivery for undelivered later period ---
    const undelivered = resolveContractualSelector({
      companyId,
      evaluationDate: "2026-11-15",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
      fiscalCalendar: { companyId, fiscalYearEndMonth: 12, fiscalYearEndDay: 31 },
      deliveries, // only Q2 delivered — Q3 ended but undelivered
    });
    expect(undelivered.state).toBe("NEEDS_INPUT");

    // --- Phase 4C attributed ledger ---
    const contractLedger = new InMemoryContractLedgerStore();
    const basket = ledgerProposals.list()[0];
    expect(basket).toBeTruthy();
    const usageWrite = contractLedger.appendUsage({
      usage: {
        usageId: "usage-cross-layer-hist",
        companyId,
        instrumentKey: DEMO_INSTRUMENT_KEY,
        effectiveAsOf: "2026-05-15",
        amount: { amount: "25000000", currency: "USD" },
        capacityPath: { kind: "RULE", ruleId: exercise.fixtureIr.rules[0]!.ruleId },
        transactionRef: "txn-cross-layer-hist",
        status: "RECORDED",
        supersededByUsageId: null,
        provenance: {
          source: "cross-layer-vertical-slice",
          sourceVersion: CONMED_FORM_INSPIRED_CERT.versionHash,
          approvalRef: "apr-cross-layer-vslice",
          approvalState: "APPROVED",
        },
      },
    });
    expect(usageWrite.ok).toBe(true);

    // --- FIXTURE_IR → verified-execution REQUIRE (4A/4C) ---
    const built = buildFixtureVerifiedPackage(exercise);
    expect("blocked" in built).toBe(false);
    if ("blocked" in built) return;
    const pkg: FixtureVerifiedPackage = built;

    const inputs = snapshotInputResolver({
      snapshots: [snap],
      definitions: [...(pkg.definitions ?? [])],
      rules: [...pkg.rules],
      companyId: pkg.companyId,
      instrumentKey: pkg.instrumentKey,
    });

    const capacity = evaluateVerifiedCapacity({
      package: pkg,
      inputs,
      ledger: contractLedger.getActiveUsages(companyId),
      asOf: DEMO_EVALUATION_DATE,
    });
    expect(capacity.outcome).toBe("EXECUTED");
    if (capacity.outcome !== "EXECUTED") return;

    const first = capacity.state.capacities[0]!;
    const grossUsd = moneyAmountOf(first.grossCapacity);
    const remainingUsd = moneyAmountOf(first.effectiveRemaining);
    expect(grossUsd).not.toBeNull();
    expect(remainingUsd).not.toBeNull();
    expect(remainingUsd!).toBeLessThan(grossUsd!);

    const grossClaim = classifyCustomerFigure({
      kind: "GROSS_CONTRACTUAL_CAPACITY",
      amount: grossUsd,
      currency: "USD",
      provenanceRefs: [first.ruleId, snap.snapshotId],
      verifiedExecutionExecuted: true,
    });
    expect(grossClaim.mayPresentAsAvailableHeadroom).toBe(false);

    // Trusted-issuer / utilization completeness not active → verified remaining withheld
    const verifiedClaim = classifyCustomerFigure({
      kind: "VERIFIED_REMAINING_CAPACITY",
      amount: remainingUsd,
      currency: "USD",
      provenanceRefs: [first.ruleId, "usage-cross-layer-hist"],
      utilizationComplete: false,
      trustedIssuerActive: false,
      verifiedExecutionExecuted: true,
    });
    expect(verifiedClaim.kind).toBe("UNSUPPORTED");
    expect(verifiedClaim.amount).toBeNull();
    expect(verifiedClaim.mayPresentAsAvailableHeadroom).toBe(false);

    // --- Phase 4D hypothetical simulation ---
    const ruleId = pkg.rules[0]!.ruleId;
    const transaction: HypotheticalTransaction = {
      transactionId: "tx-cross-layer-vslice",
      companyId,
      instrumentKey: DEMO_INSTRUMENT_KEY,
      effectiveAsOf: DEMO_EVALUATION_DATE,
      category: null,
      label: "cross-layer hypothetical consume",
      effects: [
        {
          effectId: "e1",
          kind: "CONSUME_CAPACITY",
          capacityNodeId: `capacity:rule:${ruleId}`,
          amount: { type: "MONEY", amount: "10000000", currency: "USD" },
        },
      ],
      provenance: {
        source: "cross-layer-vertical-slice",
        sourceVersion: "1",
        approvalRef: null,
      },
    };
    const selectedPath: SelectedPath = {
      capacityNodeIds: [`capacity:rule:${ruleId}`],
      ruleIds: [ruleId],
      sharedCapacityIds: [],
      reclassificationElectionIds: [],
    };
    const simulation = simulateVerifiedTransaction({
      package: pkg,
      inputs,
      ledger: contractLedger.getActiveUsages(companyId),
      asOf: DEMO_EVALUATION_DATE,
      transaction,
      selectedPath,
    });
    expect(["EXECUTED", "REFUSED"]).toContain(simulation.outcome);

    const hypo = classifyCustomerFigure({
      kind: "HYPOTHETICAL_SIMULATION",
      amount: simulation.outcome === "EXECUTED" ? 10_000_000 : null,
      currency: "USD",
      provenanceRefs: [transaction.transactionId],
    });
    expect(hypo.kind).toBe("HYPOTHETICAL_SIMULATION");
    expect(hypo.mayPresentAsAvailableHeadroom).toBe(false);

    // --- Invalidation: approving restatement removes predecessor from APPROVED pool ---
    const successorId = `${CONMED_FORM_INSPIRED_CERT.snapshotId}-v2`;
    snapStore.appendSnapshot({
      snapshot: {
        ...snap,
        snapshotId: successorId,
        status: "DRAFT",
        supersedesSnapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
        version: "v2",
        review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
        // Material restatement of EBITDA
        inputs: snap.inputs.map((inp) =>
          inp.identity.key === "Consolidated EBITDA"
            ? {
                ...inp,
                value:
                  inp.value.type === "MONEY"
                    ? { ...inp.value, amount: { ...inp.value.amount } }
                    : inp.value,
              }
            : inp,
        ),
      },
    });
    // Rewrite EBITDA on successor via fresh propose is heavy; instead append a DRAFT clone
    // and approve — materialization supersedes predecessor regardless of value equality.
    const restated = approveCertificateProposal(snapStore, {
      snapshotId: successorId,
      reviewedBy: "cross-layer-counsel",
      reviewedAt: "2026-07-25T18:00:00Z",
      approvalRef: "apr-cross-layer-restatement",
      deliveredAsOfDate: "2026-07-22",
      proposerKind: "human",
    });
    expect(restated.ok).toBe(true);
    expect(snapStore.getSnapshot(CONMED_FORM_INSPIRED_CERT.snapshotId)?.status).toBe("SUPERSEDED");
    expect(snapStore.getSnapshot(successorId)?.status).toBe("APPROVED");

    const postDeliveries = deliveriesFromApprovedSnapshots(
      companyId,
      snapStore.getSnapshots(companyId),
      "REQUIRE_PERSISTED_DELIVERY",
    );
    expect(postDeliveries.every((d) => d.deliveredAtIsoDate === "2026-07-22")).toBe(true);

    const postCutoff = resolveContractualSelector({
      companyId,
      evaluationDate: DEMO_EVALUATION_DATE,
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
      fiscalCalendar: { companyId, fiscalYearEndMonth: 12, fiscalYearEndDay: 31 },
      deliveries: postDeliveries,
    });
    expect(postCutoff.state).toBe("RESOLVED");
    if (postCutoff.state !== "RESOLVED") return;
    const postBound = selectSnapshotForResolvedSelector(
      postCutoff,
      snapStore.getSnapshots(companyId),
      companyId,
    );
    expect(postBound).toEqual({ state: "RESOLVED", snapshotId: successorId });
    // Stale predecessor must not remain the current bound identity.
    expect(postBound.state === "RESOLVED" && postBound.snapshotId).not.toBe(
      CONMED_FORM_INSPIRED_CERT.snapshotId,
    );
  });

  it("fail-closed: REQUIRE_PERSISTED_DELIVERY without marker does not resolve via asOf", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    proposeFromCertificate(store, CONMED_FORM_INSPIRED_CERT, ledger);
    // Manually approve through store API without delivery marker (bypass certificate approve helper).
    const hand = store.approveSnapshot({
      snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
      reviewedBy: "counsel",
      reviewedAt: "2026-07-20T18:00:00Z",
      approvalRef: "apr-no-delivery-marker",
    });
    expect(hand.ok).toBe(true);
    const snap = store.getSnapshot(CONMED_FORM_INSPIRED_CERT.snapshotId)!;
    expect(extractDeliveredAtFromApprovalRef(snap.review.approvalRef)).toBeNull();

    const deliveries = deliveriesFromApprovedSnapshots(
      CONMED_FORM_INSPIRED_CERT.companyId,
      store.getSnapshots(CONMED_FORM_INSPIRED_CERT.companyId),
      "REQUIRE_PERSISTED_DELIVERY",
    );
    expect(deliveries).toHaveLength(0);

    const cutoff = resolveContractualSelector({
      companyId: CONMED_FORM_INSPIRED_CERT.companyId,
      evaluationDate: DEMO_EVALUATION_DATE,
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
      fiscalCalendar: {
        companyId: CONMED_FORM_INSPIRED_CERT.companyId,
        fiscalYearEndMonth: 12,
        fiscalYearEndDay: 31,
      },
      deliveries,
    });
    expect(cutoff.state).toBe("NEEDS_INPUT");
  });
});
