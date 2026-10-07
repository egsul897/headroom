/**
 * P3-FFC2 — review-audit honesty + canonical financial identity.
 *
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED. invent-absence forever.
 * PINNED_OFFLINE ≠ CERTIFIED. A green run is not certification credit.
 *
 * R1 system REVIEW_REQUIRED is append-only and reviewedBy stays null.
 * R2 original rationale is byte-stable.
 * R3 zero stored rows → UNKNOWN.
 * R4 one stored row → that row.
 * R5 duplicate stored rows → AMBIGUOUS (no findFirst pick).
 * R6 covenant-engine, financial-core adapter, dashboard, coherent, overview.
 * R7 DEFINED_TERM conflict does not dual-promote.
 * R8 DOCUMENT_RELATIONSHIP conflict has no iteration-order winner.
 * R9 FFC1 CONFLICTING_FINANCIAL_FACTS / applied honesty stays.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react");
  return { ...actual, cache: (fn: unknown) => fn };
});

import { prisma } from "../../lib/prisma";
import { connectSource } from "../../lib/connectors/registry";
import { ensureFinancialFactContainer } from "../../lib/connectors/ingestion";
import { promoteCompanyCandidates, CONFLICTING_DEFINED_TERMS, CONFLICTING_DOCUMENT_RELATIONSHIPS } from "../../lib/onboarding/promotion";
import { CONFLICTING_FINANCIAL_FACTS, createManualFinancialState, upsertFinancialFactsForDate } from "../../lib/onboarding/financial";
import { loadCompanyCovenantData } from "../../lib/covenant-engine";
import { loadCompanyFinancialCoreData, loadFinancialState } from "../../lib/financial-core-db/adapter";
import { getCompanyDashboard } from "../../lib/dashboard-service";
import { getCovenantOverview } from "../../lib/covenant-overview-service";
import { getDebtTranches, getFinancialSnapshot } from "../../lib/coherent";
import { FINANCIAL_IDENTITY_AMBIGUOUS, FINANCIAL_IDENTITY_UNKNOWN, FinancialIdentityError, resolveCanonicalFinancialIdentity } from "../../lib/financial-identity";

const IDS = [
  "fixture-p3-ffc2-r1",
  "fixture-p3-ffc2-r9",
  "fixture-p3-ffc2-none",
  "fixture-p3-ffc2-one",
  "fixture-p3-ffc2-dup-snap",
  "fixture-p3-ffc2-dup-state",
  "fixture-p3-ffc2-cohort",
  "fixture-p3-ffc2-effective",
  "fixture-p3-ffc2-term-a",
  "fixture-p3-ffc2-term-b",
  "fixture-p3-ffc2-term-ok",
  "fixture-p3-ffc2-term-stored",
  "fixture-p3-ffc2-doc-a",
  "fixture-p3-ffc2-doc-b",
  "fixture-p3-ffc2-doc-ok",
  "fixture-p3-ffc2-doc-confirmed",
  "fixture-p3-ffc2-doc-pair",
] as const;

const AS_OF = new Date("2026-06-30T00:00:00.000Z");
const PRIOR = new Date("2026-01-31T00:00:00.000Z");
const ORIGINAL_RATIONALE = "ORIGINAL RATIONALE byte-stable token";
const HUMAN_REVIEWER = "human-reviewer@example.com";
const HUMAN_REVIEWED_AT = new Date("2026-03-15T12:00:00.000Z");

const BASE_ROW = {
  ebitda: 18,
  cash: 4.2,
  interestExpense: 2.1,
  cumulativeNetIncome: 9,
  equityProceedsSinceIssue: 5,
  assumedNewDebtRatePct: 7.5,
  totalDebt: 52,
  securedDebt: 30,
};

function expectCode(err: unknown, code: "UNKNOWN" | "AMBIGUOUS") {
  expect(err).toBeInstanceOf(FinancialIdentityError);
  const identity = err as FinancialIdentityError;
  expect(identity.code).toBe(code);
  expect(identity.message).toContain(code === "UNKNOWN" ? FINANCIAL_IDENTITY_UNKNOWN : FINANCIAL_IDENTITY_AMBIGUOUS);
  if (code === "AMBIGUOUS") expect(identity.matchCount).toBeGreaterThan(1);
  return identity;
}

async function stageFor(companyId: string, documentId: string, stage: "DEFINITIONS" | "STRUCTURE" | "FINANCIAL_INPUTS") {
  const run = await prisma.extractionRun.create({
    data: { companyId, documentId, provider: "ffc2-fixture", model: "n/a", promptVersion: "n/a", schemaVersion: "v1" },
  });
  const row = await prisma.extractionStage.create({
    data: { extractionRunId: run.id, stage, status: "COMPLETE" },
  });
  return { extractionRunId: run.id, extractionStageId: row.id };
}

describe("P3-FFC2 review audit and canonical financial identity", () => {
  beforeAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [...IDS] } } });
    for (const id of IDS) {
      await prisma.company.create({ data: { id, name: `Fixture ${id} (synthetic, test-only)` } });
    }
  });

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [...IDS] } } });
  });

  it("R1/R2 conflict REVIEW_REQUIRED is append-only, rationale is byte-stable, and reviewedBy is not fabricated", async () => {
    const companyId = IDS[0];
    const connection = await connectSource({ companyId, connectorType: "CSV_FINANCIAL" });
    const container = await ensureFinancialFactContainer(companyId, connection);
    const proposed = (value: number) => ({
      metricName: "cash",
      value,
      asOfDate: "2026-06-30",
      canonicalUnit: "USD_MILLIONS",
      originalValue: value,
      originalUnit: "USD_MILLIONS",
    });
    const early = await prisma.extractionCandidate.create({
      data: {
        extractionRunId: container.extractionRunId,
        extractionStageId: container.extractionStageId,
        companyId,
        kind: "FINANCIAL_FACT",
        sourceDocumentId: container.documentId,
        sourceChunkIds: [],
        proposedValue: proposed(1.1),
        reviewStatus: "APPROVED",
        rationale: ORIGINAL_RATIONALE,
        reviewedBy: HUMAN_REVIEWER,
        reviewedAt: HUMAN_REVIEWED_AT,
      },
    });
    const later = await prisma.extractionCandidate.create({
      data: {
        extractionRunId: container.extractionRunId,
        extractionStageId: container.extractionStageId,
        companyId,
        kind: "FINANCIAL_FACT",
        sourceDocumentId: container.documentId,
        sourceChunkIds: [],
        proposedValue: proposed(9.9),
        reviewStatus: "APPROVED",
        rationale: ORIGINAL_RATIONALE,
        reviewedBy: HUMAN_REVIEWER,
        reviewedAt: HUMAN_REVIEWED_AT,
        createdAt: new Date("2026-04-02T00:00:00.000Z"),
      },
    });

    const promotion = await promoteCompanyCandidates(companyId, AS_OF);
    expect(promotion.skipped.map((s) => s.candidateId).sort()).toEqual([early.id, later.id].sort());
    expect(promotion.skipped.every((s) => s.reason.includes(CONFLICTING_FINANCIAL_FACTS))).toBe(true);
    expect(promotion.promotedCount).toBe(0);

    for (const id of [early.id, later.id]) {
      const after = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id } });
      expect(after.reviewStatus).toBe("REVIEW_REQUIRED");
      expect(after.rationale).toBe(ORIGINAL_RATIONALE);
      expect(after.reviewedBy).toBe(HUMAN_REVIEWER);
      expect(after.reviewedAt?.toISOString()).toBe(HUMAN_REVIEWED_AT.toISOString());
      expect(after.promotedAt).toBeNull();
      expect(after.promotedToId).toBeNull();
      const events = await prisma.candidateReviewEvent.findMany({ where: { candidateId: id } });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: "REVIEW_REQUIRED",
        previousStatus: "APPROVED",
        newStatus: "REVIEW_REQUIRED",
        reviewedBy: null,
      });
      expect(events[0]!.note).toContain(CONFLICTING_FINANCIAL_FACTS);
      expect(events[0]!.reviewedBy).toBeNull();
    }
    expect(await prisma.financialSnapshot.count({ where: { companyId } })).toBe(0);
  });

  it("R3/R4/R5/R6 readers: UNKNOWN, the single row, and AMBIGUOUS on duplicate stored rows", async () => {
    const none = IDS[2];
    await expect(loadCompanyCovenantData(prisma, none, AS_OF)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "UNKNOWN");
      return true;
    });
    expect(await loadFinancialState(prisma, none, AS_OF)).toBeNull();
    await expect(loadCompanyFinancialCoreData(prisma, none, AS_OF)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "UNKNOWN");
      return true;
    });
    await expect(getCompanyDashboard(none)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "UNKNOWN");
      return true;
    });
    await expect(getCovenantOverview(none)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "UNKNOWN");
      return true;
    });
    expect(await getFinancialSnapshot(none, AS_OF)).toBeNull();
    expect(await getDebtTranches(none)).toEqual([]);

    const one = IDS[3];
    const state = await createManualFinancialState({
      companyId: one,
      asOfDate: AS_OF,
      notes: "single-row",
      ebitda: 18,
      cash: 4.2,
      totalDebtPrincipal: 52,
      securedDebtPrincipal: 30,
      cumulativeNetIncomeSinceIssue: 9,
      equityProceedsSinceIssue: 5,
      interestExpense: 2.1,
      assumedNewDebtRatePct: 7.5,
    });
    const loaded = await loadCompanyCovenantData(prisma, one, AS_OF);
    expect(loaded.financials.cash).toBe(4.2);
    expect(loaded.financials.ebitda).toBe(18);
    const loadedState = await loadFinancialState(prisma, one, AS_OF);
    expect(loadedState?.id).toBe(state.id);
    const dashboard = await getCompanyDashboard(one);
    expect(dashboard.asOfDate.toISOString()).toBe(AS_OF.toISOString());
    const snapshot = await getFinancialSnapshot(one, AS_OF);
    expect(snapshot?.id).toBeTruthy();
    expect(snapshot?.cash.toNumber()).toBe(4.2);
    const overview = await getCovenantOverview(one);
    expect(overview.company.id).toBe(one);

    const exactNone = await resolveCanonicalFinancialIdentity(
      (args) => prisma.financialSnapshot.findMany(args),
      { where: { companyId: none, asOfDate: AS_OF }, selection: "exact" },
    );
    expect(exactNone.status).toBe("UNKNOWN");
    const exactOne = await resolveCanonicalFinancialIdentity(
      (args) => prisma.financialSnapshot.findMany(args),
      { where: { companyId: one, asOfDate: AS_OF }, selection: "exact" },
    );
    expect(exactOne.status).toBe("UNIQUE");

    const dupSnap = IDS[4];
    const dupSnapState = await createManualFinancialState({
      companyId: dupSnap,
      asOfDate: AS_OF,
      notes: "snap-state",
      ebitda: 18,
      cash: 4.2,
      totalDebtPrincipal: 52,
      securedDebtPrincipal: 30,
      cumulativeNetIncomeSinceIssue: 9,
      equityProceedsSinceIssue: 5,
      interestExpense: 2.1,
      assumedNewDebtRatePct: 7.5,
    });
    await prisma.financialSnapshot.create({ data: { companyId: dupSnap, asOfDate: AS_OF, notes: "snap-b", ...BASE_ROW, cash: 2 } });
    await expect(loadCompanyCovenantData(prisma, dupSnap, AS_OF)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "AMBIGUOUS");
      return true;
    });
    await expect(getFinancialSnapshot(dupSnap, AS_OF)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "AMBIGUOUS");
      return true;
    });
    await expect(getDebtTranches(dupSnap)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "AMBIGUOUS");
      return true;
    });
    await expect(getCompanyDashboard(dupSnap)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "AMBIGUOUS");
      return true;
    });
    await expect(getCovenantOverview(dupSnap)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "AMBIGUOUS");
      return true;
    });
    expect((await loadFinancialState(prisma, dupSnap, AS_OF))?.id).toBe(dupSnapState.id);
    const snapRows = await prisma.financialSnapshot.findMany({ where: { companyId: dupSnap, asOfDate: AS_OF } });
    expect(snapRows).toHaveLength(2);
    expect(new Set(snapRows.map((row) => row.cash.toNumber()))).toEqual(new Set([4.2, 2]));
    const exactDup = await resolveCanonicalFinancialIdentity(
      (args) => prisma.financialSnapshot.findMany(args),
      { where: { companyId: dupSnap, asOfDate: AS_OF }, selection: "exact" },
    );
    expect(exactDup.status).toBe("AMBIGUOUS");
    if (exactDup.status === "AMBIGUOUS") expect(exactDup.matchCount).toBe(2);

    const dupState = IDS[5];
    const kept = await createManualFinancialState({
      companyId: dupState,
      asOfDate: AS_OF,
      notes: "state-kept",
      ebitda: 18,
      cash: 11,
      totalDebtPrincipal: 52,
      securedDebtPrincipal: 30,
      cumulativeNetIncomeSinceIssue: 9,
      equityProceedsSinceIssue: 5,
      interestExpense: 2.1,
      assumedNewDebtRatePct: 7.5,
    });
    await prisma.financialState.create({
      data: {
        companyId: dupState,
        asOfDate: AS_OF,
        notes: "state-duplicate",
        balanceSheetFacts: { marker: "duplicate" },
        incomeStatementFacts: { marker: "duplicate" },
        covenantMetricFacts: { marker: "duplicate" },
      },
    });
    await expect(loadFinancialState(prisma, dupState, AS_OF)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "AMBIGUOUS");
      return true;
    });
    await expect(loadCompanyFinancialCoreData(prisma, dupState, AS_OF)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "AMBIGUOUS");
      return true;
    });
    await expect(getCompanyDashboard(dupState)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "AMBIGUOUS");
      return true;
    });
    await expect(getCovenantOverview(dupState)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "AMBIGUOUS");
      return true;
    });
    const stateRows = await prisma.financialState.findMany({ where: { companyId: dupState, asOfDate: AS_OF } });
    expect(stateRows).toHaveLength(2);
    expect(stateRows.map((row) => row.id)).toContain(kept.id);

    const cohort = IDS[6];
    await prisma.financialSnapshot.create({ data: { companyId: cohort, asOfDate: PRIOR, notes: "old-a", ...BASE_ROW, cash: 1 } });
    await prisma.financialSnapshot.create({ data: { companyId: cohort, asOfDate: PRIOR, notes: "old-b", ...BASE_ROW, cash: 2 } });
    await prisma.financialSnapshot.create({ data: { companyId: cohort, asOfDate: AS_OF, notes: "later-unique", ...BASE_ROW, cash: 9 } });
    const later = await loadCompanyCovenantData(prisma, cohort, AS_OF);
    expect(later.financials.cash).toBe(9);
    await expect(loadCompanyCovenantData(prisma, cohort, PRIOR)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "AMBIGUOUS");
      return true;
    });

    const effective = IDS[7];
    const live = await createManualFinancialState({
      companyId: effective,
      asOfDate: AS_OF,
      notes: "effective-live",
      ebitda: 18,
      cash: 6,
      totalDebtPrincipal: 52,
      securedDebtPrincipal: 30,
      cumulativeNetIncomeSinceIssue: 9,
      equityProceedsSinceIssue: 5,
      interestExpense: 2.1,
      assumedNewDebtRatePct: 7.5,
    });
    await prisma.financialState.create({
      data: {
        companyId: effective,
        asOfDate: AS_OF,
        notes: "expired-duplicate",
        effectiveTo: new Date("2020-01-01T00:00:00.000Z"),
        balanceSheetFacts: { marker: "expired" },
        incomeStatementFacts: { marker: "expired" },
        covenantMetricFacts: { marker: "expired" },
      },
    });
    const filtered = await loadFinancialState(prisma, effective, AS_OF);
    expect(filtered?.id).toBe(live.id);
    await expect(getCompanyDashboard(effective)).rejects.toSatisfy((err: unknown) => {
      expectCode(err, "AMBIGUOUS");
      return true;
    });
  });

  it("R7 conflicting DEFINED_TERM values are not dual-promoted and identical text corroborates", async () => {
    async function termCandidate(companyId: string, documentId: string, fullText: string, createdAt: Date, sectionRef = "1.01") {
      const stage = await stageFor(companyId, documentId, "DEFINITIONS");
      return prisma.extractionCandidate.create({
        data: {
          ...stage,
          companyId,
          kind: "DEFINED_TERM",
          sourceDocumentId: documentId,
          sourceChunkIds: [],
          proposedValue: { termName: "EBITDA", sectionRef, fullText },
          reviewStatus: "APPROVED",
          createdAt,
        },
      });
    }

    const docA = await prisma.document.create({
      data: { companyId: IDS[8], name: "terms-a.txt", type: "OTHER", typeConfirmedByUser: false, amendmentRelationshipConfirmedByUser: false },
    });
    const firstA = await termCandidate(IDS[8], docA.id, "alpha definition", new Date("2026-01-01T00:00:00.000Z"));
    const secondA = await termCandidate(IDS[8], docA.id, "beta definition", new Date("2026-02-01T00:00:00.000Z"));
    const docB = await prisma.document.create({
      data: { companyId: IDS[9], name: "terms-b.txt", type: "OTHER", typeConfirmedByUser: false, amendmentRelationshipConfirmedByUser: false },
    });
    const firstB = await termCandidate(IDS[9], docB.id, "beta definition", new Date("2026-01-01T00:00:00.000Z"));
    const secondB = await termCandidate(IDS[9], docB.id, "alpha definition", new Date("2026-02-01T00:00:00.000Z"));

    const promoA = await promoteCompanyCandidates(IDS[8]);
    const promoB = await promoteCompanyCandidates(IDS[9]);
    expect(promoA.skipped.every((s) => s.reason.includes(CONFLICTING_DEFINED_TERMS))).toBe(true);
    expect(promoB.skipped.every((s) => s.reason.includes(CONFLICTING_DEFINED_TERMS))).toBe(true);
    for (const id of [firstA.id, secondA.id, firstB.id, secondB.id]) {
      const after = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id } });
      expect(after.promotedAt).toBeNull();
      expect(after.promotedToId).toBeNull();
    }
    expect(await prisma.definedTerm.count({ where: { documentId: { in: [docA.id, docB.id] } } })).toBe(0);

    const docOk = await prisma.document.create({
      data: { companyId: IDS[10], name: "terms-ok.txt", type: "OTHER", typeConfirmedByUser: false, amendmentRelationshipConfirmedByUser: false },
    });
    const okA = await termCandidate(IDS[10], docOk.id, "same definition", new Date("2026-01-01T00:00:00.000Z"));
    const okB = await termCandidate(IDS[10], docOk.id, "same definition", new Date("2026-02-01T00:00:00.000Z"));
    await promoteCompanyCandidates(IDS[10]);
    const terms = await prisma.definedTerm.findMany({ where: { documentId: docOk.id } });
    expect(terms).toHaveLength(1);
    expect(terms[0]!.fullText).toBe("same definition");
    const okAfter = await Promise.all([okA.id, okB.id].map((id) => prisma.extractionCandidate.findUniqueOrThrow({ where: { id } })));
    expect(okAfter.every((row) => row.promotedAt && row.promotedToId === terms[0]!.id)).toBe(true);

    const docStored = await prisma.document.create({
      data: { companyId: IDS[11], name: "terms-stored.txt", type: "OTHER", typeConfirmedByUser: false, amendmentRelationshipConfirmedByUser: false },
    });
    const stored = await prisma.definedTerm.create({
      data: { documentId: docStored.id, termName: "EBITDA", sectionRef: "1.01", fullText: "stored definition" },
    });
    const match = await termCandidate(IDS[11], docStored.id, "stored definition", new Date("2026-01-01T00:00:00.000Z"));
    const clash = await termCandidate(IDS[11], docStored.id, "other definition", new Date("2026-02-01T00:00:00.000Z"), "9.99");
    await promoteCompanyCandidates(IDS[11]);
    const storedAfter = await prisma.definedTerm.findUniqueOrThrow({ where: { id: stored.id } });
    expect(storedAfter.fullText).toBe("stored definition");
    expect(storedAfter.sectionRef).toBe("1.01");
    const matchAfter = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: match.id } });
    const clashAfter = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: clash.id } });
    expect(matchAfter.promotedToId).toBe(stored.id);
    expect(matchAfter.promotedAt).not.toBeNull();
    expect(clashAfter.promotedAt).toBeNull();
    expect(clashAfter.promotedToId).toBeNull();
  });

  it("R8 divergent DOCUMENT_RELATIONSHIP writes have no iteration-order winner", async () => {
    async function relCandidate(companyId: string, documentId: string, documentType: string, createdAt: Date, supersedesDocumentRef?: string) {
      const stage = await stageFor(companyId, documentId, "STRUCTURE");
      return prisma.extractionCandidate.create({
        data: {
          ...stage,
          companyId,
          kind: "DOCUMENT_RELATIONSHIP",
          sourceDocumentId: documentId,
          sourceChunkIds: [],
          proposedValue: { documentType, ...(supersedesDocumentRef ? { supersedesDocumentRef } : {}), articleOutline: [] },
          reviewStatus: "APPROVED",
          createdAt,
        },
      });
    }

    const docA = await prisma.document.create({
      data: { companyId: IDS[12], name: "rel-a.txt", type: "OTHER", typeConfirmedByUser: false, amendmentRelationshipConfirmedByUser: false },
    });
    const aEarly = await relCandidate(IDS[12], docA.id, "CREDIT_AGREEMENT", new Date("2026-01-01T00:00:00.000Z"));
    const aLate = await relCandidate(IDS[12], docA.id, "INDENTURE", new Date("2026-02-01T00:00:00.000Z"));
    const docB = await prisma.document.create({
      data: { companyId: IDS[13], name: "rel-b.txt", type: "OTHER", typeConfirmedByUser: false, amendmentRelationshipConfirmedByUser: false },
    });
    const bEarly = await relCandidate(IDS[13], docB.id, "INDENTURE", new Date("2026-01-01T00:00:00.000Z"));
    const bLate = await relCandidate(IDS[13], docB.id, "CREDIT_AGREEMENT", new Date("2026-02-01T00:00:00.000Z"));
    const promoA = await promoteCompanyCandidates(IDS[12]);
    const promoB = await promoteCompanyCandidates(IDS[13]);
    expect(promoA.skipped.every((s) => s.reason.includes(CONFLICTING_DOCUMENT_RELATIONSHIPS))).toBe(true);
    expect(promoB.skipped.every((s) => s.reason.includes(CONFLICTING_DOCUMENT_RELATIONSHIPS))).toBe(true);
    for (const id of [docA.id, docB.id]) {
      const doc = await prisma.document.findUniqueOrThrow({ where: { id } });
      expect(doc.type).toBe("OTHER");
      expect(doc.typeConfirmedByUser).toBe(false);
      expect(doc.supersedesDocumentId).toBeNull();
    }
    for (const id of [aEarly.id, aLate.id, bEarly.id, bLate.id]) {
      const after = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id } });
      expect(after.promotedAt).toBeNull();
    }

    const docOk = await prisma.document.create({
      data: { companyId: IDS[14], name: "rel-ok.txt", type: "OTHER", typeConfirmedByUser: false, amendmentRelationshipConfirmedByUser: false },
    });
    const okA = await relCandidate(IDS[14], docOk.id, "CREDIT_AGREEMENT", new Date("2026-01-01T00:00:00.000Z"));
    const okB = await relCandidate(IDS[14], docOk.id, "CREDIT_AGREEMENT", new Date("2026-02-01T00:00:00.000Z"));
    await promoteCompanyCandidates(IDS[14]);
    const okDoc = await prisma.document.findUniqueOrThrow({ where: { id: docOk.id } });
    expect(okDoc.type).toBe("CREDIT_AGREEMENT");
    expect(okDoc.typeConfirmedByUser).toBe(true);
    for (const id of [okA.id, okB.id]) {
      const after = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id } });
      expect(after.promotedAt).not.toBeNull();
      expect(after.promotedToId).toBe(docOk.id);
    }

    const docConfirmed = await prisma.document.create({
      data: { companyId: IDS[15], name: "rel-confirmed.txt", type: "CREDIT_AGREEMENT", typeConfirmedByUser: true, amendmentRelationshipConfirmedByUser: true },
    });
    const divergent = await relCandidate(IDS[15], docConfirmed.id, "INDENTURE", new Date("2026-03-01T00:00:00.000Z"));
    const confirmedPromo = await promoteCompanyCandidates(IDS[15]);
    expect(confirmedPromo.skipped.map((s) => s.candidateId)).toEqual([divergent.id]);
    expect(confirmedPromo.skipped[0]!.reason).toContain(CONFLICTING_DOCUMENT_RELATIONSHIPS);
    const confirmedAfter = await prisma.document.findUniqueOrThrow({ where: { id: docConfirmed.id } });
    expect(confirmedAfter.type).toBe("CREDIT_AGREEMENT");
    expect((await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: divergent.id } })).promotedAt).toBeNull();

    const base = await prisma.document.create({
      data: { companyId: IDS[16], name: "Base Agreement", type: "OTHER", typeConfirmedByUser: false, amendmentRelationshipConfirmedByUser: false },
    });
    const amendment = await prisma.document.create({
      data: { companyId: IDS[16], name: "Amendment No. 1", type: "OTHER", typeConfirmedByUser: false, amendmentRelationshipConfirmedByUser: false },
    });
    const baseRel = await relCandidate(IDS[16], base.id, "CREDIT_AGREEMENT", new Date("2026-01-01T00:00:00.000Z"));
    const amendmentRel = await relCandidate(IDS[16], amendment.id, "AMENDMENT", new Date("2026-02-01T00:00:00.000Z"), "Base Agreement");
    await promoteCompanyCandidates(IDS[16]);
    const baseAfter = await prisma.document.findUniqueOrThrow({ where: { id: base.id } });
    const amendmentAfter = await prisma.document.findUniqueOrThrow({ where: { id: amendment.id } });
    expect(baseAfter.type).toBe("CREDIT_AGREEMENT");
    expect(amendmentAfter.type).toBe("AMENDMENT");
    expect(amendmentAfter.supersedesDocumentId).toBe(base.id);
    expect((await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: baseRel.id } })).promotedAt).not.toBeNull();
    expect((await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: amendmentRel.id } })).promotedAt).not.toBeNull();
  });

  it("R9 FFC1 W≠V stays CONFLICTING_FINANCIAL_FACTS and applied honesty stays intact", async () => {
    const companyId = IDS[1];
    await prisma.financialSnapshot.create({ data: { companyId, asOfDate: AS_OF, notes: "canonical", ...BASE_ROW } });
    const written = await upsertFinancialFactsForDate(companyId, AS_OF, [
      { key: "w", metricName: "cash", value: 8.8 },
      { key: "same-ebitda", metricName: "covenant_ebitda", value: 18 },
    ], "r9");
    expect(written.perFact.find((f) => f.key === "w")).toMatchObject({ applied: false });
    expect(written.perFact.find((f) => f.key === "w")!.skipReason).toContain(CONFLICTING_FINANCIAL_FACTS);
    expect(written.perFact.find((f) => f.key === "same-ebitda")!.applied).toBe(true);
    const row = await prisma.financialSnapshot.findFirstOrThrow({ where: { companyId, asOfDate: AS_OF } });
    expect(row.cash.toNumber()).toBe(4.2);
    expect(row.ebitda.toNumber()).toBe(18);
    expect(row.notes).toBe("canonical");

    const financialSrc = readFileSync(join(process.cwd(), "lib/onboarding/financial.ts"), "utf8");
    expect(financialSrc).toContain("financialSnapshot.findFirst");
    expect(financialSrc).toContain("CONFLICTING_FINANCIAL_FACTS");
    expect(financialSrc).not.toContain("financial-identity");
    const promotionSrc = readFileSync(join(process.cwd(), "lib/onboarding/promotion.ts"), "utf8");
    expect(promotionSrc).toContain("recordSystemReviewRequired");
    expect(promotionSrc).toContain("CONFLICTING_FINANCIAL_FACTS");
    expect(promotionSrc).not.toMatch(/rationale:\s*reason/);
    expect(promotionSrc).toContain('Duplicate permissionRef "${value.permissionRef}" already promoted in this batch - not re-promoted.');
  });
});
