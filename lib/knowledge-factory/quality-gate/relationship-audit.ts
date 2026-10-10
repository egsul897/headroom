/**
 * Independent relationship-edge audit (read-only).
 * Scores sampled KnowledgeRelationshipEdge rows for precision / unsupported /
 * missing / duplicate amplification. Does not mutate Neon.
 */

import { createHash } from "node:crypto";
import { prisma } from "../../prisma";

export type EdgeVerdict =
  | "SUPPORTED"
  | "WEAK_SUPPORT"
  | "UNSUPPORTED"
  | "DUPLICATE"
  | "SELF_LOOP"
  | "CROSS_ISSUER"
  | "CHRONOLOGY_SUSPECT"
  | "MISSING_ENDPOINT";

export interface AuditedEdge {
  edgeId: string;
  kind: string;
  evidenceStatus: string;
  confidence: number;
  fromSourceId: string;
  toSourceId: string;
  fromTitle: string;
  toTitle: string;
  fromClass: string;
  toClass: string;
  fromTicker: string | null;
  toTicker: string | null;
  fromCik: string;
  toCik: string;
  fromFilingDate: string;
  toFilingDate: string;
  rationale: string;
  verdict: EdgeVerdict;
  reasons: string[];
}

export interface RelationshipAuditReport {
  schema: "kf-relationship-audit.v1";
  generatedAt: string;
  readOnly: true;
  population: {
    totalEdges: number;
    byKind: Record<string, number>;
    byEvidenceStatus: Record<string, number>;
    continuousExpandTouchedEdges: number;
  };
  sampling: {
    perKind: number;
    sampled: number;
    seed: string;
  };
  verdicts: Record<EdgeVerdict, number>;
  precisionEstimate: {
    /** (SUPPORTED + WEAK_SUPPORT) / sampled excluding DUPLICATE */
    supportedOrWeakRate: number;
    unsupportedRate: number;
    note: string;
  };
  duplicateAmplification: {
    exactTripleDuplicates: number;
    discoveryIdCollisions: number;
    sameEndpointsMultiKind: number;
    note: string;
  };
  missingRelationshipHints: Array<{
    issuerCik: string;
    ticker: string | null;
    hint: string;
  }>;
  samples: AuditedEdge[];
}

const AMENDMENT_KINDS = new Set([
  "AGREEMENT_AMENDMENT",
  "AGREEMENT_RESTATEMENT",
  "INDENTURE_SUPPLEMENTAL",
  "AGREEMENT_WAIVER",
  "AGREEMENT_CONSENT",
  "AGREEMENT_SIDE_LETTER",
  "AGREEMENT_INTERCREDITOR",
]);

const PROVISION_KINDS = new Set([
  "PROVISION_DEFINITION",
  "PROVISION_CROSS_REFERENCE",
  "PROVISION_EXCEPTION",
  "PROVISION_CONDITION",
  "PROVISION_SHARED_CAPACITY",
]);

function padCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

function titleRelated(a: string, b: string): boolean {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 3),
    );
  const A = tokens(a);
  const B = tokens(b);
  let n = 0;
  for (const t of A) if (B.has(t)) n += 1;
  if (/\bcredit\b/i.test(a) && /\bcredit\b/i.test(b)) n += 1;
  if (/\bindenture\b/i.test(a) && /\bindenture\b/i.test(b)) n += 1;
  return n >= 1;
}

function scoreEdge(params: {
  kind: string;
  from: {
    sourceId: string;
    title: string;
    documentClass: string;
    issuerCik: string;
    issuerTicker: string | null;
    filingDate: Date;
  };
  to: {
    sourceId: string;
    title: string;
    documentClass: string;
    issuerCik: string;
    issuerTicker: string | null;
    filingDate: Date;
  };
  rationale: string;
}): { verdict: EdgeVerdict; reasons: string[] } {
  const reasons: string[] = [];
  if (params.from.sourceId === params.to.sourceId) {
    return { verdict: "SELF_LOOP", reasons: ["source and target are the same document"] };
  }
  if (padCik(params.from.issuerCik) !== padCik(params.to.issuerCik)) {
    // Provision edges may legitimately point within same doc metadata using sourceId aliases —
    // but document-family edges must share issuer.
    if (AMENDMENT_KINDS.has(params.kind)) {
      return {
        verdict: "CROSS_ISSUER",
        reasons: [
          `issuer mismatch ${params.from.issuerCik} vs ${params.to.issuerCik}`,
        ],
      };
    }
    reasons.push("cross-issuer provision edge — inspect carefully");
  }

  if (AMENDMENT_KINDS.has(params.kind)) {
    const related = titleRelated(params.from.title, params.to.title);
    if (!related) {
      reasons.push("weak/no title family overlap for amendment-family edge");
    }
    const fromT = params.from.filingDate.getTime();
    const toT = params.to.filingDate.getTime();
    // Amendment (from) should generally be later than or near base (to)
    if (
      (params.kind === "AGREEMENT_AMENDMENT" ||
        params.kind === "AGREEMENT_RESTATEMENT" ||
        params.kind === "INDENTURE_SUPPLEMENTAL") &&
      fromT &&
      toT &&
      fromT + 1000 * 60 * 60 * 24 * 30 < toT
    ) {
      // amendment filed >30d before base — chronology suspect
      return {
        verdict: "CHRONOLOGY_SUSPECT",
        reasons: [
          ...reasons,
          `amendment/supplement filing ${params.from.filingDate.toISOString().slice(0, 10)} precedes base ${params.to.filingDate.toISOString().slice(0, 10)} by >30d`,
        ],
      };
    }
    if (!related && reasons.length) {
      return { verdict: "UNSUPPORTED", reasons };
    }
    if (!related) {
      return { verdict: "WEAK_SUPPORT", reasons: ["metadata class pairing only; title overlap weak"] };
    }
    return {
      verdict: "SUPPORTED",
      reasons: ["same issuer", "title/family overlap", "kind-consistent pairing"],
    };
  }

  if (PROVISION_KINDS.has(params.kind)) {
    if (!params.rationale || params.rationale.length < 12) {
      return { verdict: "WEAK_SUPPORT", reasons: ["thin rationale for provision edge"] };
    }
    // Same-document provision edges are normal (definition/xref within one agreement)
    if (params.from.sourceId === params.to.sourceId || padCik(params.from.issuerCik) === padCik(params.to.issuerCik)) {
      return {
        verdict: "SUPPORTED",
        reasons: ["same issuer/document family for provision linkage", "rationale present"],
      };
    }
    return { verdict: "UNSUPPORTED", reasons: ["provision edge spans unrelated issuers"] };
  }

  return { verdict: "WEAK_SUPPORT", reasons: ["unclassified kind — manual review"] };
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleIndices(n: number, k: number, rnd: () => number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx.slice(0, Math.min(k, n));
}

export async function runRelationshipAudit(params?: {
  perKind?: number;
  seed?: string;
}): Promise<RelationshipAuditReport> {
  const perKind = params?.perKind ?? 25;
  const seed = params?.seed ?? "kf-rel-audit-2026-10-09";
  const seedNum = Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
  const rnd = mulberry32(seedNum);

  const totalEdges = await prisma.knowledgeRelationshipEdge.count();
  const byKindRows = await prisma.knowledgeRelationshipEdge.groupBy({
    by: ["kind"],
    _count: true,
  });
  const byEvidenceRows = await prisma.knowledgeRelationshipEdge.groupBy({
    by: ["evidenceStatus"],
    _count: true,
  });
  const byKind = Object.fromEntries(byKindRows.map((r) => [r.kind, r._count]));
  const byEvidenceStatus = Object.fromEntries(byEvidenceRows.map((r) => [r.evidenceStatus, r._count]));

  const continuousSources = await prisma.knowledgeSource.findMany({
    where: { provenance: "sec-edgar-continuous-expand" },
    select: { id: true, sourceId: true },
  });
  const continuousIds = new Set(continuousSources.map((s) => s.id));
  const continuousSourceIds = new Set(continuousSources.map((s) => s.sourceId));

  let continuousExpandTouchedEdges = 0;
  if (continuousIds.size) {
    continuousExpandTouchedEdges = await prisma.knowledgeRelationshipEdge.count({
      where: {
        OR: [
          { sourceRecordId: { in: [...continuousIds] } },
          { targetSourceId: { in: [...continuousSourceIds] } },
        ],
      },
    });
  }

  // Duplicate amplification — lean columns only (avoid metadata JSON decode failures).
  const allEdgesLite = await prisma.knowledgeRelationshipEdge.findMany({
    select: {
      sourceRecordId: true,
      targetSourceId: true,
      kind: true,
    },
  });
  const triple = new Map<string, number>();
  const endpoints = new Map<string, Set<string>>();
  for (const e of allEdgesLite) {
    const tKey = `${e.sourceRecordId}|${e.targetSourceId}|${e.kind}`;
    triple.set(tKey, (triple.get(tKey) ?? 0) + 1);
    const ep = `${e.sourceRecordId}|${e.targetSourceId}`;
    const set = endpoints.get(ep) ?? new Set();
    set.add(e.kind);
    endpoints.set(ep, set);
  }
  const exactTripleDuplicates = [...triple.values()].filter((n) => n > 1).reduce((a, b) => a + (b - 1), 0);
  // discoveryId collision count deferred — metadata JSON on large edge sets can exceed napi limits
  const discoveryIdCollisions = -1;
  const sameEndpointsMultiKind = [...endpoints.values()].filter((s) => s.size > 1).length;

  const kindsToSample = [
    ...AMENDMENT_KINDS,
    ...PROVISION_KINDS,
  ].filter((k) => (byKind[k] ?? 0) > 0);

  const samples: AuditedEdge[] = [];
  const verdicts: Record<EdgeVerdict, number> = {
    SUPPORTED: 0,
    WEAK_SUPPORT: 0,
    UNSUPPORTED: 0,
    DUPLICATE: 0,
    SELF_LOOP: 0,
    CROSS_ISSUER: 0,
    CHRONOLOGY_SUSPECT: 0,
    MISSING_ENDPOINT: 0,
  };

  const sourceSelect = {
    id: true,
    sourceId: true,
    documentTitle: true,
    documentClass: true,
    issuerCik: true,
    issuerTicker: true,
    filingDate: true,
  } as const;

  for (const kind of kindsToSample) {
    // Lean select only — full edge rows / metadata JSON can exceed napi string limits.
    const pool = await prisma.knowledgeRelationshipEdge.findMany({
      where: { kind: kind as never },
      take: 400,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        evidenceStatus: true,
        confidence: true,
        rationale: true,
        sourceRecordId: true,
        targetSourceId: true,
      },
    });
    const picks = sampleIndices(pool.length, perKind, rnd).map((i) => pool[i]!);
    const sourceRecordIds = [...new Set(picks.map((p) => p.sourceRecordId))];
    const targetIds = [...new Set(picks.map((p) => p.targetSourceId))];
    const fromRows = await prisma.knowledgeSource.findMany({
      where: { id: { in: sourceRecordIds } },
      select: sourceSelect,
    });
    const targets = await prisma.knowledgeSource.findMany({
      where: { sourceId: { in: targetIds } },
      select: sourceSelect,
    });
    const fromByPk = new Map(fromRows.map((t) => [t.id, t]));
    const targetById = new Map(targets.map((t) => [t.sourceId, t]));

    for (const edge of picks) {
      const from = fromByPk.get(edge.sourceRecordId);
      const to = targetById.get(edge.targetSourceId);
      const rationaleSafe = (() => {
        try {
          return String(edge.rationale ?? "").slice(0, 300);
        } catch {
          return "";
        }
      })();
      if (!from || !to) {
        const audited: AuditedEdge = {
          edgeId: edge.id,
          kind: edge.kind,
          evidenceStatus: edge.evidenceStatus,
          confidence: edge.confidence,
          fromSourceId: from?.sourceId ?? "(missing)",
          toSourceId: edge.targetSourceId,
          fromTitle: from?.documentTitle ?? "",
          toTitle: to?.documentTitle ?? "",
          fromClass: from?.documentClass ?? "",
          toClass: to?.documentClass ?? "",
          fromTicker: from?.issuerTicker ?? null,
          toTicker: to?.issuerTicker ?? null,
          fromCik: from?.issuerCik ?? "",
          toCik: to?.issuerCik ?? "",
          fromFilingDate: from?.filingDate?.toISOString().slice(0, 10) ?? "",
          toFilingDate: to?.filingDate?.toISOString().slice(0, 10) ?? "",
          rationale: rationaleSafe,
          verdict: "MISSING_ENDPOINT",
          reasons: ["endpoint KnowledgeSource row missing"],
        };
        samples.push(audited);
        verdicts.MISSING_ENDPOINT += 1;
        continue;
      }

      const tKey = `${edge.sourceRecordId}|${edge.targetSourceId}|${edge.kind}`;
      if ((triple.get(tKey) ?? 0) > 1) {
        const audited: AuditedEdge = {
          edgeId: edge.id,
          kind: edge.kind,
          evidenceStatus: edge.evidenceStatus,
          confidence: edge.confidence,
          fromSourceId: from.sourceId,
          toSourceId: to.sourceId,
          fromTitle: from.documentTitle,
          toTitle: to.documentTitle,
          fromClass: from.documentClass,
          toClass: to.documentClass,
          fromTicker: from.issuerTicker,
          toTicker: to.issuerTicker,
          fromCik: from.issuerCik,
          toCik: to.issuerCik,
          fromFilingDate: from.filingDate.toISOString().slice(0, 10),
          toFilingDate: to.filingDate.toISOString().slice(0, 10),
          rationale: rationaleSafe,
          verdict: "DUPLICATE",
          reasons: [`exact triple duplicated ${(triple.get(tKey) ?? 0)} times`],
        };
        samples.push(audited);
        verdicts.DUPLICATE += 1;
        continue;
      }

      const scored = scoreEdge({
        kind: edge.kind,
        from: {
          sourceId: from.sourceId,
          title: from.documentTitle,
          documentClass: from.documentClass,
          issuerCik: from.issuerCik,
          issuerTicker: from.issuerTicker,
          filingDate: from.filingDate,
        },
        to: {
          sourceId: to.sourceId,
          title: to.documentTitle,
          documentClass: to.documentClass,
          issuerCik: to.issuerCik,
          issuerTicker: to.issuerTicker,
          filingDate: to.filingDate,
        },
        rationale: rationaleSafe,
      });
      const audited: AuditedEdge = {
        edgeId: edge.id,
        kind: edge.kind,
        evidenceStatus: edge.evidenceStatus,
        confidence: edge.confidence,
        fromSourceId: from.sourceId,
        toSourceId: to.sourceId,
        fromTitle: from.documentTitle,
        toTitle: to.documentTitle,
        fromClass: from.documentClass,
        toClass: to.documentClass,
        fromTicker: from.issuerTicker,
        toTicker: to.issuerTicker,
        fromCik: from.issuerCik,
        toCik: to.issuerCik,
        fromFilingDate: from.filingDate.toISOString().slice(0, 10),
        toFilingDate: to.filingDate.toISOString().slice(0, 10),
        rationale: rationaleSafe,
        verdict: scored.verdict,
        reasons: scored.reasons,
      };
      samples.push(audited);
      verdicts[scored.verdict] += 1;
    }
  }

  // Missing relationship hints: issuers with both base + amendment but no amendment edge
  const missingRelationshipHints: RelationshipAuditReport["missingRelationshipHints"] = [];
  const issuers = await prisma.knowledgeSource.groupBy({
    by: ["issuerCik"],
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" },
    _count: true,
  });
  const busy = issuers.filter((i) => i._count >= 3).slice(0, 40);
  for (const iss of busy) {
    const docs = await prisma.knowledgeSource.findMany({
      where: { issuerCik: iss.issuerCik, usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" },
      select: {
        id: true,
        sourceId: true,
        documentClass: true,
        documentTitle: true,
        issuerTicker: true,
      },
    });
    const hasBase = docs.some((d) =>
      ["CREDIT_AGREEMENT", "INDENTURE", "RESTATEMENT", "TERM_LOAN_AGREEMENT", "ABL_AGREEMENT"].includes(
        d.documentClass,
      ),
    );
    const hasAmd = docs.some((d) =>
      ["AMENDMENT", "SUPPLEMENTAL_INDENTURE", "RESTATEMENT"].includes(d.documentClass),
    );
    if (!hasBase || !hasAmd) continue;
    const ids = docs.map((d) => d.id);
    const sourceIds = new Set(docs.map((d) => d.sourceId));
    const edgeCount = await prisma.knowledgeRelationshipEdge.count({
      where: {
        sourceRecordId: { in: ids },
        kind: {
          in: [
            "AGREEMENT_AMENDMENT",
            "AGREEMENT_RESTATEMENT",
            "INDENTURE_SUPPLEMENTAL",
          ] as never,
        },
        targetSourceId: { in: [...sourceIds] },
      },
    });
    if (edgeCount === 0) {
      missingRelationshipHints.push({
        issuerCik: iss.issuerCik,
        ticker: docs[0]?.issuerTicker ?? null,
        hint: "Issuer has base + amendment/supplement classes but zero amendment-family edges between them",
      });
    }
    if (missingRelationshipHints.length >= 12) break;
  }

  const scoredN =
    samples.length - verdicts.DUPLICATE; // duplicates excluded from precision denom optionally
  const supportedLike = verdicts.SUPPORTED + verdicts.WEAK_SUPPORT;
  const unsupportedLike =
    verdicts.UNSUPPORTED +
    verdicts.CROSS_ISSUER +
    verdicts.CHRONOLOGY_SUSPECT +
    verdicts.SELF_LOOP +
    verdicts.MISSING_ENDPOINT;

  return {
    schema: "kf-relationship-audit.v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    population: {
      totalEdges,
      byKind,
      byEvidenceStatus,
      continuousExpandTouchedEdges,
    },
    sampling: { perKind, sampled: samples.length, seed },
    verdicts,
    precisionEstimate: {
      supportedOrWeakRate: scoredN ? supportedLike / scoredN : 0,
      unsupportedRate: scoredN ? unsupportedLike / scoredN : 0,
      note: "Independent heuristic audit — not a legal certification of edge correctness. WEAK_SUPPORT counted toward supportedOrWeakRate.",
    },
    duplicateAmplification: {
      exactTripleDuplicates,
      discoveryIdCollisions,
      sameEndpointsMultiKind,
      note: "Exact triple = (sourceRecordId, targetSourceId, kind). Multi-kind on same endpoints may be legitimate. discoveryIdCollisions=-1 means skipped (metadata JSON not loaded for safety).",
    },
    missingRelationshipHints,
    samples,
  };
}
