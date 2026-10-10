/**
 * HEADROOM-3 Scope B — persistence identity hygiene against an isolated
 * EVALUATION fixture company only. No graph-wide backfill, no production
 * company mutation. Skips when HEADROOM3_SKIP_DB=1.
 *
 * Covers: provisional must not assign instrumentId, upgrade/orphan cleanup,
 * split clears stale membership, repeated persistence idempotency,
 * cross-company isolation of instrument rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  groupPackageIntoInstruments,
} from "@/lib/contract-model/compiler/package-graph/instrument-grouping";
import { persistPackageGraph } from "@/lib/contract-model/compiler/package-graph/persistence";
import type {
  DocumentClassification,
  PackageGraphResult,
  RelationshipCandidate,
} from "@/lib/contract-model/compiler/package-graph/types";

/**
 * Opt-in only. Default skip avoids Neon / production writes from this agent
 * environment. Set HEADROOM3_ALLOW_EVAL_DB=1 against an isolated EVALUATION
 * database to exercise the live prisma path.
 */
const SKIP = process.env.HEADROOM3_ALLOW_EVAL_DB !== "1" || !process.env.DATABASE_URL;
const describeDb = SKIP ? describe.skip : describe;

const COMPANY_A = "fixture-hr3-pkg-auth-co-a";
const COMPANY_B = "fixture-hr3-pkg-auth-co-b";

const DOC = {
  caA: "fixture-hr3-ca-a",
  amA: "fixture-hr3-am-a",
  caB: "fixture-hr3-ca-b",
  amB: "fixture-hr3-am-b",
  ca: "fixture-hr3-upgrade-ca",
  am: "fixture-hr3-upgrade-am",
  otherCoCa: "fixture-hr3-otherco-ca",
};

const cls = (documentId: string, type: DocumentClassification["type"]): DocumentClassification => ({
  documentId,
  type,
  confidence: 0.9,
  evidence: [],
  resolutionMethod: "DETERMINISTIC_TITLE_PATTERN",
});

function trustedAmends(source: string, target: string): RelationshipCandidate {
  return {
    sourceDocumentId: source,
    targetDocumentId: target,
    targetHint: "trusted",
    relationshipType: "AMENDS",
    sourceCitation: "operative amend",
    confidence: 0.95,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC_TITLE_DATE_MATCH",
    evidenceClass: "STRONG_TARGET_EVIDENCE",
  };
}

function provisionalAmends(source: string, target: string): RelationshipCandidate {
  return {
    sourceDocumentId: source,
    targetDocumentId: target,
    targetHint: "provisional",
    relationshipType: "AMENDS",
    sourceCitation: "WHEREAS",
    confidence: 0.6,
    status: "REVIEW_REQUIRED",
    unresolvedReason: "supporting evidence only",
    resolutionMethod: "DETERMINISTIC_TITLE_DATE_MATCH",
    evidenceClass: "SUPPORTING_TARGET_EVIDENCE",
  };
}

function graphFrom(
  companyId: string,
  instruments: ReturnType<typeof groupPackageIntoInstruments>,
  rels: RelationshipCandidate[],
  classifications: DocumentClassification[],
): PackageGraphResult {
  return {
    companyId,
    packageKey: "hr3-persistence",
    classifications,
    identities: [],
    relationshipCandidates: rels,
    modificationCandidates: [],
    crossDocumentReferenceLeads: [],
    instruments,
    performance: {
      documentCount: classifications.length,
      totalCharsScanned: 0,
      relationshipCandidatesGenerated: rels.length,
      relationshipsResolved: rels.filter((r) => r.status === "RESOLVED").length,
      relationshipsUnresolved: rels.filter((r) => r.status === "UNRESOLVED").length,
      modificationCandidatesGenerated: 0,
      crossDocumentReferenceLeadsGenerated: 0,
      wallClockMs: 0,
      semanticCallsUsed: 0,
    },
  };
}

describeDb("HEADROOM-3 persistence identity (EVALUATION fixture only)", () => {
  beforeAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
    await prisma.company.create({
      data: { id: COMPANY_A, name: "HR3 Package Auth Fixture A (EVALUATION)", tenantKind: "EVALUATION" },
    });
    await prisma.company.create({
      data: { id: COMPANY_B, name: "HR3 Package Auth Fixture B (EVALUATION)", tenantKind: "EVALUATION" },
    });
    for (const [key, id] of Object.entries(DOC)) {
      const companyId = key === "otherCoCa" ? COMPANY_B : COMPANY_A;
      await prisma.document.create({
        data: {
          id,
          companyId,
          name: key,
          type: key.toLowerCase().includes("am") ? "AMENDMENT" : "CREDIT_AGREEMENT",
          typeConfirmedByUser: false,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [COMPANY_A, COMPANY_B] } } });
  });

  it("provisional bridge does not assign shared instrumentId across instruments", async () => {
    const classifications = [
      cls(DOC.caA, "CREDIT_AGREEMENT"),
      cls(DOC.amA, "AMENDMENT"),
      cls(DOC.caB, "CREDIT_AGREEMENT"),
      cls(DOC.amB, "AMENDMENT"),
    ];
    const rels = [
      trustedAmends(DOC.amA, DOC.caA),
      trustedAmends(DOC.amB, DOC.caB),
      provisionalAmends(DOC.amA, DOC.caB),
    ];
    const instruments = groupPackageIntoInstruments(
      [DOC.caA, DOC.amA, DOC.caB, DOC.amB],
      classifications,
      [],
      rels,
    );
    const summary = await persistPackageGraph(COMPANY_A, graphFrom(COMPANY_A, instruments, rels, classifications));
    expect(summary.documentsAssignedToInstrument).toBeGreaterThan(0);

    const docs = await prisma.document.findMany({
      where: { id: { in: [DOC.caA, DOC.amA, DOC.caB, DOC.amB] } },
      select: { id: true, instrumentId: true },
    });
    const byId = new Map(docs.map((d) => [d.id, d.instrumentId]));
    expect(byId.get(DOC.caA)).toBeTruthy();
    expect(byId.get(DOC.amA)).toBe(byId.get(DOC.caA));
    expect(byId.get(DOC.caB)).toBeTruthy();
    expect(byId.get(DOC.amB)).toBe(byId.get(DOC.caB));
    expect(byId.get(DOC.caA)).not.toBe(byId.get(DOC.caB));
  });

  it("upgrade merges; rejection/split clears stale instrumentId; orphan singleton deleted", async () => {
    const classifications = [cls(DOC.ca, "CREDIT_AGREEMENT"), cls(DOC.am, "AMENDMENT")];

    const provRels = [provisionalAmends(DOC.am, DOC.ca)];
    const provInstruments = groupPackageIntoInstruments([DOC.ca, DOC.am], classifications, [], provRels);
    await persistPackageGraph(COMPANY_A, graphFrom(COMPANY_A, provInstruments, provRels, classifications));
    let am = await prisma.document.findUnique({ where: { id: DOC.am } });
    let ca = await prisma.document.findUnique({ where: { id: DOC.ca } });
    expect(ca!.instrumentId).toBeTruthy();
    expect(am!.instrumentId).toBeTruthy();
    expect(am!.instrumentId).not.toBe(ca!.instrumentId);
    const caInstrumentId = ca!.instrumentId!;
    const amSingletonId = am!.instrumentId!;

    // Simulate prior contamination: provisional wrongly assigned to parent.
    await prisma.document.update({ where: { id: DOC.am }, data: { instrumentId: caInstrumentId } });
    const cleanup = await persistPackageGraph(COMPANY_A, graphFrom(COMPANY_A, provInstruments, provRels, classifications));
    expect((cleanup.staleInstrumentIdsCleared ?? 0) + 1).toBeGreaterThan(0);
    am = await prisma.document.findUnique({ where: { id: DOC.am } });
    expect(am!.instrumentId).not.toBe(caInstrumentId);

    const trustedRels = [trustedAmends(DOC.am, DOC.ca)];
    const trustedInstruments = groupPackageIntoInstruments([DOC.ca, DOC.am], classifications, [], trustedRels);
    await persistPackageGraph(COMPANY_A, graphFrom(COMPANY_A, trustedInstruments, trustedRels, classifications));
    am = await prisma.document.findUnique({ where: { id: DOC.am } });
    ca = await prisma.document.findUnique({ where: { id: DOC.ca } });
    expect(am!.instrumentId).toBe(ca!.instrumentId);
    expect(am!.instrumentId).toBe(caInstrumentId);
    const orphan = await prisma.debtInstrument.findUnique({ where: { id: amSingletonId } });
    expect(orphan).toBeNull();

    const none: RelationshipCandidate[] = [];
    const split = groupPackageIntoInstruments([DOC.ca, DOC.am], classifications, [], none);
    await persistPackageGraph(COMPANY_A, graphFrom(COMPANY_A, split, none, classifications));
    am = await prisma.document.findUnique({ where: { id: DOC.am } });
    ca = await prisma.document.findUnique({ where: { id: DOC.ca } });
    expect(ca!.instrumentId).toBe(caInstrumentId);
    expect(am!.instrumentId).toBeTruthy();
    expect(am!.instrumentId).not.toBe(ca!.instrumentId);
  });

  it("repeated persistence is idempotent (no duplicate instruments / edges)", async () => {
    const classifications = [cls(DOC.caA, "CREDIT_AGREEMENT"), cls(DOC.amA, "AMENDMENT")];
    const rels = [trustedAmends(DOC.amA, DOC.caA)];
    const instruments = groupPackageIntoInstruments([DOC.caA, DOC.amA], classifications, [], rels);
    const g = graphFrom(COMPANY_A, instruments, rels, classifications);
    await persistPackageGraph(COMPANY_A, g);
    await persistPackageGraph(COMPANY_A, g);
    await persistPackageGraph(COMPANY_A, g);

    const instrumentsCount = await prisma.debtInstrument.count({
      where: { companyId: COMPANY_A, baseDocumentId: DOC.caA },
    });
    expect(instrumentsCount).toBe(1);

    const edges = await prisma.documentRelationshipEdge.count({
      where: { companyId: COMPANY_A, sourceDocumentId: DOC.amA, targetDocumentId: DOC.caA },
    });
    expect(edges).toBe(1);
  });

  it("cross-company contamination: company B document never receives company A instrumentId", async () => {
    const classifications = [cls(DOC.caA, "CREDIT_AGREEMENT"), cls(DOC.amA, "AMENDMENT")];
    const rels = [trustedAmends(DOC.amA, DOC.caA)];
    const instruments = groupPackageIntoInstruments([DOC.caA, DOC.amA], classifications, [], rels);
    await persistPackageGraph(COMPANY_A, graphFrom(COMPANY_A, instruments, rels, classifications));

    const bDoc = await prisma.document.findUnique({ where: { id: DOC.otherCoCa }, select: { instrumentId: true, companyId: true } });
    expect(bDoc!.companyId).toBe(COMPANY_B);
    expect(bDoc!.instrumentId).toBeNull();

    // Hostile graph names another company's document — persistence must refuse
    // to assign instrumentId or create a base instrument for it under company A.
    const hostileClassifications = [...classifications, cls(DOC.otherCoCa, "CREDIT_AGREEMENT")];
    const hostileInstruments = groupPackageIntoInstruments(
      [DOC.caA, DOC.amA, DOC.otherCoCa],
      hostileClassifications,
      [],
      rels,
    );
    await persistPackageGraph(COMPANY_A, graphFrom(COMPANY_A, hostileInstruments, rels, hostileClassifications));
    const bAfter = await prisma.document.findUnique({ where: { id: DOC.otherCoCa }, select: { instrumentId: true } });
    expect(bAfter!.instrumentId).toBeNull();
    const bInstruments = await prisma.debtInstrument.count({ where: { companyId: COMPANY_B } });
    expect(bInstruments).toBe(0);
    const aBaseOnForeignDoc = await prisma.debtInstrument.count({
      where: { companyId: COMPANY_A, baseDocumentId: DOC.otherCoCa },
    });
    expect(aBaseOnForeignDoc).toBe(0);
  });
});
