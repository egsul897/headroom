import { EXAMPLE_CATALOG, HELDOUT_ISSUER_IDS, type ExampleSpec } from "./catalog";
import { applyNearDuplicateClusterIds, detectDuplicates } from "./dedup";
import { extractAroundAnchor, extractByRegex, extractDefinition, readFixture } from "./extract";
import { toImportablePackage, toJsonl, toSftExportRows } from "./export";
import { sha256Text } from "./hash";
import { buildProvenanceManifest } from "./provenance";
import { buildQualityReport } from "./quality";
import type { ControllingContext, DuplicateReport, ProvenanceManifest, QualityReport, SourceToCovenantRecord } from "./types";
import { validateCorpus } from "./validate";
import { currentToolVersionPins } from "./versions";

const CONTAMINATION = {
  excludeFromClaudeAcceptanceCorpus: true as const,
  excludeFromVerifierFewShots: true as const,
  excludeFromCompilerPromptFewShots: true as const,
  usageRightsReviewRequiredBeforeSft: true as const,
};

function materializeWindow(repoRoot: string, spec: ExampleSpec): {
  exactText: string;
  charStartInFixture: number | null;
  charEndInFixture: number | null;
  sourceTextSha256: string;
  windowSha256: string;
} {
  const w = spec.window;
  if (w.kind === "regex") {
    const extracted = extractByRegex(repoRoot, w.sourceFixturePath, new RegExp(w.startRe, "i"), w.endRe ? new RegExp(w.endRe, "i") : null, {
      occurrence: w.occurrence,
      maxLen: w.maxLen,
    });
    return extracted;
  }
  if (w.kind === "anchor") {
    return extractAroundAnchor(repoRoot, w.sourceFixturePath, w.anchor, w.back, w.forward, { occurrence: w.occurrence });
  }
  // literal
  const exactText = w.exactText;
  let sourceTextSha256 = sha256Text(exactText);
  if (w.sourceTextSha256FromFixture) {
    sourceTextSha256 = sha256Text(readFixture(repoRoot, w.sourceFixturePath));
  }
  return {
    exactText,
    charStartInFixture: null,
    charEndInFixture: null,
    sourceTextSha256,
    windowSha256: sha256Text(exactText),
  };
}

export function buildRecord(repoRoot: string, spec: ExampleSpec): SourceToCovenantRecord {
  if ((HELDOUT_ISSUER_IDS as readonly string[]).includes(spec.document.issuerId) && spec.split !== "eval-heldout") {
    throw new Error(`Held-out issuer ${spec.document.issuerId} must use split eval-heldout (${spec.exampleId})`);
  }
  if (!(HELDOUT_ISSUER_IDS as readonly string[]).includes(spec.document.issuerId) && spec.split === "eval-heldout") {
    throw new Error(`Non-held-out issuer ${spec.document.issuerId} cannot use eval-heldout (${spec.exampleId})`);
  }

  const window = materializeWindow(repoRoot, spec);
  const definitions: Record<string, string> = {};
  let definitionSourceSha256: string | null = null;
  for (const pull of spec.definitionPulls ?? []) {
    const def = extractDefinition(repoRoot, pull.sourceFixturePath, pull.termStart, pull.maxLen ?? 2000);
    definitions[pull.key] = def.text;
    definitionSourceSha256 = def.sha256;
  }

  const input: ControllingContext = {
    exactText: window.exactText,
    charStartInFixture: window.charStartInFixture,
    charEndInFixture: window.charEndInFixture,
    sourceTextSha256: window.sourceTextSha256,
    windowSha256: window.windowSha256,
    definitions,
    definitionSourceSha256,
    exceptions: spec.inputExceptions ?? [],
    conditions: spec.inputConditions ?? [],
    crossReferences: spec.inputCrossReferences ?? [],
    entityScopeNotes: spec.entityScopeNotes ?? [],
  };

  return {
    exampleId: spec.exampleId,
    schemaVersion: "source-to-covenant-dataset.v1",
    polarity: spec.polarity,
    role: spec.role,
    split: spec.split,
    document: { ...spec.document },
    operativeVersion: { ...spec.operativeVersion },
    structural: { ...spec.structural },
    governingProhibition: spec.governingProhibition,
    input,
    output: { ...spec.output },
    toolVersions: currentToolVersionPins(),
    nearDuplicateClusterId: null,
    contaminationRestrictions: { ...CONTAMINATION },
    authoredAt: spec.authoredAt,
    authoringMethod: spec.authoringMethod,
  };
}

export interface BuiltDataset {
  records: SourceToCovenantRecord[];
  provenance: ProvenanceManifest;
  duplicateReport: DuplicateReport;
  qualityReport: QualityReport;
  sftJsonl: string;
  importableJson: string;
}

export function buildDataset(repoRoot: string, catalog: readonly ExampleSpec[] = EXAMPLE_CATALOG): BuiltDataset {
  const raw = catalog.map((spec) => buildRecord(repoRoot, spec));
  const problems = validateCorpus(raw);
  if (problems.length) {
    const preview = problems.slice(0, 10).map((p) => `${p.exampleId}:${p.code}:${p.message}`).join("\n");
    throw new Error(`Dataset validation failed (${problems.length}):\n${preview}`);
  }
  const duplicateReport = detectDuplicates(raw);
  const records = applyNearDuplicateClusterIds(raw, duplicateReport);
  const toolVersions = currentToolVersionPins();
  const provenance = buildProvenanceManifest(records, toolVersions);
  const qualityReport = buildQualityReport(records, provenance);
  const importable = toImportablePackage(records, provenance);
  const sftJsonl = toJsonl(toSftExportRows(records));
  return {
    records,
    provenance,
    duplicateReport,
    qualityReport,
    sftJsonl,
    importableJson: JSON.stringify(importable, null, 2),
  };
}
