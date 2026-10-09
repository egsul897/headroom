import type { ProvenanceManifest, SourceToCovenantRecord, SplitBucket } from "./types";
import { DATASET_SCHEMA_VERSION } from "./types";

/** Importable package consumed by future loaders / evaluation harnesses. */
export interface ImportableDatasetPackage {
  schemaVersion: typeof DATASET_SCHEMA_VERSION;
  provenance: ProvenanceManifest;
  records: SourceToCovenantRecord[];
}

/**
 * SFT/distillation export row. Subject to provenance and usage-rights review
 * before any supervised fine-tuning or distillation run.
 */
export interface SftExportRow {
  example_id: string;
  split: SplitBucket;
  polarity: string;
  verification_status: string;
  issuer_id: string;
  instrument_key: string;
  document_id: string;
  section_ref: string;
  source_text: string;
  source_text_sha256: string;
  window_sha256: string;
  governing_prohibition: string | null;
  definitions_json: string;
  candidate_family: string | null;
  candidate_class: string;
  proposed_formula_json: string;
  proposed_conditions_json: string;
  proposed_dependencies_json: string;
  missing_inputs_json: string;
  uncertainty_json: string;
  label_notes: string;
  usage_rights_review_required: true;
  exclude_from_claude_acceptance_corpus: true;
  pins_are_not_label_authority: true;
  tool_versions_json: string;
}

export function toImportablePackage(
  records: readonly SourceToCovenantRecord[],
  provenance: ProvenanceManifest,
): ImportableDatasetPackage {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    provenance,
    records: [...records],
  };
}

export function toSftExportRows(records: readonly SourceToCovenantRecord[]): SftExportRow[] {
  return records.map((r) => ({
    example_id: r.exampleId,
    split: r.split,
    polarity: r.polarity,
    verification_status: r.output.verificationStatus,
    issuer_id: r.document.issuerId,
    instrument_key: r.document.instrumentKey,
    document_id: r.document.documentId,
    section_ref: r.structural.sectionRef,
    source_text: r.input.exactText,
    source_text_sha256: r.input.sourceTextSha256,
    window_sha256: r.input.windowSha256,
    governing_prohibition: r.governingProhibition,
    definitions_json: JSON.stringify(r.input.definitions),
    candidate_family: r.output.candidateCovenantFamily,
    candidate_class: r.output.candidatePermissionProhibitionClass,
    proposed_formula_json: JSON.stringify(r.output.proposedFormulaOrCapacity),
    proposed_conditions_json: JSON.stringify(r.output.proposedConditions),
    proposed_dependencies_json: JSON.stringify(r.output.proposedDependencyEdges),
    missing_inputs_json: JSON.stringify(r.output.missingInputs),
    uncertainty_json: JSON.stringify(r.output.uncertainty),
    label_notes: r.output.labelNotes,
    usage_rights_review_required: true,
    exclude_from_claude_acceptance_corpus: true,
    pins_are_not_label_authority: true,
    tool_versions_json: JSON.stringify(r.toolVersions),
  }));
}

export function toJsonl(rows: readonly SftExportRow[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
}
