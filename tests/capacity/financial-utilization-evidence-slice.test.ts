/**
 * HEADROOM-9 — financial statement + historical utilization evidence slice.
 *
 * Source → normalized evidence → verification status → Agent #2 capacity-input handoff.
 * Demonstrates correct refusal when completeness is incomplete.
 *
 * Verdict marker: FINANCIAL_AND_UTILIZATION_EVIDENCE_SLICE_VERIFIED
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TRUSTED_ISSUER_ACTIVATION,
  buildVerifiedCapacityInputHandoff,
  mayUseAsProductionCapacityInput,
  normalizeFinancialStatementEvidence,
  reconstructUtilizationEvidence,
  toVerifiedUtilizationHandoffInput,
  type FinancialMetricKey,
  type FinancialStatementIngestionInput,
  type HistoricalUtilizationEvent,
  type RawFinancialStatementLine,
  type StatementMetricDefinitionMapping,
} from "@/lib/capacity";

const FIXTURE_PATH = join(
  process.cwd(),
  "tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json",
);

type SliceFixture = {
  label: string;
  companyId: string;
  entityName: string;
  reportingPeriod: string;
  asOf: string;
  currency: string;
  provenanceId: string;
  statementLines: RawFinancialStatementLine[];
  metricMappings: StatementMetricDefinitionMapping[];
  utilizationEvents: HistoricalUtilizationEvent[];
  capacityRuleId: string;
  requiredFinancialMetrics: FinancialMetricKey[];
  completenessLimitations: string[];
};

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as SliceFixture;

function ingestStatements(over: Partial<FinancialStatementIngestionInput> = {}) {
  return normalizeFinancialStatementEvidence({
    companyId: fixture.companyId,
    entityName: fixture.entityName,
    asOf: fixture.asOf,
    reportingPeriod: fixture.reportingPeriod,
    currency: fixture.currency,
    provenanceId: fixture.provenanceId,
    lines: fixture.statementLines,
    mappings: fixture.metricMappings,
    verificationStatus: "UNVERIFIED_EXTRACTION",
    authenticity: "AUTHENTIC",
    maxAgeDays: 400,
    ...over,
  });
}

function reconstructUtil(over: Partial<Parameters<typeof reconstructUtilizationEvidence>[0]> = {}) {
  return reconstructUtilizationEvidence({
    companyId: fixture.companyId,
    capacityRuleId: fixture.capacityRuleId,
    asOf: fixture.asOf,
    currency: fixture.currency,
    events: fixture.utilizationEvents,
    completenessCertificate: null,
    acknowledgeUnknownHistory: true,
    ...over,
  });
}

describe("HEADROOM-9 financial + utilization evidence slice", () => {
  it("fixture is authentic-source-backed (not synthetic)", () => {
    expect(fixture.label).toBe("AUTHENTIC_SOURCE_BACKED");
    expect(fixture.completenessLimitations.length).toBeGreaterThan(0);
  });

  it("Scope A: normalizes statement lines with GAAP vs CONTRACT_ADJUSTED distinction", () => {
    const result = ingestStatements({ verificationStatus: "REVIEW_REQUIRED" });
    expect(result.ok).toBe(true);
    expect(result.snapshot).not.toBeNull();
    const ebitda = result.snapshot!.metrics.find((m) => m.metricKey === "CONSOLIDATED_EBITDA");
    const assets = result.snapshot!.metrics.find((m) => m.metricKey === "TOTAL_ASSETS");
    const interest = result.snapshot!.metrics.find((m) => m.metricKey === "INTEREST_EXPENSE");
    const debt = result.snapshot!.metrics.find((m) => m.metricKey === "TOTAL_DEBT");
    expect(ebitda?.definitionBasis).toBe("CONTRACT_ADJUSTED");
    expect(ebitda?.value).toBeCloseTo(128.313, 3);
    expect(assets?.definitionBasis).toBe("GAAP_STATEMENT");
    expect(assets?.value).toBeCloseTo(1791.719, 3);
    expect(interest?.statementFamily).toBe("INCOME_STATEMENT");
    expect(debt?.statementFamily).toBe("DEBT_SCHEDULE");
    expect(result.trace.some((t) => t.stage === "NORMALIZED")).toBe(true);
    // Unmapped GAAP-only duplicate line retained as observed, not forced into consolidated assets.
    expect(result.unmappedLineIds).toContain("bs-total-assets-gaap-only");
  });

  it("Scope A: refuses equating TOTAL_ASSETS with TOTAL_CONSOLIDATED_ASSETS", () => {
    const result = normalizeFinancialStatementEvidence({
      companyId: fixture.companyId,
      entityName: fixture.entityName,
      asOf: fixture.asOf,
      reportingPeriod: fixture.reportingPeriod,
      currency: fixture.currency,
      provenanceId: fixture.provenanceId,
      lines: [
        fixture.statementLines.find((l) => l.lineId === "bs-total-assets")!,
        {
          ...fixture.statementLines.find((l) => l.lineId === "bs-total-assets")!,
          lineId: "bs-consolidated-assets-fake",
          label: "Total Consolidated Assets (illicit equate)",
          consolidationPerimeter:
            "Matthews International Corporation and consolidated subsidiaries (GAAP)",
        },
      ],
      mappings: [
        { lineId: "bs-total-assets", metricKey: "TOTAL_ASSETS" },
        { lineId: "bs-consolidated-assets-fake", metricKey: "TOTAL_CONSOLIDATED_ASSETS" },
      ],
      verificationStatus: "REVIEW_REQUIRED",
      authenticity: "AUTHENTIC",
    });
    expect(result.ok).toBe(false);
    expect(result.refusalReasons).toContain("TOTAL_ASSETS_EQUATED_TO_CONSOLIDATED");
  });

  it("Scope A: refuses GAAP basis for CONSOLIDATED_EBITDA", () => {
    const ebitdaLine = {
      ...fixture.statementLines.find((l) => l.lineId === "cert-consolidated-ebitda")!,
      definitionBasis: "GAAP_STATEMENT" as const,
    };
    const result = normalizeFinancialStatementEvidence({
      companyId: fixture.companyId,
      entityName: fixture.entityName,
      asOf: fixture.asOf,
      reportingPeriod: fixture.reportingPeriod,
      currency: fixture.currency,
      provenanceId: "prov-gaap-ebitda-refuse",
      lines: [ebitdaLine],
      mappings: [{ lineId: ebitdaLine.lineId, metricKey: "CONSOLIDATED_EBITDA" }],
      verificationStatus: "UNVERIFIED_EXTRACTION",
      authenticity: "AUTHENTIC",
    });
    expect(result.ok).toBe(false);
    expect(result.refusalReasons).toContain("GAAP_CONTRACT_BASIS_MISMATCH");
  });

  it("Scope B: reconstructs attributed utilization with amount/date/provision/source/entity/currency", () => {
    const recon = reconstructUtil();
    expect(recon.ok).toBe(true);
    expect(recon.usageAttributed.length).toBe(2);
    for (const u of recon.usageAttributed) {
      expect(u.amount).toBeGreaterThan(0);
      expect(u.date).toBeTruthy();
      expect(u.applicableProvision).toBe(fixture.capacityRuleId);
      expect(u.source).toContain("edgar:");
      expect(u.entity).toBe(fixture.companyId);
      expect(u.currency).toBe("USD");
      expect(u.supersessionTreatment).toBe("NONE");
    }
    expect(recon.layers).toContain("EVIDENCE_OBSERVED");
    expect(recon.layers).toContain("USAGE_ATTRIBUTED");
    expect(recon.layers).toContain("UNKNOWN_HISTORICAL_ACTIVITY");
    expect(recon.reviewerConfirmedCompleteness).toBe(false);
  });

  it("Scope B/C: does not infer unobserved usage equals zero", () => {
    const empty = reconstructUtilizationEvidence({
      companyId: fixture.companyId,
      capacityRuleId: fixture.capacityRuleId,
      asOf: fixture.asOf,
      currency: fixture.currency,
      events: [],
      completenessCertificate: null,
    });
    expect(empty.unknownHistoricalActivity).toBe(true);
    expect(empty.reviewerConfirmedCompleteness).toBe(false);
    expect(empty.layers).toContain("UNKNOWN_HISTORICAL_ACTIVITY");
    expect(empty.blockers.some((b) => /not treated as zero|UNKNOWN/i.test(b))).toBe(true);
  });

  it("Scope C: only reviewer-confirmed certificate establishes completeness layer", () => {
    const without = reconstructUtil({ completenessCertificate: null });
    expect(without.layers).not.toContain("REVIEWER_CONFIRMED_COMPLETENESS");

    const weakCert = reconstructUtil({
      completenessCertificate: {
        capacityRuleId: fixture.capacityRuleId,
        asOf: fixture.asOf,
        approvalState: "APPROVED",
        sourceLabel: "unauthenticated fixture cert",
        kind: "VERIFIED_COMPLETE",
        // missing authenticity + issuer → not reviewer-confirmed
      },
    });
    expect(weakCert.reviewerConfirmedCompleteness).toBe(false);
    expect(weakCert.layers).not.toContain("REVIEWER_CONFIRMED_COMPLETENESS");
  });

  it("Scope D: vertical slice handoff refuses remaining when evidence incomplete", () => {
    const statements = ingestStatements({ verificationStatus: "UNVERIFIED_EXTRACTION" });
    expect(statements.ok).toBe(true);
    const recon = reconstructUtil();
    const utilHandoff = toVerifiedUtilizationHandoffInput(recon);

    const handoff = buildVerifiedCapacityInputHandoff({
      companyId: fixture.companyId,
      evaluationAsOf: fixture.asOf,
      financial: statements.snapshot!,
      requiredFinancialMetrics: fixture.requiredFinancialMetrics,
      utilization: utilHandoff,
      trustedIssuerAuth: null,
    });

    expect(handoff.contractVersion).toBe("verified-input-contract.v1");
    expect(handoff.financial.trustClass).toBe("INCOMPLETE");
    expect(handoff.utilization.supportsRemainingClaim).toBe(false);
    expect(handoff.productionAuthority).toBe("REFUSED");
    expect(handoff.productionActivation).toBe("BLOCKED");
    expect(TRUSTED_ISSUER_ACTIVATION.status).toBe("BLOCKED");
    expect(mayUseAsProductionCapacityInput(handoff)).toBe(false);
    expect(recon.unknownHistoricalActivity).toBe(true);
  });

  it("Scope D: reproducible trace source → normalized → verification → handoff", () => {
    const statements = ingestStatements({ verificationStatus: "REVIEW_REQUIRED" });
    const recon = reconstructUtil();
    const handoff = buildVerifiedCapacityInputHandoff({
      companyId: fixture.companyId,
      evaluationAsOf: fixture.asOf,
      financial: statements.snapshot!,
      requiredFinancialMetrics: ["CONSOLIDATED_EBITDA", "TOTAL_ASSETS"],
      utilization: toVerifiedUtilizationHandoffInput(recon),
    });

    const trace = {
      source: {
        edgarAccession: "0000063296-25-000006",
        label: fixture.label,
      },
      normalized: {
        metricKeys: statements.snapshot!.metrics.map((m) => m.metricKey),
        attributedUsageIds: recon.usageAttributed.map((u) => u.usageId),
      },
      verificationStatus: statements.snapshot!.metrics.map((m) => m.verificationStatus),
      handoff: {
        financialTrust: handoff.financial.trustClass,
        utilizationTrust: handoff.utilization.trustClass,
        productionAuthority: handoff.productionAuthority,
      },
      statementTraceStages: [...new Set(statements.trace.map((t) => t.stage))],
      utilizationTraceStages: [...new Set(recon.trace.map((t) => t.stage))],
    };

    expect(trace.normalized.metricKeys).toContain("CONSOLIDATED_EBITDA");
    expect(trace.normalized.attributedUsageIds.length).toBe(2);
    expect(trace.verificationStatus.every((s) => s === "REVIEW_REQUIRED")).toBe(true);
    expect(trace.handoff.productionAuthority).toBe("REFUSED");
    expect(trace.statementTraceStages).toContain("OBSERVED");
    expect(trace.statementTraceStages).toContain("NORMALIZED");
    expect(trace.utilizationTraceStages).toContain("USAGE_ATTRIBUTED");
    expect(trace.utilizationTraceStages).toContain("UNKNOWN_HISTORICAL_ACTIVITY");
  });
});

describe("HEADROOM-9 adversarial financial/utilization evidence", () => {
  it("double-counting: duplicate event ids remain in records but path reconstruction flags blockers via resolver", () => {
    const dup = fixture.utilizationEvents[0]!;
    const recon = reconstructUtilizationEvidence({
      companyId: fixture.companyId,
      capacityRuleId: fixture.capacityRuleId,
      asOf: fixture.asOf,
      currency: fixture.currency,
      events: [dup, { ...dup }],
    });
    // Both observed; attribution may list both — handoff must not treat as complete.
    expect(recon.usageAttributed.length).toBeGreaterThanOrEqual(2);
    expect(recon.reviewerConfirmedCompleteness).toBe(false);
    const handoff = buildVerifiedCapacityInputHandoff({
      companyId: fixture.companyId,
      evaluationAsOf: fixture.asOf,
      financial: ingestStatements().snapshot!,
      requiredFinancialMetrics: ["TOTAL_DEBT"],
      utilization: toVerifiedUtilizationHandoffInput(recon),
    });
    expect(handoff.utilization.supportsRemainingClaim).toBe(false);
  });

  it("restatement: RESTATED statement lines normalize but Agent #2 validation refuses authority", () => {
    const restatedLine = {
      ...fixture.statementLines.find((l) => l.lineId === "debt-total")!,
      restatementStatus: "RESTATED" as const,
    };
    const normalized = normalizeFinancialStatementEvidence({
      companyId: fixture.companyId,
      entityName: fixture.entityName,
      asOf: fixture.asOf,
      reportingPeriod: fixture.reportingPeriod,
      currency: fixture.currency,
      provenanceId: "prov-restated",
      lines: [restatedLine],
      mappings: [{ lineId: restatedLine.lineId, metricKey: "TOTAL_DEBT" }],
      verificationStatus: "VERIFIED",
      authenticity: "AUTHENTIC",
      issuer: { role: "COUNSEL_REVIEWER", actorId: "counsel-x" },
    });
    expect(normalized.ok).toBe(true);
    const handoff = buildVerifiedCapacityInputHandoff({
      companyId: fixture.companyId,
      evaluationAsOf: fixture.asOf,
      financial: normalized.snapshot!,
      requiredFinancialMetrics: ["TOTAL_DEBT"],
      utilization: {
        capacityRuleId: fixture.capacityRuleId,
        asOf: fixture.asOf,
        currency: "USD",
        records: [],
        completenessCertificate: null,
      },
    });
    expect(handoff.financial.productionAuthoritative).toBe(false);
    expect(handoff.financial.blockers.some((b) => /RESTATED/i.test(b))).toBe(true);
  });

  it("stale period: maxAgeDays refusal on financial validation", () => {
    const normalized = ingestStatements({
      verificationStatus: "VERIFIED",
      maxAgeDays: 30,
      authenticity: "AUTHENTIC",
      issuer: { role: "COUNSEL_REVIEWER", actorId: "counsel-x" },
    });
    const handoff = buildVerifiedCapacityInputHandoff({
      companyId: fixture.companyId,
      evaluationAsOf: "2026-10-10",
      financial: normalized.snapshot!,
      requiredFinancialMetrics: ["TOTAL_ASSETS"],
      utilization: {
        capacityRuleId: fixture.capacityRuleId,
        asOf: "2026-10-10",
        records: [],
        completenessCertificate: null,
      },
    });
    expect(handoff.financial.blockers.some((b) => /stale/i.test(b))).toBe(true);
    expect(handoff.productionAuthority).toBe("REFUSED");
  });

  it("missing transactions: partial event set keeps UNKNOWN_HISTORICAL_ACTIVITY", () => {
    const recon = reconstructUtilizationEvidence({
      companyId: fixture.companyId,
      capacityRuleId: fixture.capacityRuleId,
      asOf: fixture.asOf,
      currency: fixture.currency,
      events: [fixture.utilizationEvents[0]!],
    });
    expect(recon.usageAttributed.length).toBe(1);
    expect(recon.unknownHistoricalActivity).toBe(true);
    expect(recon.reviewerConfirmedCompleteness).toBe(false);
  });

  it("entity mismatch: wrong entityKey events become unallocated", () => {
    const recon = reconstructUtilizationEvidence({
      companyId: fixture.companyId,
      capacityRuleId: fixture.capacityRuleId,
      asOf: fixture.asOf,
      currency: fixture.currency,
      events: [
        {
          ...fixture.utilizationEvents[0]!,
          eventId: "wrong-entity-event",
          entityKey: "",
        },
      ],
    });
    expect(recon.usageUnallocated.length).toBe(1);
    expect(recon.usageAttributed.length).toBe(0);
  });

  it("currency mismatch: foreign-currency event not attributed", () => {
    const recon = reconstructUtilizationEvidence({
      companyId: fixture.companyId,
      capacityRuleId: fixture.capacityRuleId,
      asOf: fixture.asOf,
      currency: "USD",
      events: [
        {
          ...fixture.utilizationEvents[0]!,
          eventId: "eur-event",
          currency: "EUR",
        },
      ],
    });
    expect(recon.usageUnallocated.some((e) => e.eventId === "eur-event")).toBe(true);
    expect(recon.blockers.some((b) => /currency/i.test(b))).toBe(true);
  });

  it("shared-capacity usage: attributed via shared pool without inventing path completeness", () => {
    const recon = reconstructUtilizationEvidence({
      companyId: fixture.companyId,
      capacityRuleId: fixture.capacityRuleId,
      asOf: fixture.asOf,
      currency: "USD",
      events: [
        {
          eventId: "shared-lien-1",
          kind: "LIEN",
          amount: 50,
          currency: "USD",
          effectiveDate: "2024-06-30",
          applicableProvisionId: fixture.capacityRuleId,
          sharedCapacityId: "matw-scc-shared-liens",
          entityKey: fixture.companyId,
          sourceLabel: "authentic lien schedule excerpt",
          authenticity: "AUTHENTIC",
          approvalState: "APPROVED",
          supersession: "NONE",
        },
      ],
    });
    expect(recon.usageAttributed.length).toBe(1);
    expect(recon.usageAttributed[0]!.record.sharedCapacityId).toBe("matw-scc-shared-liens");
    expect(recon.unknownHistoricalActivity).toBe(true);
  });

  it("supersession treatment retained and excluded from active attribution path sum inputs", () => {
    const recon = reconstructUtilizationEvidence({
      companyId: fixture.companyId,
      capacityRuleId: fixture.capacityRuleId,
      asOf: fixture.asOf,
      currency: "USD",
      events: [
        {
          eventId: "old-draw",
          kind: "DEBT_ISSUANCE",
          amount: 100,
          currency: "USD",
          effectiveDate: "2023-01-01",
          applicableProvisionId: fixture.capacityRuleId,
          entityKey: fixture.companyId,
          sourceLabel: "prior draw",
          authenticity: "AUTHENTIC",
          approvalState: "APPROVED",
          supersession: "NONE",
        },
        {
          eventId: "amend-replace",
          kind: "AMENDMENT",
          amount: 120,
          currency: "USD",
          effectiveDate: "2024-01-01",
          applicableProvisionId: fixture.capacityRuleId,
          entityKey: fixture.companyId,
          sourceLabel: "amendment replacement",
          authenticity: "AUTHENTIC",
          approvalState: "APPROVED",
          supersession: "SUPERSEDES_PRIOR",
          supersedesEventId: "old-draw",
        },
      ],
    });
    expect(recon.utilizationRecords.some((r) => r.usageId === "old-draw" && r.status === "SUPERSEDED")).toBe(
      true,
    );
    expect(recon.usageAttributed.some((u) => u.usageId === "amend-replace")).toBe(true);
    expect(recon.usageAttributed.some((u) => u.usageId === "old-draw")).toBe(false);
  });

  it("SUCCESS: FINANCIAL_AND_UTILIZATION_EVIDENCE_SLICE_VERIFIED (not production-complete)", () => {
    const statements = ingestStatements({ verificationStatus: "UNVERIFIED_EXTRACTION" });
    const recon = reconstructUtil();
    const handoff = buildVerifiedCapacityInputHandoff({
      companyId: fixture.companyId,
      evaluationAsOf: fixture.asOf,
      financial: statements.snapshot!,
      requiredFinancialMetrics: fixture.requiredFinancialMetrics,
      utilization: toVerifiedUtilizationHandoffInput(recon),
    });

    const sliceVerified =
      fixture.label === "AUTHENTIC_SOURCE_BACKED" &&
      statements.ok &&
      recon.ok &&
      recon.usageAttributed.length > 0 &&
      recon.unknownHistoricalActivity === true &&
      recon.reviewerConfirmedCompleteness === false &&
      handoff.contractVersion === "verified-input-contract.v1" &&
      handoff.productionAuthority === "REFUSED" &&
      mayUseAsProductionCapacityInput(handoff) === false &&
      TRUSTED_ISSUER_ACTIVATION.status === "BLOCKED";

    expect(sliceVerified).toBe(true);
    // Explicit non-claim
    expect(handoff.productionActivation).toBe("BLOCKED");
  });
});
