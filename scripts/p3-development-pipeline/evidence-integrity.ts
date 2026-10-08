/**
 * Evidence identity for DEVELOPMENT pipeline records.
 *
 * A provider candidate set is current-tree evidence only when its parser
 * code identity and structural-tree identity match the tree that is being
 * read. Historical Haiku rows stay auditable and are not promotable.
 * DEVELOPMENT ≠ CERTIFIED. Verification not executed is not a verified set.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const PARSER_SOURCE = "lib/contract-model/compiler/clause-hierarchy.ts";
export const PRODUCING_SOURCES = [
  "scripts/p3-development-pipeline/evidence-integrity.ts",
  "scripts/p3-development-pipeline/run-offline.ts",
  "scripts/p3-development-pipeline/execute-gibraltar.ts",
] as const;

export const HISTORICAL_RECORD_RELATIVE =
  "development-pipeline/historical/haiku-pass-b-2087-node-tree/execution.json";
export const CURRENT_RECORD_RELATIVE = "development-pipeline/execution.json";

/** Declared identity of the pre-parser Haiku run. Not a hash of the current parser. */
export const HISTORICAL_PARSER_CODE_SHA256 = sha256(
  "gibraltar-haiku-pass-b-parser-identity:pre-clause-restart-letter-run:2087-nodes",
);
/** Declared identity of the 2,087-node tree those rows were read against. */
export const HISTORICAL_STRUCTURAL_TREE_SHA256 = sha256(
  "gibraltar-haiku-pass-b-structural-tree:2087-nodes:not-the-current-parser-tree",
);
export const HISTORICAL_PROVIDER_EXECUTION_IDENTITY = "HISTORICAL_VERCEL_AI_GATEWAY_HAIKU_2087";

export const KNOWN_SECTION_REF_DRIFT = [
  {
    nodeId: "structural-node:99a53df526604251c4688760",
    historicalSectionRef: "7.05(a)(4)(ii)(vi)(B)",
    currentSectionRef: "7.05(a)(y)(vi)(B)",
  },
  {
    nodeId: "structural-node:7254026c586c453960bc7646",
    historicalSectionRef: "1.01(9)(c)(46)",
    currentSectionRef: "1.01(9)(c)(c)(46)",
  },
] as const;

export interface EvidenceIdentity {
  sourceHtmlSha256: string;
  extractedTextSha256: string;
  parserCodeSha256: string;
  structuralTreeSha256: string;
  passACandidateSetSha256: string;
  providerExecutionIdentity: "PROVIDER_EXECUTION_REQUIRED" | typeof HISTORICAL_PROVIDER_EXECUTION_IDENTITY | string;
  verificationState: "NOT_EXECUTED";
  producingCodeSha256: string;
}

export interface StructuralTreeMember {
  nodeId: string;
  nodeType: string;
  sectionRef: string;
  charStart: number;
  charEnd: number;
}

export interface PassAMember {
  nodeId: string;
  signals: readonly string[];
}

export interface SectionRefAnchor {
  nodeId: string;
  sectionRef: string;
}

export interface ProviderCandidatePointer {
  structuralNodeIds: readonly string[];
}

export class EvidenceIntegrityError extends Error {
  readonly code = "EVIDENCE_INTEGRITY_REJECTED";
}

export function sha256(bytes: Buffer | string): string {
  const data = typeof bytes === "string" ? Buffer.from(bytes) : bytes;
  return createHash("sha256").update(data).digest("hex");
}

export function hashParserCode(root = process.cwd()): string {
  return sha256(readFileSync(path.join(root, PARSER_SOURCE)));
}

export function hashProducingCode(root = process.cwd()): string {
  return sha256(PRODUCING_SOURCES.map((relative) => readFileSync(path.join(root, relative))).join("\n"));
}

export function hashStructuralTree(nodes: readonly StructuralTreeMember[]): string {
  return sha256(nodes.map((node) => `${node.nodeId}\t${node.nodeType}\t${node.sectionRef}\t${node.charStart}\t${node.charEnd}`).join("\n"));
}

export function hashPassACandidateSet(candidates: readonly PassAMember[]): string {
  return sha256(candidates.map((candidate) => `${candidate.nodeId}\t${candidate.signals.join(",")}`).join("\n"));
}

/**
 * Reject provider candidates whose parser or tree identity is not the current one.
 * An empty candidate list is not a provider run and is not rejected here.
 */
export function assertProviderCandidatesMatchCurrentTree(input: {
  candidates: readonly ProviderCandidatePointer[];
  recordParserCodeSha256: string;
  recordStructuralTreeSha256: string;
  currentParserCodeSha256: string;
  currentStructuralTreeSha256: string;
}): void {
  if (input.candidates.length === 0) return;
  if (input.recordParserCodeSha256 !== input.currentParserCodeSha256) {
    throw new EvidenceIntegrityError(
      "Provider candidates reference a different parser identity than the current tree. Refusing to treat them as current-tree evidence.",
    );
  }
  if (input.recordStructuralTreeSha256 !== input.currentStructuralTreeSha256) {
    throw new EvidenceIntegrityError(
      "Provider candidates reference a different structural-tree identity than the current tree. Refusing to treat them as current-tree evidence.",
    );
  }
}

/**
 * Reject anchors whose nodeId still exists but whose stored sectionRef is not the live one.
 * A missing nodeId is also refused: the anchor is not on this tree.
 */
export function collectSectionRefAnchors(value: unknown, out: SectionRefAnchor[] = []): SectionRefAnchor[] {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectSectionRefAnchors(item, out);
    return out;
  }
  const record = value as { nodeId?: unknown; sectionRef?: unknown };
  if (typeof record.nodeId === "string" && typeof record.sectionRef === "string") {
    out.push({ nodeId: record.nodeId, sectionRef: record.sectionRef });
  }
  for (const child of Object.values(record)) collectSectionRefAnchors(child, out);
  return out;
}

export function assertSectionRefAnchorsMatchLiveTree(
  anchors: readonly SectionRefAnchor[],
  liveSectionRefByNodeId: ReadonlyMap<string, string>,
): void {
  for (const anchor of anchors) {
    const live = liveSectionRefByNodeId.get(anchor.nodeId);
    if (live === undefined) {
      throw new EvidenceIntegrityError(
        `Section-ref anchor ${anchor.nodeId} (${anchor.sectionRef}) is absent from the current structural tree.`,
      );
    }
    if (live !== anchor.sectionRef) {
      throw new EvidenceIntegrityError(
        `Node ${anchor.nodeId} is ${live} on the current tree and ${anchor.sectionRef} on the record. Matching node ids with a changed section reference are refused.`,
      );
    }
  }
}

export function assertHistoricalProviderRecordNotPromotable(record: {
  label?: string;
  promotable?: boolean;
  currentTreeEvidence?: boolean;
  verificationState?: string;
  certified?: boolean;
}): void {
  if (record.label === "HISTORICAL_PROVIDER_EXECUTION" || record.promotable === false || record.currentTreeEvidence === false) {
    throw new EvidenceIntegrityError(
      "Historical provider records remain auditable and cannot be promoted to current-tree evidence.",
    );
  }
  if (record.verificationState !== "EXECUTED") {
    throw new EvidenceIntegrityError("Provider evidence without executed verification cannot be promoted.");
  }
  if (record.certified === true) {
    throw new EvidenceIntegrityError("This gate does not promote a record to CERTIFIED.");
  }
}

export function assertProviderFreeExecution(result: {
  certified: boolean;
  passB: { executed: boolean; terminal: string };
  discoveredCandidates: readonly unknown[];
  providerScopedCandidates: readonly unknown[];
  verificationReservation: { executed: boolean };
  evidenceIdentity: EvidenceIdentity;
}): void {
  if (result.passB.executed !== false || result.passB.terminal !== "PROVIDER_EXECUTION_REQUIRED") {
    throw new EvidenceIntegrityError("No-key execution claimed a provider run.");
  }
  if (result.discoveredCandidates.length !== 0 || result.providerScopedCandidates.length !== 0) {
    throw new EvidenceIntegrityError("No-key execution returned provider candidates.");
  }
  if (result.verificationReservation.executed !== false || result.evidenceIdentity.verificationState !== "NOT_EXECUTED") {
    throw new EvidenceIntegrityError("Verification was not executed.");
  }
  if (result.certified !== false) {
    throw new EvidenceIntegrityError("Provider-free execution set certified.");
  }
  if (result.evidenceIdentity.providerExecutionIdentity !== "PROVIDER_EXECUTION_REQUIRED") {
    throw new EvidenceIntegrityError("Provider-free execution identity is not PROVIDER_EXECUTION_REQUIRED.");
  }
}
