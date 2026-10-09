/**
 * DB-backed engine integration for the unified customer product.
 */
import { describe, expect, it } from "vitest";
import {
  analyzeAskForSimulate,
  loadPositionView,
  loadVerifiedCustomerState,
  runUnifiedSimulation,
} from "@/lib/product/unified-customer";

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("unified customer engine integration", () => {
  it("Position / Simulate / Ask share one verified state fingerprint family", async () => {
    const companyId = "coherent";
    const state = await loadVerifiedCustomerState(companyId);
    const position = await loadPositionView(companyId);
    expect(position.stateFingerprint).toBe(state.stateFingerprint);
    expect(position.ratios.length).toBeGreaterThan(0);
    expect(position.evidence.length).toBeGreaterThan(0);
    expect(position.remainingCapacity.secured).not.toBe(0); // may be null, but never fabricated 0 via ??
  });

  it("Simulate recomputes with amount fingerprint change and provenance", async () => {
    const companyId = "coherent";
    const state = await loadVerifiedCustomerState(companyId);
    const a = await runUnifiedSimulation({
      companyId,
      kind: "SECURED_DEBT",
      amountMillions: 100,
      secured: true,
      expectedStateFingerprint: state.stateFingerprint,
    });
    const b = await runUnifiedSimulation({
      companyId,
      kind: "SECURED_DEBT",
      amountMillions: 5000,
      secured: true,
      expectedStateFingerprint: state.stateFingerprint,
      priorRequestFingerprint: a.requestFingerprint,
    });
    expect(a.stale).toBe(false);
    expect(b.stale).toBe(false);
    expect(a.requestFingerprint).not.toBe(b.requestFingerprint);
    expect(a.stateFingerprint).toBe(state.stateFingerprint);
    expect(["SUPPORTED_PERMISSION", "SUPPORTED_PROHIBITION", "CONDITIONAL_OR_REVIEW_REQUIRED", "MISSING_EVIDENCE", "UNSUPPORTED_CALCULATION"]).toContain(
      a.outcome.kind,
    );
    // Never green solely because a ratio cleared — outcome taxonomy enforces this.
    if (a.outcome.kind === "SUPPORTED_PERMISSION") {
      expect(a.outcome.isAffirmativePermission).toBe(true);
      expect(a.perDocument.some((d) => d.status === "clear")).toBe(true);
    }
    for (const c of a.bindingConstraints) {
      expect(c.documentName.length).toBeGreaterThan(0);
      expect(c.sectionRef.length).toBeGreaterThan(0);
    }
  });

  it("rejects stale state fingerprints", async () => {
    const result = await runUnifiedSimulation({
      companyId: "coherent",
      kind: "SECURED_DEBT",
      amountMillions: 50,
      secured: true,
      expectedStateFingerprint: "deliberately-stale",
    });
    expect(result.stale).toBe(true);
    expect(result.staleReason).toBe("STATE_FINGERPRINT_MISMATCH");
    expect(result.outcome.kind).toBe("MISSING_EVIDENCE");
    expect(result.outcome.isAffirmativePermission).toBe(false);
  });

  it("Ask produces Simulate handoff with structured transaction", async () => {
    const result = await analyzeAskForSimulate({
      companyId: "coherent",
      question: "Can we incur $100 million of secured debt on 2026-08-01?",
      confirmed: true,
    });
    expect(result.structuredTransaction.kind).toBe("SECURED_DEBT");
    expect(result.structuredTransaction.amountMillions).toBe(100);
    expect(result.simulateHref).toContain("/coherent/simulate?");
    expect(result.simulateHref).toContain("handoff=");
    expect(result.structuredTransaction.handoffId).toMatch(/^handoff_/);
  });
});
