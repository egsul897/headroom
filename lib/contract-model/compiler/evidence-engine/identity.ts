/**
 * Content-addressed identity for one evidence artifact.
 *
 * A hit requires every field. Cache reuse is not certification.
 * UNKNOWN and an empty dependency value are uncertain, and uncertain
 * dependencies are not reusable.
 */
import { hashParts } from "../hashing";

export type EvidenceArtifactKind =
  | "RAW_PROVIDER_OUTPUT"
  | "PARSED_CANDIDATE"
  | "SEMANTIC_IR"
  | "VERIFICATION_FINDINGS"
  | "CERTIFICATION_EVIDENCE";

export interface EvidenceReuseContract {
  sourceContentSha256: string;
  documentId: string;
  operativeVersionId: string;
  dependencyHashes: Readonly<Record<string, string>>;
  promptVersion: string;
  schemaVersion: string;
  modelId: string;
  inferenceConfigHash: string;
  stage: string;
  compilerVersion: string;
  artifactKind: EvidenceArtifactKind;
}

const UNCERTAIN = new Set(["", "UNKNOWN", "UNCERTAIN"]);

export function dependencyUncertainty(contract: EvidenceReuseContract): string[] {
  const reasons: string[] = [];
  if (UNCERTAIN.has(contract.operativeVersionId)) reasons.push("operative version is unresolved");
  if (!contract.sourceContentSha256) reasons.push("source content hash is missing");
  const names = Object.keys(contract.dependencyHashes).sort();
  for (const name of names) {
    if (UNCERTAIN.has(contract.dependencyHashes[name] ?? "")) reasons.push(`dependency ${name} is unresolved`);
  }
  return reasons;
}

export function evidenceKey(contract: EvidenceReuseContract): string {
  const dependencies = Object.keys(contract.dependencyHashes)
    .sort()
    .map((name) => `${name}=${contract.dependencyHashes[name]}`);
  return hashParts([
    contract.artifactKind,
    contract.stage,
    contract.sourceContentSha256,
    contract.documentId,
    contract.operativeVersionId,
    ...dependencies,
    contract.promptVersion,
    contract.schemaVersion,
    contract.modelId,
    contract.inferenceConfigHash,
    contract.compilerVersion,
  ]);
}
