/**
 * Amendment-aware package analysis using existing relationship discovery.
 * Surfaces unresolved precedence instead of silently selecting a version.
 */

import type { KnowledgeRelationshipRecord, KnowledgeSourceRecord } from "../../knowledge-factory/types";

export interface ProvisionChangeSignal {
  kind: "AMENDED" | "REPLACED" | "DELETED" | "ADDED" | "UNRESOLVED";
  evidence: string;
  fromSourceId?: string;
  toSourceId?: string;
}

export interface AmendmentPackageView {
  schemaVersion: "product.amendment-package.v1";
  companyId: string;
  generatedAt: string;
  baseCandidates: Array<{ sourceId: string; title: string; documentClass: string }>;
  amendmentDocuments: Array<{ sourceId: string; title: string; documentClass: string }>;
  amendmentEdges: Array<{
    fromSourceId: string;
    toSourceId: string;
    kind: string;
    evidenceStatus: string;
    note: string;
  }>;
  provisionChangeSignals: ProvisionChangeSignal[];
  operativeResolution: "RESOLVED" | "UNRESOLVED_PRECEDENCE" | "SINGLE_DOCUMENT" | "NO_DOCUMENTS";
  unresolvedReasons: string[];
  askGuidance: string;
  note: string;
}

const BASE_CLASSES = new Set([
  "CREDIT_AGREEMENT",
  "INDENTURE",
  "RESTATEMENT",
  "ABL_AGREEMENT",
  "TERM_LOAN_AGREEMENT",
  "REVOLVING_CREDIT_AGREEMENT",
]);

const AMENDMENT_CLASSES = new Set([
  "AMENDMENT",
  "SUPPLEMENTAL_INDENTURE",
  "WAIVER",
  "CONSENT",
  "RESTATEMENT",
]);

function inferChangeSignals(
  sources: KnowledgeSourceRecord[],
  edges: AmendmentPackageView["amendmentEdges"],
): ProvisionChangeSignal[] {
  const signals: ProvisionChangeSignal[] = [];
  const amendments = sources.filter((s) => AMENDMENT_CLASSES.has(s.documentClass));
  for (const a of amendments) {
    const title = (a.documentTitle || a.exhibitFilename || "").toLowerCase();
    if (/\brestate|\bamended and restated\b/.test(title)) {
      signals.push({
        kind: "REPLACED",
        evidence: `Document title suggests restatement/replacement: ${a.documentTitle}`,
        toSourceId: a.sourceId,
      });
    } else if (/\bamend/.test(title) || a.documentClass === "AMENDMENT") {
      signals.push({
        kind: "AMENDED",
        evidence: `Amendment document present: ${a.documentTitle || a.exhibitFilename}`,
        toSourceId: a.sourceId,
      });
    } else if (/\bwaiver\b/.test(title) || a.documentClass === "WAIVER") {
      signals.push({
        kind: "UNRESOLVED",
        evidence: `Waiver present — effect on operative language not auto-resolved: ${a.documentTitle}`,
        toSourceId: a.sourceId,
      });
    }
  }
  for (const e of edges) {
    if (e.kind === "AGREEMENT_RESTATEMENT") {
      signals.push({
        kind: "REPLACED",
        evidence: `Discovered restatement edge (${e.evidenceStatus})`,
        fromSourceId: e.fromSourceId,
        toSourceId: e.toSourceId,
      });
    } else if (e.kind === "AGREEMENT_AMENDMENT") {
      signals.push({
        kind: "AMENDED",
        evidence: `Discovered amendment edge (${e.evidenceStatus})`,
        fromSourceId: e.fromSourceId,
        toSourceId: e.toSourceId,
      });
    }
  }
  if (signals.length === 0 && sources.length > 1) {
    signals.push({
      kind: "UNRESOLVED",
      evidence:
        "Multiple documents uploaded without clear amend/replace/delete signals — precedence unresolved.",
    });
  }
  return signals;
}

export function analyzeAmendmentPackage(params: {
  companyId: string;
  sources: KnowledgeSourceRecord[];
  relationships: KnowledgeRelationshipRecord[];
}): AmendmentPackageView {
  const sources = [...params.sources].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const bases = sources.filter((s) => BASE_CLASSES.has(s.documentClass));
  const amendmentDocs = sources.filter(
    (s) => AMENDMENT_CLASSES.has(s.documentClass) && s.documentClass !== "RESTATEMENT",
  );
  const edges = params.relationships
    .filter(
      (r) =>
        r.kind === "AGREEMENT_AMENDMENT" ||
        r.kind === "AGREEMENT_RESTATEMENT" ||
        r.kind === "INDENTURE_SUPPLEMENTAL",
    )
    .map((r) => ({
      fromSourceId: r.sourceId,
      toSourceId: r.targetId,
      kind: r.kind,
      evidenceStatus: r.evidenceStatus,
      note: r.rationale || "Discovered relationship — not a determination of legal effectiveness.",
    }));

  const unresolvedReasons: string[] = [];
  let operativeResolution: AmendmentPackageView["operativeResolution"];

  if (sources.length === 0) {
    operativeResolution = "NO_DOCUMENTS";
    unresolvedReasons.push("No customer documents analyzed yet.");
  } else if (sources.length === 1) {
    operativeResolution = "SINGLE_DOCUMENT";
  } else if (bases.length === 0) {
    operativeResolution = "UNRESOLVED_PRECEDENCE";
    unresolvedReasons.push("No clear base credit agreement / indenture identified among uploads.");
  } else if (bases.length > 1 && edges.length === 0) {
    operativeResolution = "UNRESOLVED_PRECEDENCE";
    unresolvedReasons.push(
      "Multiple base-like documents present without discovered amendment/restatement edges.",
    );
  } else if (edges.some((e) => e.evidenceStatus === "DISCOVERED") || amendmentDocs.length > 0) {
    operativeResolution = "UNRESOLVED_PRECEDENCE";
    unresolvedReasons.push(
      "Amendment relationships require legal review — Headroom will not silently select operative language.",
    );
  } else {
    operativeResolution = "RESOLVED";
  }

  const provisionChangeSignals = inferChangeSignals(sources, edges);
  const askGuidance =
    operativeResolution === "UNRESOLVED_PRECEDENCE"
      ? "Ask Headroom will cite retrieved excerpts and label amendment precedence as unresolved. Historical language is not treated as operative authority."
      : operativeResolution === "SINGLE_DOCUMENT"
        ? "Ask Headroom answers against the single analyzed document; upload amendments to enable package-aware precedence analysis."
        : "Ask Headroom distinguishes package documents when evidence supports it; unresolved gaps are surfaced rather than filled.";

  return {
    schemaVersion: "product.amendment-package.v1",
    companyId: params.companyId,
    generatedAt: new Date().toISOString(),
    baseCandidates: bases.map((b) => ({
      sourceId: b.sourceId,
      title: b.documentTitle,
      documentClass: b.documentClass,
    })),
    amendmentDocuments: amendmentDocs.map((a) => ({
      sourceId: a.sourceId,
      title: a.documentTitle,
      documentClass: a.documentClass,
    })),
    amendmentEdges: edges,
    provisionChangeSignals,
    operativeResolution,
    unresolvedReasons,
    askGuidance,
    note: "PRECEDENT ≠ OPERATIVE AUTHORITY. Customer package analysis does not import research corpus language as governing text. Prior versions and provenance are preserved via KnowledgeSource rows.",
  };
}
