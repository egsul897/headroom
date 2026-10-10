/**
 * Adversarial canonical-identity tests (PR #260 audit remediation):
 * provisional REVIEW_REQUIRED edges must not merge confirmed instruments or
 * assign Document.instrumentId. Covers in-memory grouping AND persistence,
 * upgrade (provisional → confirmed), and rejection/removal cleanup.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  groupPackageIntoInstruments,
  isAssociativeGroupingEdge,
  isTrustedGroupingEdge,
} from "@/lib/contract-model/compiler/package-graph/instrument-grouping";
import { persistPackageGraph } from "@/lib/contract-model/compiler/package-graph/persistence";
import type {
  DocumentClassification,
  PackageGraphResult,
  RelationshipCandidate,
} from "@/lib/contract-model/compiler/package-graph/types";

const COMPANY_ID = "fixture-a6-bridge-identity-co";

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
    sourceCitation: "operative",
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
  instruments: ReturnType<typeof groupPackageIntoInstruments>,
  rels: RelationshipCandidate[],
  classifications: DocumentClassification[],
): PackageGraphResult {
  return {
    companyId: COMPANY_ID,
    packageKey: "bridge-identity",
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

describe("provisional bridge must not alter canonical instrument identity", () => {
  it("two confirmed instruments + REVIEW_REQUIRED bridge stay separate in-memory", () => {
    const classifications = [
      cls("ca-a", "CREDIT_AGREEMENT"),
      cls("am-a", "AMENDMENT"),
      cls("ca-b", "CREDIT_AGREEMENT"),
      cls("am-b", "AMENDMENT"),
    ];
    const rels = [
      trustedAmends("am-a", "ca-a"),
      trustedAmends("am-b", "ca-b"),
      // Adversarial bridge: confirmed member of A provisionally points at B.
      provisionalAmends("am-a", "ca-b"),
    ];
    expect(isTrustedGroupingEdge(rels[0]!)).toBe(true);
    expect(isAssociativeGroupingEdge(rels[2]!)).toBe(true);

    const result = groupPackageIntoInstruments(
      ["ca-a", "am-a", "ca-b", "am-b"],
      classifications,
      [],
      rels,
    );
    expect(result).toHaveLength(2);
    const instA = result.find((i) => i.baseDocumentId === "ca-a")!;
    const instB = result.find((i) => i.baseDocumentId === "ca-b")!;
    expect(instA.documentIds.sort()).toEqual(["am-a", "ca-a"]);
    expect(instB.documentIds.sort()).toEqual(["am-b", "ca-b"]);
    // Bridge must not pull B's docs into A or vice versa.
    expect(instA.documentIds).not.toContain("ca-b");
    expect(instA.documentIds).not.toContain("am-b");
    expect(instA.provisionalDocumentIds ?? []).not.toContain("am-a");
    expect(
      [...(instA.provisionalBridgeBlockers ?? []), ...(instB.provisionalBridgeBlockers ?? [])].some(
        (b) => b.reason === "BRIDGES_CONFIRMED_INSTRUMENTS",
      ),
    ).toBe(true);
  });

  it("upgrading a provisional edge to trusted evidence deterministically merges membership", () => {
    const classifications = [cls("ca", "CREDIT_AGREEMENT"), cls("am", "AMENDMENT")];
    const provisional = [provisionalAmends("am", "ca")];
    const before = groupPackageIntoInstruments(["ca", "am"], classifications, [], provisional);
    expect(before.find((i) => i.baseDocumentId === "ca")!.documentIds).toEqual(["ca"]);
    expect(before.find((i) => i.baseDocumentId === "ca")!.provisionalDocumentIds).toEqual(["am"]);

    const confirmed = [trustedAmends("am", "ca")];
    const after = groupPackageIntoInstruments(["ca", "am"], classifications, [], confirmed);
    expect(after).toHaveLength(1);
    expect(after[0]!.documentIds.sort()).toEqual(["am", "ca"]);
    expect(after[0]!.associationKind).toBe("CONFIRMED");
    expect(after[0]!.provisionalDocumentIds).toEqual([]);
    expect(after[0]!.reviewStatus).toBe("RESOLVED");
  });
});

describe("provisional bridge persistence (Document.instrumentId)", () => {
  const DOC_IDS = {
    caA: "fixture-a6-bridge-ca-a",
    amA: "fixture-a6-bridge-am-a",
    caB: "fixture-a6-bridge-ca-b",
    amB: "fixture-a6-bridge-am-b",
    ca: "fixture-a6-upgrade-ca",
    am: "fixture-a6-upgrade-am",
  };

  beforeAll(async () => {
    await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
    await prisma.company.create({
      data: { id: COMPANY_ID, name: "A6 Bridge Identity Fixture", tenantKind: "EVALUATION" },
    });
    for (const [key, id] of Object.entries(DOC_IDS)) {
      await prisma.document.create({
        data: {
          id,
          companyId: COMPANY_ID,
          name: key,
          type: key.startsWith("am") ? "AMENDMENT" : "CREDIT_AGREEMENT",
          typeConfirmedByUser: false,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  });

  it("persistence does not assign instrumentId from provisional associations or bridge merges", async () => {
    const classifications = [
      cls(DOC_IDS.caA, "CREDIT_AGREEMENT"),
      cls(DOC_IDS.amA, "AMENDMENT"),
      cls(DOC_IDS.caB, "CREDIT_AGREEMENT"),
      cls(DOC_IDS.amB, "AMENDMENT"),
    ];
    const rels = [
      trustedAmends(DOC_IDS.amA, DOC_IDS.caA),
      trustedAmends(DOC_IDS.amB, DOC_IDS.caB),
      provisionalAmends(DOC_IDS.amA, DOC_IDS.caB),
    ];
    const instruments = groupPackageIntoInstruments(
      [DOC_IDS.caA, DOC_IDS.amA, DOC_IDS.caB, DOC_IDS.amB],
      classifications,
      [],
      rels,
    );
    await persistPackageGraph(COMPANY_ID, graphFrom(instruments, rels, classifications));

    const docs = await prisma.document.findMany({
      where: { id: { in: [DOC_IDS.caA, DOC_IDS.amA, DOC_IDS.caB, DOC_IDS.amB] } },
      select: { id: true, instrumentId: true },
    });
    const byId = new Map(docs.map((d) => [d.id, d.instrumentId]));
    expect(byId.get(DOC_IDS.caA)).toBeTruthy();
    expect(byId.get(DOC_IDS.amA)).toBe(byId.get(DOC_IDS.caA));
    expect(byId.get(DOC_IDS.caB)).toBeTruthy();
    expect(byId.get(DOC_IDS.amB)).toBe(byId.get(DOC_IDS.caB));
    expect(byId.get(DOC_IDS.caA)).not.toBe(byId.get(DOC_IDS.caB));
  });

  it("upgrade then reject: membership transitions and stale instrumentId is cleared", async () => {
    const classifications = [cls(DOC_IDS.ca, "CREDIT_AGREEMENT"), cls(DOC_IDS.am, "AMENDMENT")];

    // 1) Provisional only — amendment keeps its own singleton instrumentId.
    const provRels = [provisionalAmends(DOC_IDS.am, DOC_IDS.ca)];
    const provInstruments = groupPackageIntoInstruments(
      [DOC_IDS.ca, DOC_IDS.am],
      classifications,
      [],
      provRels,
    );
    await persistPackageGraph(COMPANY_ID, graphFrom(provInstruments, provRels, classifications));
    let am = await prisma.document.findUnique({ where: { id: DOC_IDS.am } });
    let ca = await prisma.document.findUnique({ where: { id: DOC_IDS.ca } });
    expect(ca!.instrumentId).toBeTruthy();
    expect(am!.instrumentId).toBeTruthy();
    expect(am!.instrumentId).not.toBe(ca!.instrumentId);
    const caInstrumentId = ca!.instrumentId!;
    const amSingletonId = am!.instrumentId!;

    // Simulate prior bug: provisional wrongly assigned to parent.
    await prisma.document.update({ where: { id: DOC_IDS.am }, data: { instrumentId: caInstrumentId } });
    await persistPackageGraph(COMPANY_ID, graphFrom(provInstruments, provRels, classifications));
    am = await prisma.document.findUnique({ where: { id: DOC_IDS.am } });
    // Replay must restore singleton identity — not leave stale parent membership.
    expect(am!.instrumentId).not.toBe(caInstrumentId);
    expect(am!.instrumentId).toBeTruthy();

    // 2) Upgrade to trusted — amendment joins CA instrument; orphan singleton removed.
    const trustedRels = [trustedAmends(DOC_IDS.am, DOC_IDS.ca)];
    const trustedInstruments = groupPackageIntoInstruments(
      [DOC_IDS.ca, DOC_IDS.am],
      classifications,
      [],
      trustedRels,
    );
    await persistPackageGraph(COMPANY_ID, graphFrom(trustedInstruments, trustedRels, classifications));
    am = await prisma.document.findUnique({ where: { id: DOC_IDS.am } });
    ca = await prisma.document.findUnique({ where: { id: DOC_IDS.ca } });
    expect(am!.instrumentId).toBe(ca!.instrumentId);
    expect(am!.instrumentId).toBe(caInstrumentId);
    const orphan = await prisma.debtInstrument.findUnique({ where: { id: amSingletonId } });
    expect(orphan).toBeNull();

    // 3) Reject / remove membership edge — amendment must not keep CA instrumentId.
    const none: RelationshipCandidate[] = [];
    const split = groupPackageIntoInstruments([DOC_IDS.ca, DOC_IDS.am], classifications, [], none);
    await persistPackageGraph(COMPANY_ID, graphFrom(split, none, classifications));
    am = await prisma.document.findUnique({ where: { id: DOC_IDS.am } });
    ca = await prisma.document.findUnique({ where: { id: DOC_IDS.ca } });
    expect(ca!.instrumentId).toBe(caInstrumentId);
    expect(am!.instrumentId).toBeTruthy();
    expect(am!.instrumentId).not.toBe(ca!.instrumentId);
  });
});
