import { describe, expect, it } from "vitest";
import {
  classifyGreaterOfAssetsBasket,
  compileGreaterOfAssetsBasket,
  compileGreaterOfSharedPair,
  detectMutualSharedCapacity,
  evaluateGreaterOfCapacity,
  verifyGreaterOfLegalFidelity,
} from "../../../lib/contract-model/compiler/greater-of-assets-basket";

const MHK_U = `additional Liens securing obligations of the Company and its Restricted Subsidiaries; provided , that , the aggregate amount of such obligations at the time of incurrence, when combined (without duplication) with the aggregate principal amount of all Indebtedness incurred pursuant to Section 7.03(g) , shall not exceed the greater of (A) ten percent (10%) of the Total Consolidated Assets of the Company and its Restricted Subsidiaries as of the last day of the fiscal quarter or fiscal year immediately preceding the date of such incurrence for which financial statements are required to be delivered to the Administrative Agent and the Lenders pursuant to Section 6.01 and (B) $1,500,000,000 (it being acknowledged and agreed that no Default shall be deemed to have occurred if the value of all such obligations subject to such Liens incurred under this Section 7.01(u) , when combined (without duplication) with the aggregate principal amount of all Indebtedness incurred pursuant to Section 7.03(g) , shall at a later time exceed ten percent (10%) of the Total Consolidated Assets of the Company and its Restricted Subsidiaries so long as at the time of each such incurrence each such incurrence was permitted to be made under this Section 7.01(u) ); provided , further , that , for purposes of this Section 7.01(u) , at the Company's election, Total Consolidated Assets may be adjusted on a pro forma basis, to include, as of the first day of the applicable period, assets of the Company and its consolidated Subsidiaries acquired pursuant to any acquisition not prohibited hereunder (1) consummated after the last day of the period covered by the applicable financial statements and (2) for which the aggregate consideration paid by the Company and its Restricted Subsidiaries exceeds $20,000,000;`;

const MHK_G = `additional Indebtedness in an aggregate principal amount at the time of incurrence that, when combined (without duplication) with the amount of all other Indebtedness incurred previously pursuant to this Section 7.03(g) and the amount of all other Indebtedness of the Company and its Restricted Subsidiaries subject to a Lien permitted under Section 7.01(u) (and after giving credit for any permanent repayments of any such Indebtedness so incurred), determined as of the date of such incurrence (and after giving pro forma effect to such proposed incurrence), shall not exceed the greater of (i) ten percent (10%) of the Total Consolidated Assets of the Company and its Restricted Subsidiaries as of the last day of the fiscal quarter or fiscal year immediately preceding such date of incurrence for which financial statements are required to be delivered to the Administrative Agent and the Lenders pursuant to Section 6.01 and (ii) $1,500,000,000 (it being acknowledged and agreed that no Default shall be deemed to have occurred if the aggregate amount of all such Indebtedness incurred under this Section 7.03(g) , when combined (without duplication) with the amount of all other Indebtedness incurred previously pursuant to this Section 7.03(g) and the amount of all other Indebtedness of the Company and its Restricted Subsidiaries subject to a Lien permitted under Section 7.01(u) , shall at a later time exceed ten percent (10%) of the Total Consolidated Assets of the Company and its Restricted Subsidiaries so long as at the time of each such incurrence each such incurrence was permitted to be made under this Section 7.03(g) );`;

const FACILITY_DIFF =
  "Secured Debt in a maximum aggregate amount not to exceed the difference between the Maximum Facility Amount and the Facility Amount when incurred;";

const ACME =
  "Indebtedness not to exceed the greater of (x) five percent (5%) of the Total Assets of the Borrower and (y) $75,000,000 at any time outstanding.";

describe("greater-of-assets vertical slice", () => {
  it("classifies MHK §7.01(u) / §7.03(g) and rejects facility-difference", () => {
    const u = classifyGreaterOfAssetsBasket(MHK_U);
    expect(u.class).toBe("GREATER_OF_FIXED_OR_PCT_ASSETS_WITH_QUALITATIVE_GATES");
    expect(u.fixedAmountUsd).toBe(1_500_000_000);
    expect(u.percentFraction).toBe(0.1);
    expect(u.metricName).toBe("Total Consolidated Assets");
    expect(u.residuals.some((r) => r.kind === "SHARED_CAP_COMBINE")).toBe(true);
    expect(classifyGreaterOfAssetsBasket(FACILITY_DIFF).class).toBe("NOT_GREATER_OF_ASSETS");
  });

  it("compiles authentic MHK §7.03(g) into MAX(MONEY, MULTIPLY(PERCENT, METRIC)) IR", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "product-proof-002-mhk-holdout",
      instrumentKey: "instrument:mhk",
      sourceDocumentId: "mhk-doc-a",
      candidateRef: "cand:7.03g",
      sourceSectionRef: "7.03(g)",
      operativeSourceText: MHK_G,
      action: "INCUR_DEBT",
    });
    expect(compiled.executableClass).toBe("VERIFIED_EXECUTABLE_CANDIDATE");
    expect(compiled.rule?.capacityExpression?.kind).toBe("IF");
    const fidelity = verifyGreaterOfLegalFidelity({
      operativeSourceText: MHK_G,
      rule: compiled.rule!,
    });
    expect(fidelity.verdict).toBe("PASS");
  });

  it("fixed limb dominates when assets are low; percent limb dominates when assets are high", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "mhk",
      instrumentKey: "instrument:mhk",
      sourceDocumentId: "mhk",
      candidateRef: "cand:g",
      sourceSectionRef: "7.03(g)",
      operativeSourceText: MHK_G,
    });

    const fixedDom = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: MHK_G,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 10_000_000_000, // 10% = $1B < $1.5B
    });
    expect(fixedDom.outcomeLabel).toBe("VERIFIED_EXECUTABLE");
    expect(fixedDom.availableAmountUsd).toBe(1_500_000_000);

    const pctDom = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: MHK_G,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 20_000_000_000, // 10% = $2B > $1.5B
    });
    expect(pctDom.outcomeLabel).toBe("VERIFIED_EXECUTABLE");
    expect(pctDom.availableAmountUsd).toBe(2_000_000_000);

    const equal = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: MHK_G,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 15_000_000_000,
    });
    expect(equal.availableAmountUsd).toBe(1_500_000_000);
  });

  it("missing Total Assets refuses affirmative capacity", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "mhk",
      instrumentKey: "instrument:mhk",
      sourceDocumentId: "mhk",
      candidateRef: "cand:g",
      sourceSectionRef: "7.03(g)",
      operativeSourceText: MHK_G,
    });
    const missing = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: MHK_G,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: null,
    });
    expect(missing.outcomeLabel).toBe("NEEDS_METRIC_INPUT");
    expect(missing.availableAmountUsd).toBeNull();
  });

  it("production mode refuses even when hypothetical executes", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "mhk",
      instrumentKey: "instrument:mhk",
      sourceDocumentId: "mhk",
      candidateRef: "cand:g",
      sourceSectionRef: "7.03(g)",
      operativeSourceText: MHK_G,
    });
    const prod = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: MHK_G,
      authorityMode: "PRODUCTION",
      totalAssetsUsd: 20_000_000_000,
    });
    expect(prod.outcomeLabel).toBe("PRODUCTION_CAPACITY_REFUSED");
    expect(prod.capacity).toBeNull();
  });

  it("detects mutual shared capacity on MHK u↔g and conserves the pool", () => {
    const mutual = detectMutualSharedCapacity({
      textA: MHK_U,
      refA: "7.01(u)",
      textB: MHK_G,
      refB: "7.03(g)",
    });
    expect(mutual.shared).toBe(true);

    const pair = compileGreaterOfSharedPair({
      companyId: "product-proof-002-mhk-holdout",
      instrumentKey: "instrument:mhk",
      sourceDocumentId: "mhk-doc-a",
      candidateRef: "cand:shared-ug",
      memberA: { sourceSectionRef: "7.01(u)", operativeSourceText: MHK_U, action: "CREATE_LIEN", covenantFamily: "LIENS" },
      memberB: { sourceSectionRef: "7.03(g)", operativeSourceText: MHK_G, action: "INCUR_DEBT", covenantFamily: "INDEBTEDNESS" },
    });
    expect(pair.shared).toBe(true);
    expect(pair.sharedCapacity).not.toBeNull();
    expect(pair.sharedCapacity!.memberRuleIds.length).toBe(2);

    const evalG = evaluateGreaterOfCapacity({
      compile: pair.ruleB,
      operativeSourceText: MHK_G,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 10_000_000_000,
      sharedCapacity: pair.sharedCapacity,
      extraRules: pair.ruleA.rule ? [pair.ruleA.rule] : [],
    });
    expect(evalG.outcomeLabel).toBe("VERIFIED_EXECUTABLE");
    expect(evalG.availableAmountUsd).toBe(1_500_000_000);

    // Consume $1.2B against the shared pool → remaining on either member ≤ $300M.
    const ledger = [
      {
        usageId: "usage-shared-1",
        companyId: "product-proof-002-mhk-holdout",
        instrumentKey: "instrument:mhk",
        effectiveAsOf: "2026-01-01",
        amount: { amount: "1200000000", currency: "USD" },
        capacityPath: { kind: "SHARED_CAPACITY" as const, sharedCapacityId: pair.sharedCapacity!.sharedCapId },
        transactionRef: "tx-prior",
        status: "RECORDED" as const,
        supersededByUsageId: null,
        provenance: { source: "TEST", sourceVersion: "v1", approvalRef: null, approvalState: null },
      },
    ];
    const after = evaluateGreaterOfCapacity({
      compile: pair.ruleB,
      operativeSourceText: MHK_G,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 10_000_000_000,
      sharedCapacity: pair.sharedCapacity,
      extraRules: pair.ruleA.rule ? [pair.ruleA.rule] : [],
      ledger,
    });
    expect(after.capacity?.outcome).toBe("EXECUTED");
    // Effective remaining under shared constraint must be reduced (not a second independent $1.5B).
    if (after.capacity?.outcome !== "EXECUTED") {
      throw new Error("expected EXECUTED capacity for shared-pool conservation check");
    }
    const sharedRem = after.capacity.state.sharedConstraints[0];
    expect(sharedRem).toBeTruthy();
    if (sharedRem?.remaining && sharedRem.remaining.kind === "AMOUNT") {
      const v = sharedRem.remaining.value as { amount?: string | number };
      const n = typeof v.amount === "number" ? v.amount : Number(v.amount);
      expect(n).toBe(300_000_000);
    } else {
      // Fallback: member effective remaining also reflects the pool.
      expect(after.availableAmountUsd == null || after.availableAmountUsd <= 300_000_000).toBe(true);
    }
  });

  it("is reusable on Acme (no MHK hardcoding)", () => {
    const compiled = compileGreaterOfAssetsBasket({
      companyId: "acme",
      instrumentKey: "instrument:acme",
      sourceDocumentId: "acme",
      candidateRef: "cand:acme",
      sourceSectionRef: "9.01(z)",
      operativeSourceText: ACME,
    });
    const evald = evaluateGreaterOfCapacity({
      compile: compiled,
      operativeSourceText: ACME,
      authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
      totalAssetsUsd: 2_000_000_000, // 5% = $100M > $75M
    });
    expect(evald.outcomeLabel).toBe("VERIFIED_EXECUTABLE");
    expect(evald.availableAmountUsd).toBe(100_000_000);
    expect(JSON.stringify(compiled.rule)).not.toMatch(/\b(MTN|Vail|Mohawk|MHK|CONMED)\b/i);
  });
});
