/**
 * Canonical read-only consumer contract for peer research agents.
 * One schema, stable source identities — no duplicate research-specific registries.
 */

import { KNOWLEDGE_FACTORY_VERSION } from "../types";
import { STRUCTURAL_INDEX_VERSION } from "../../contract-model/compiler/types";

export const CONSUMER_EXPORT_SCHEMA_VERSION = "knowledge-factory.consumer-export.v1";
export const CONSUMER_EXPORT_KIND = "ckf-canonical-readonly-corpus";

export interface ConsumerExportSafety {
  automaticLegalVerification: false;
  automaticCapacityPromotion: false;
  paidInference: false;
  merges: false;
  certificationChanges: false;
  productionLegalRuleModifications: false;
  fixturesSeparatedFromSecAcquisitions: true;
}

export interface ConsumerSourceRecord {
  sourceId: string;
  accessionNumber: string;
  exhibitFilename: string;
  issuerCik: string;
  issuerTicker?: string;
  issuerName?: string;
  instrumentIdentity?: string;
  sourceUrl: string;
  filingDate: string;
  formType: string;
  documentTitle: string;
  documentClass: string;
  originalBytesHash: string;
  normalizedTextHash?: string;
  acquisitionTimestamp: string;
  parserVersion: string;
  structuralParserVersion: string;
  representationLevel: string;
  provenance: string;
  usageRightsReviewStatus: string;
  corpusRole: "FINANCING" | "FIXTURE" | "FALSE_POSITIVE_EXHIBIT" | "OTHER";
  aliases: string[];
}

export interface ConsumerStructuralNode {
  nodeId: string;
  sourceId: string;
  nodeType: string;
  sectionRef: string;
  heading: string;
  charStart: number;
  charEnd: number;
  parentNodeId?: string;
  ambiguous?: boolean;
}

export interface ConsumerCovenantCandidate {
  candidateId: string;
  sourceId: string;
  nodeId?: string;
  families: string[];
  signals: string[];
  excerpt: string;
  representationLevel: string;
  discoveryScore: number;
}

export interface ConsumerDefinition {
  term: string;
  sourceId: string;
  nodeId?: string;
  charStart: number;
  charEnd: number;
  excerpt: string;
}

export interface ConsumerDependencyEdge {
  edgeId: string;
  sourceId: string;
  fromNodeId?: string;
  rawReference: string;
  charStart: number;
  charEnd: number;
  kind: "PROVISION_CROSS_REFERENCE";
  resolution: "UNRESOLVED";
  legalTruth: false;
}

export interface ConsumerConditionException {
  id: string;
  sourceId: string;
  kind: "CONDITION" | "EXCEPTION" | "PROVISO";
  nodeId?: string;
  charStart: number;
  charEnd: number;
  excerpt: string;
  signals: string[];
  representationLevel: "DISCOVERED_CANDIDATE";
}

export interface ConsumerDocumentRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  kind: string;
  evidenceStatus: string;
  rationale: string;
  confidence: number;
}

export interface ConsumerUncertaintyRecord {
  id: string;
  sourceId?: string;
  kind?: string;
  detail?: string;
  [key: string]: unknown;
}

export interface ConsumerExportCounts {
  sources: number;
  financingDocuments: number;
  fixtureDocuments: number;
  uniqueInstrumentIdentities: number;
  structuralNodes: number;
  covenantCandidates: number;
  definitions: number;
  dependencyEdges: number;
  conditionExceptionRecords: number;
  documentRelationships: number;
  unresolvedUncertainties: number;
}

export interface CanonicalConsumerExport {
  schemaVersion: typeof CONSUMER_EXPORT_SCHEMA_VERSION;
  exportKind: typeof CONSUMER_EXPORT_KIND;
  generatedAt: string;
  producer: "WS-CKF";
  knowledgeFactoryVersion: string;
  structuralParserVersion: string;
  sourceVersionId: string;
  idempotencyKey: string;
  durabilityClaim: "NONE" | "VERIFIED_SHARED_STORAGE";
  safety: ConsumerExportSafety;
  peerCoordination: {
    consumers: string[];
    notes: string[];
  };
  counts: ConsumerExportCounts;
  sources: ConsumerSourceRecord[];
  structuralNodes: ConsumerStructuralNode[];
  covenantCandidates: ConsumerCovenantCandidate[];
  definitions: ConsumerDefinition[];
  dependencyEdges: ConsumerDependencyEdge[];
  conditionExceptionRecords: ConsumerConditionException[];
  documentRelationships: ConsumerDocumentRelationship[];
  unresolvedUncertainties: ConsumerUncertaintyRecord[];
  sliceDigests: Record<string, string>;
}

export const CONSUMER_EXPORT_SAFETY: ConsumerExportSafety = {
  automaticLegalVerification: false,
  automaticCapacityPromotion: false,
  paidInference: false,
  merges: false,
  certificationChanges: false,
  productionLegalRuleModifications: false,
  fixturesSeparatedFromSecAcquisitions: true,
};

export function consumerContractIdentity(): {
  schemaVersion: string;
  exportKind: string;
  knowledgeFactoryVersion: string;
  structuralParserVersion: string;
  safety: ConsumerExportSafety;
} {
  return {
    schemaVersion: CONSUMER_EXPORT_SCHEMA_VERSION,
    exportKind: CONSUMER_EXPORT_KIND,
    knowledgeFactoryVersion: KNOWLEDGE_FACTORY_VERSION,
    structuralParserVersion: STRUCTURAL_INDEX_VERSION,
    safety: CONSUMER_EXPORT_SAFETY,
  };
}
