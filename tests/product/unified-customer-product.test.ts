/**
 * Unified customer product — Position / Simulate / Ask share one verified engine.
 * UI regression + outcome taxonomy + Ask→Simulate handoff + stale fingerprint guards.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  classifyCustomerOutcome,
  fingerprintSimulationRequest,
  fingerprintVerifiedState,
  refineKindFromQuestion,
  simulateHrefFromStructured,
  structuredTransactionFromDraft,
  structuredTransactionFromSearchParams,
} from "@/lib/product/unified-customer";
import { parseTransactionDraft } from "@/lib/product/north-star-workflow";

const root = path.join(__dirname, "../..");

describe("outcome taxonomy", () => {
  it("never promotes a single clearing ratio to SUPPORTED_PERMISSION", () => {
    const outcome = classifyCustomerOutcome([
      {
        status: "clear",
        tested: true,
        ratioClearedInIsolation: true,
        label: "TNL ratio",
      },
    ]);
    expect(outcome.kind).toBe("CONDITIONAL_OR_REVIEW_REQUIRED");
    expect(outcome.isAffirmativePermission).toBe(false);
    expect(outcome.rationale).toMatch(/single ratio/i);
  });

  it("classifies blocked constraints as SUPPORTED_PROHIBITION", () => {
    const outcome = classifyCustomerOutcome([
      { status: "clear", tested: true, label: "CA" },
      { status: "blocked", tested: true, label: "Indenture" },
    ]);
    expect(outcome.kind).toBe("SUPPORTED_PROHIBITION");
  });

  it("classifies missing evidence distinctly", () => {
    expect(classifyCustomerOutcome([{ missingEvidence: true }]).kind).toBe("MISSING_EVIDENCE");
  });

  it("classifies unsupported / not_tested distinctly", () => {
    expect(
      classifyCustomerOutcome([{ status: "not_tested", unsupported: true, label: "doc" }]).kind,
    ).toBe("UNSUPPORTED_CALCULATION");
  });

  it("requires all tested constraints to clear for SUPPORTED_PERMISSION", () => {
    const outcome = classifyCustomerOutcome([
      { status: "clear", tested: true, label: "CA" },
      { status: "clear", tested: true, label: "Notes" },
      { status: "clear", tested: true, ratioClearedInIsolation: true, label: "ratio" },
    ]);
    expect(outcome.kind).toBe("SUPPORTED_PERMISSION");
    expect(outcome.isAffirmativePermission).toBe(true);
  });
});

describe("fingerprint freshness", () => {
  it("changes when amount changes so stale evidence cannot be reused", () => {
    const state = fingerprintVerifiedState({ companyId: "co", provisions: "a" });
    const a = fingerprintSimulationRequest({
      stateFingerprint: state,
      kind: "SECURED_DEBT",
      amountMillions: 100,
      secured: true,
      evaluationDate: "2026-08-01",
    });
    const b = fingerprintSimulationRequest({
      stateFingerprint: state,
      kind: "SECURED_DEBT",
      amountMillions: 200,
      secured: true,
      evaluationDate: "2026-08-01",
    });
    expect(a).not.toBe(b);
  });

  it("changes when verified state changes", () => {
    const a = fingerprintVerifiedState({ companyId: "co", v: 1 });
    const b = fingerprintVerifiedState({ companyId: "co", v: 2 });
    expect(a).not.toBe(b);
  });
});

describe("Ask → Simulate structured handoff", () => {
  it("builds a Simulate deep-link from a structured transaction", () => {
    const draft = parseTransactionDraft(
      "Can we incur $100 million of secured debt on 2026-08-01?",
    );
    const st = structuredTransactionFromDraft(draft, { stateFingerprint: "abc123" });
    expect(st.kind).toBe("SECURED_DEBT");
    expect(st.amountMillions).toBe(100);
    expect(st.evaluationDate).toBe("2026-08-01");
    expect(st.handoffId).toMatch(/^handoff_/);
    const href = simulateHrefFromStructured("coherent", st);
    expect(href).toContain("/coherent/simulate?");
    expect(href).toContain("kind=SECURED_DEBT");
    expect(href).toContain("amount=100");
    expect(href).toContain("handoff=");
  });

  it("round-trips search params into a structured transaction", () => {
    const draft = parseTransactionDraft(
      "Can we make a $75 million restricted payment on 2026-08-01?",
    );
    const st = structuredTransactionFromDraft(draft);
    const href = simulateHrefFromStructured("demo", st);
    const qs = new URL(href, "http://localhost").searchParams;
    const back = structuredTransactionFromSearchParams(qs);
    expect(back?.kind).toBe("RESTRICTED_PAYMENT");
    expect(back?.amountMillions).toBe(75);
    expect(back?.evaluationDate).toBe("2026-08-01");
    expect(back?.handoffId).toBe(st.handoffId);
  });

  it("recognizes hybrid, secured notes, revolvers, refinancings", () => {
    expect(refineKindFromQuestion("issue hybrid preferred", "UNKNOWN")).toBe("HYBRID_SECURITY");
    expect(refineKindFromQuestion("issue secured notes", "UNKNOWN")).toBe("SECURED_NOTE");
    expect(refineKindFromQuestion("draw on the revolver", "UNKNOWN")).toBe("REVOLVER_DRAW");
    expect(refineKindFromQuestion("refinance term loan", "UNKNOWN")).toBe("REFINANCING");
    expect(refineKindFromQuestion("asset sale of plant", "UNKNOWN")).toBe("ASSET_SALE");
  });
});

describe("UI wiring regression", () => {
  it("Position page loads the shared verified engine view", () => {
    const source = readFileSync(path.join(root, "app/[companyId]/position/page.tsx"), "utf8");
    expect(source).toContain("loadPositionView");
    expect(source).toContain("Covenant thresholds");
    expect(source).toContain("Basket limits");
    expect(source).toContain("Utilization");
    expect(source).toContain("Shared / binding constraints");
    expect(source).toContain("Evidence (document · section)");
    expect(source).not.toMatch(/remainingCapacity\s*\?\?\s*0/);
  });

  it("Simulate page uses UnifiedSimulateClient + verified state (no client-side engine import)", () => {
    const page = readFileSync(path.join(root, "app/[companyId]/simulate/page.tsx"), "utf8");
    const client = readFileSync(
      path.join(root, "components/product/UnifiedSimulateClient.tsx"),
      "utf8",
    );
    expect(page).toContain("UnifiedSimulateClient");
    expect(page).toContain("loadVerifiedCustomerState");
    expect(page).toContain("structuredTransactionFromSearchParams");
    expect(page).toContain("never modify the live transaction ledger");
    expect(client).toContain("/api/product/simulate");
    expect(client).toContain("prior evidence cleared");
    expect(client).not.toContain("from \"@/lib/covenant-engine\"");
    expect(client).not.toContain("simulateDebtIncurrence");
  });

  it("Ask shell transfers structured transactions to Simulate", () => {
    const source = readFileSync(path.join(root, "components/ask/AskShell.tsx"), "utf8");
    expect(source).toContain("/api/product/ask");
    expect(source).toContain("Open in Simulate");
    expect(source).toContain("ask-open-simulate");
    expect(source).toContain("Natural-language exploration");
  });

  it("product API routes exist for position / simulate / ask", () => {
    for (const rel of [
      "app/api/product/position/route.ts",
      "app/api/product/simulate/route.ts",
      "app/api/product/ask/route.ts",
    ]) {
      const source = readFileSync(path.join(root, rel), "utf8");
      expect(source.length).toBeGreaterThan(40);
    }
  });

  it("client components do not import the Prisma-backed barrel", () => {
    const client = readFileSync(
      path.join(root, "components/product/UnifiedSimulateClient.tsx"),
      "utf8",
    );
    const badge = readFileSync(path.join(root, "components/product/OutcomeBadge.tsx"), "utf8");
    const ask = readFileSync(path.join(root, "components/ask/AskShell.tsx"), "utf8");
    expect(client).toContain("unified-customer/client-safe");
    expect(badge).toContain("unified-customer/client-safe");
    expect(ask).toContain("unified-customer/client-safe");
    expect(client).not.toMatch(/from \"@\/lib\/product\/unified-customer\"/);
    expect(badge).not.toMatch(/from \"@\/lib\/product\/unified-customer\"/);
  });
});
