/**
 * Phase 2C - the package-graph pipeline: classification (§4) -> identity
 * extraction (§5) -> deterministic modification-candidate detection (§9) ->
 * cross-document reference lead detection (§12) -> relationship resolution
 * (§6/§9/§12/§14) -> instrument grouping (§7). Standalone, like Phase 2B's
 * discovery pipeline (docs/phase-2b-autonomous-covenant-discovery.md §11) -
 * not yet wired into the ContractCompilerRun orchestrator's stage/cache
 * machinery, for the same reason: this phase's job is to build and measure
 * the package-graph algorithm itself, and wiring it into the resumable
 * per-stage DB state machine is a natural, but not assumed, follow-on
 * integration step.
 *
 * COST JUSTIFICATION (task §15): this V1 pipeline makes ZERO real LLM
 * calls. Every required relationship/modification-target/cross-reference
 * resolution in this phase's own synthetic test packages (§16) - including
 * the deliberately ambiguous one, which must correctly resolve to
 * UNRESOLVED rather than being resolved at all - is reachable from cheap,
 * deterministic signals alone (document title/type patterns, execution
 * dates, explicit "the X dated as of Y" self-references, amendment/
 * supplement numbering). A semantic-classification fallback is NOT
 * implemented in this phase because no real requirement here could not be
 * met deterministically; see PACKAGE_GRAPH_PROMPT_VERSION below for the
 * version identity a future semantic pass would need to key its cache on
 * once a real ambiguous package actually requires one.
 */
import { classifyPackageDocuments } from "./document-classifier";
import { extractPackageDocumentIdentities } from "./document-identity";
import { detectPackageModificationCandidates } from "./modification-candidates";
import { detectPackageCrossDocumentReferenceLeads } from "./cross-document-references";
import { resolvePackageRelationships } from "./relationship-resolution";
import { groupPackageIntoInstruments } from "./instrument-grouping";
import type { PackageDocumentInput, PackageGraphResult } from "./types";

/** Bump on any change to classification/relationship-resolution/instrument-grouping logic - a future semantic-resolution addition must invalidate any cached package-graph output keyed on this version, exactly as DISCOVERY_RUN_VERSION does for Phase 2B. */
export const PACKAGE_GRAPH_PIPELINE_VERSION = "phase-2c-package-graph-pipeline.v1";
/** Reserved for the semantic-resolution prompt this phase does not yet use (see header) - present now so a later phase adding one does not have to invent the version-identity convention from scratch. */
export const PACKAGE_GRAPH_SEMANTIC_PROMPT_VERSION = "phase-2c-package-graph-semantic.v1";

export function buildPackageGraph(companyId: string, packageKey: string, documents: PackageDocumentInput[]): PackageGraphResult {
  const start = Date.now();
  const totalCharsScanned = documents.reduce((n, d) => n + d.text.length, 0);

  const classifications = classifyPackageDocuments(documents);
  const identities = extractPackageDocumentIdentities(documents);
  const modificationCandidatesRaw = detectPackageModificationCandidates(documents);
  const crossDocumentReferenceLeadsRaw = detectPackageCrossDocumentReferenceLeads(documents);

  const { relationshipCandidates, resolvedModificationCandidates, resolvedCrossDocumentReferenceLeads } = resolvePackageRelationships(documents, classifications, identities, modificationCandidatesRaw, crossDocumentReferenceLeadsRaw);

  const instruments = groupPackageIntoInstruments(
    documents.map((d) => d.documentId),
    classifications,
    identities,
    relationshipCandidates
  );

  return {
    companyId,
    packageKey,
    classifications,
    identities,
    relationshipCandidates,
    modificationCandidates: resolvedModificationCandidates,
    crossDocumentReferenceLeads: resolvedCrossDocumentReferenceLeads,
    instruments,
    performance: {
      documentCount: documents.length,
      totalCharsScanned,
      relationshipCandidatesGenerated: relationshipCandidates.length,
      relationshipsResolved: relationshipCandidates.filter((r) => r.status === "RESOLVED").length,
      relationshipsUnresolved: relationshipCandidates.filter((r) => r.status === "UNRESOLVED").length,
      modificationCandidatesGenerated: resolvedModificationCandidates.length,
      crossDocumentReferenceLeadsGenerated: resolvedCrossDocumentReferenceLeads.length,
      wallClockMs: Date.now() - start,
      semanticCallsUsed: 0,
    },
  };
}
