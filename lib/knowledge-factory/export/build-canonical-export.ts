/**
 * Build the canonical read-only consumer export from the local corpus store.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { STRUCTURAL_INDEX_VERSION } from "../../contract-model/compiler/types";
import { KNOWLEDGE_FACTORY_VERSION } from "../types";
import type { CorpusStore } from "../store/corpus-store";
import { isFinancingDoc, isFixtureDoc } from "../corpus/financing-filter";
import { buildSourceInventory } from "../preservation/inventory";
import {
  CONSUMER_EXPORT_KIND,
  CONSUMER_EXPORT_SAFETY,
  CONSUMER_EXPORT_SCHEMA_VERSION,
  type CanonicalConsumerExport,
  type ConsumerConditionException,
  type ConsumerCovenantCandidate,
  type ConsumerDefinition,
  type ConsumerDependencyEdge,
  type ConsumerStructuralNode,
  type ConsumerUncertaintyRecord,
} from "./consumer-contract";

function shaJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

export interface BuildExportOptions {
  /** When true, omit bulky heading/excerpt bodies (still identity-complete). */
  compact?: boolean;
  durabilityClaim?: CanonicalConsumerExport["durabilityClaim"];
}

export function buildCanonicalConsumerExport(
  store: CorpusStore,
  opts: BuildExportOptions = {},
): CanonicalConsumerExport {
  const compact = opts.compact ?? true;
  const inventory = buildSourceInventory(store);
  const byId = new Map(inventory.sources.map((s) => [s.sourceId, s]));

  const financing = store.listSources().filter(isFinancingDoc);
  const fixtures = store.listSources().filter(isFixtureDoc);
  const included = [...financing, ...fixtures].sort((a, b) => a.sourceId.localeCompare(b.sourceId));

  const structuralNodes: ConsumerStructuralNode[] = [];
  const covenantCandidates: ConsumerCovenantCandidate[] = [];
  const definitions: ConsumerDefinition[] = [];
  const dependencyEdges: ConsumerDependencyEdge[] = [];
  const conditionExceptionRecords: ConsumerConditionException[] = [];
  const instruments = new Set<string>();

  for (const s of included) {
    if (s.instrumentIdentity) instruments.add(s.instrumentIdentity);
    for (const n of store.loadStructuralNodes(s.sourceId)) {
      structuralNodes.push({
        nodeId: n.nodeId,
        sourceId: n.sourceId,
        nodeType: n.nodeType,
        sectionRef: n.sectionRef,
        heading: compact ? truncate(n.heading ?? "", 160) : n.heading,
        charStart: n.charStart,
        charEnd: n.charEnd,
        parentNodeId: n.parentNodeId,
        ambiguous: n.ambiguous,
      });
    }
    for (const c of store.loadCandidates(s.sourceId)) {
      covenantCandidates.push({
        candidateId: c.candidateId,
        sourceId: c.sourceId,
        nodeId: c.nodeId,
        families: c.families,
        signals: c.signals,
        excerpt: compact ? truncate(c.excerpt ?? "", 240) : c.excerpt,
        representationLevel: c.representationLevel,
        discoveryScore: c.discoveryScore,
      });
    }
    for (const d of store.loadDefinitions(s.sourceId)) {
      definitions.push({
        term: d.term,
        sourceId: d.sourceId,
        nodeId: d.nodeId,
        charStart: d.charStart,
        charEnd: d.charEnd,
        excerpt: compact ? truncate(d.excerpt ?? "", 400) : d.excerpt,
      });
    }
    for (const e of store.loadCrossReferences(s.sourceId)) {
      dependencyEdges.push({
        edgeId: `xref:${e.sourceId}:${e.charStart}:${e.charEnd}`,
        sourceId: e.sourceId,
        fromNodeId: e.fromNodeId,
        rawReference: e.rawReference,
        charStart: e.charStart,
        charEnd: e.charEnd,
        kind: "PROVISION_CROSS_REFERENCE",
        resolution: "UNRESOLVED",
        legalTruth: false,
      });
    }
    for (const row of store.loadConditions(s.sourceId)) {
      conditionExceptionRecords.push({
        id: row.id,
        sourceId: row.sourceId,
        kind: row.kind,
        nodeId: row.nodeId,
        charStart: row.charStart,
        charEnd: row.charEnd,
        excerpt: compact ? truncate(row.excerpt ?? "", 200) : row.excerpt,
        signals: row.signals,
        representationLevel: row.representationLevel,
      });
    }
  }

  const documentRelationships = store.loadRelationships().map((r) => ({
    id: r.id,
    sourceId: r.sourceId,
    targetId: r.targetId,
    kind: r.kind,
    evidenceStatus: r.evidenceStatus,
    rationale: r.rationale,
    confidence: r.confidence,
  }));

  const rawUncertainty = (store.readJson("uncertainty-queue.json") as ConsumerUncertaintyRecord[] | null) ?? [];
  const unresolvedUncertainties = rawUncertainty.map((u, i) => ({
    ...u,
    id: typeof u.id === "string" ? u.id : `uncertainty:${i}`,
  }));

  const sources = included.map((s) => {
    const inv = byId.get(s.sourceId)!;
    return {
      sourceId: s.sourceId,
      accessionNumber: s.accessionNumber,
      exhibitFilename: s.exhibitFilename,
      issuerCik: s.issuerCik,
      issuerTicker: s.issuerTicker,
      issuerName: s.issuerName,
      instrumentIdentity: s.instrumentIdentity,
      sourceUrl: s.sourceUrl,
      filingDate: s.filingDate,
      formType: s.formType,
      documentTitle: s.documentTitle,
      documentClass: s.documentClass,
      originalBytesHash: s.originalBytesHash,
      normalizedTextHash: s.normalizedTextHash,
      acquisitionTimestamp: s.acquisitionTimestamp,
      parserVersion: s.parserVersion || KNOWLEDGE_FACTORY_VERSION,
      structuralParserVersion: STRUCTURAL_INDEX_VERSION,
      representationLevel: s.representationLevel,
      provenance: s.provenance,
      usageRightsReviewStatus: s.usageRightsReviewStatus,
      corpusRole: inv.corpusRole,
      aliases: inv.aliases,
    };
  });

  const sliceDigests = {
    sources: shaJson(sources.map((s) => s.sourceId).sort()),
    structuralNodes: shaJson(structuralNodes.map((n) => n.nodeId).sort()),
    covenantCandidates: shaJson(covenantCandidates.map((c) => c.candidateId).sort()),
    definitions: shaJson(definitions.map((d) => `${d.sourceId}|${d.term}|${d.charStart}`).sort()),
    dependencyEdges: shaJson(dependencyEdges.map((e) => e.edgeId).sort()),
    conditionExceptionRecords: shaJson(conditionExceptionRecords.map((c) => c.id).sort()),
    documentRelationships: shaJson(documentRelationships.map((r) => r.id).sort()),
  };

  const sourceVersionId = createHash("sha256")
    .update(
      [
        CONSUMER_EXPORT_SCHEMA_VERSION,
        KNOWLEDGE_FACTORY_VERSION,
        STRUCTURAL_INDEX_VERSION,
        ...Object.values(sliceDigests),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 32);

  const idempotencyKey = createHash("sha256")
    .update(sources.map((s) => `${s.sourceId}:${s.originalBytesHash}`).sort().join("\n"))
    .digest("hex");

  return {
    schemaVersion: CONSUMER_EXPORT_SCHEMA_VERSION,
    exportKind: CONSUMER_EXPORT_KIND,
    generatedAt: new Date().toISOString(),
    producer: "WS-CKF",
    knowledgeFactoryVersion: KNOWLEDGE_FACTORY_VERSION,
    structuralParserVersion: STRUCTURAL_INDEX_VERSION,
    sourceVersionId: `srcver:${sourceVersionId}`,
    idempotencyKey,
    durabilityClaim: opts.durabilityClaim ?? "NONE",
    safety: CONSUMER_EXPORT_SAFETY,
    peerCoordination: {
      consumers: [
        "EDGAR Historical Backfill",
        "Vercel-Independent Compilation",
        "Definition Encyclopedia",
        "Dependency Atlas",
        "Basket Formula Library",
        "Negative Covenant Exception Database",
        "Financial Definitions Precedent",
        "Amendment Chain Research",
      ],
      notes: [
        "Upsert by sourceId / nodeId / edgeId / candidateId; never invent parallel source registries.",
        "representationLevel and legalTruth are discovery-only; consumers must not auto-promote.",
        "Fixtures remain corpusRole=FIXTURE and usageRightsReviewStatus=FIXTURE_INTERNAL.",
      ],
    },
    counts: {
      sources: sources.length,
      financingDocuments: financing.length,
      fixtureDocuments: fixtures.length,
      uniqueInstrumentIdentities: instruments.size,
      structuralNodes: structuralNodes.length,
      covenantCandidates: covenantCandidates.length,
      definitions: definitions.length,
      dependencyEdges: dependencyEdges.length,
      conditionExceptionRecords: conditionExceptionRecords.length,
      documentRelationships: documentRelationships.length,
      unresolvedUncertainties: unresolvedUncertainties.length,
    },
    sources,
    structuralNodes,
    covenantCandidates,
    definitions,
    dependencyEdges,
    conditionExceptionRecords,
    documentRelationships,
    unresolvedUncertainties,
    sliceDigests,
  };
}

export interface WrittenExportPaths {
  dir: string;
  manifestPath: string;
  /** Full envelope (may be large). */
  envelopePath: string;
  shardPaths: Record<string, string>;
}

/** Write envelope + shards. Full envelope stays local by default; git-safe shards under docs/. */
export function writeCanonicalExport(
  exportDoc: CanonicalConsumerExport,
  dir: string,
  opts: { writeFullEnvelope?: boolean } = {},
): WrittenExportPaths {
  mkdirSync(dir, { recursive: true });
  const shardPaths: Record<string, string> = {};
  const shards: Array<[string, unknown]> = [
    ["sources", exportDoc.sources],
    ["structural-nodes", exportDoc.structuralNodes],
    ["covenant-candidates", exportDoc.covenantCandidates],
    ["definitions", exportDoc.definitions],
    ["dependency-edges", exportDoc.dependencyEdges],
    ["conditions-exceptions", exportDoc.conditionExceptionRecords],
    ["document-relationships", exportDoc.documentRelationships],
    ["unresolved-uncertainties", exportDoc.unresolvedUncertainties],
  ];
  for (const [name, data] of shards) {
    const p = path.join(dir, `${name}.json`);
    writeFileSync(p, JSON.stringify(data));
    shardPaths[name] = p;
  }

  const manifest = {
    schemaVersion: exportDoc.schemaVersion,
    exportKind: exportDoc.exportKind,
    generatedAt: exportDoc.generatedAt,
    producer: exportDoc.producer,
    knowledgeFactoryVersion: exportDoc.knowledgeFactoryVersion,
    structuralParserVersion: exportDoc.structuralParserVersion,
    sourceVersionId: exportDoc.sourceVersionId,
    idempotencyKey: exportDoc.idempotencyKey,
    durabilityClaim: exportDoc.durabilityClaim,
    safety: exportDoc.safety,
    peerCoordination: exportDoc.peerCoordination,
    counts: exportDoc.counts,
    sliceDigests: exportDoc.sliceDigests,
    shards: Object.fromEntries(Object.keys(shardPaths).map((k) => [k, `${k}.json`])),
  };
  const manifestPath = path.join(dir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  let envelopePath = path.join(dir, "canonical-consumer-export.json");
  if (opts.writeFullEnvelope !== false) {
    writeFileSync(envelopePath, JSON.stringify(exportDoc));
  }

  return { dir, manifestPath, envelopePath, shardPaths };
}
