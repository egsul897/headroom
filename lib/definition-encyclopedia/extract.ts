/**
 * Deterministic definition extraction for the encyclopedia.
 * Reuses Phase 2A structural definition detection — zero paid inference.
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { detectStructuralDefinitions, type DetectedDefinition } from "@/lib/contract-model/compiler/structural-definitions";
import { PRIORITY_TERM_FAMILIES, canonicalFamilyFor, isPriorityNormalizedTerm } from "./priority-terms";
import type { EncyclopediaSourceSpec } from "./sources";
import type { DefinitionExample, SourceIdentity } from "./schema";
import {
  detectCalculations,
  detectCrossReferences,
  detectDependencies,
  detectEmbeddedExceptions,
  flagSemanticTraps,
  flagUnusualDrafting,
  inferSectionLabel,
} from "./analyze";

/** Dependency scan universe: priority variants only (keeps edges focused and generation cheap). */
export function priorityDependencyUniverse(): Set<string> {
  const s = new Set<string>();
  for (const family of PRIORITY_TERM_FAMILIES) {
    for (const v of family.normalizedVariants) s.add(v);
  }
  return s;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function loadSourceText(repoRoot: string, spec: EncyclopediaSourceSpec): { text: string; identity: SourceIdentity } | null {
  const abs = resolve(repoRoot, spec.retrievalPath);
  if (!existsSync(abs)) return null;
  const text = readFileSync(abs, "utf8");
  return {
    text,
    identity: {
      sourceId: spec.sourceId,
      packageKey: spec.packageKey,
      documentId: spec.documentId,
      documentLabel: spec.documentLabel,
      agreementVersion: spec.agreementVersion,
      documentType: spec.documentType,
      retrievalPath: spec.retrievalPath,
      textSha256: sha256Hex(text),
      textByteLength: Buffer.byteLength(text, "utf8"),
    },
  };
}

/**
 * Full definition span: from declaration start to the next non-nested
 * definition declaration (same algorithm as StructuralIndex.getDefinitionFullText).
 */
export function sliceDefinitionFullText(text: string, def: DetectedDefinition, allDefsSorted: DetectedDefinition[]): string {
  const ownIndex = allDefsSorted.findIndex((d) => d.charStart === def.charStart && d.normalizedTerm === def.normalizedTerm);
  const next = ownIndex >= 0 ? allDefsSorted.slice(ownIndex + 1).find((d) => !d.nested) : undefined;
  const spanEnd = next ? next.charStart : text.length;
  return text.slice(def.charStart, spanEnd);
}

function exampleIdFor(sourceId: string, normalizedTerm: string, charStart: number): string {
  const digest = sha256Hex(`${sourceId}|${normalizedTerm}|${charStart}`).slice(0, 12);
  return `defex:${sourceId}:${normalizedTerm.replace(/\s+/g, "-")}:${digest}`;
}

export function extractPriorityDefinitionsFromText(
  text: string,
  identity: SourceIdentity,
  dependencyUniverse: Set<string> = priorityDependencyUniverse(),
): DefinitionExample[] {
  const detected = detectStructuralDefinitions(identity.documentId, text, []);
  const sorted = [...detected].sort((a, b) => a.charStart - b.charStart);
  const out: DefinitionExample[] = [];

  for (const def of sorted) {
    if (def.nested) continue;
    if (!isPriorityNormalizedTerm(def.normalizedTerm)) continue;

    const exactText = sliceDefinitionFullText(text, def, sorted).trimEnd();
    // Skip pathological micro-spans (forwarding stubs still kept if they have content).
    if (exactText.length < 12) continue;

    const canonicalTerm = canonicalFamilyFor(def.normalizedTerm)!;
    const exactTextSha256 = sha256Hex(exactText);
    const section = inferSectionLabel(text, def.charStart);

    // Provenance: exactText must be a byte-equal substring at charStart.
    const provenanceValidated = text.slice(def.charStart, def.charStart + exactText.length) === exactText;

    const dependencies = detectDependencies(exactText, def.normalizedTerm, dependencyUniverse);
    const embeddedExceptions = detectEmbeddedExceptions(exactText);
    const calculations = detectCalculations(exactText);
    const crossReferences = detectCrossReferences(exactText);
    const unusualDraftingFlags = flagUnusualDrafting(def, exactText);
    const semanticTrapFlags = flagSemanticTraps(def, exactText, canonicalTerm);

    out.push({
      exampleId: exampleIdFor(identity.sourceId, def.normalizedTerm, def.charStart),
      canonicalTerm,
      exactTerm: def.exactTerm.replace(/\s+/g, " ").trim(),
      normalizedTerm: def.normalizedTerm,
      exactText,
      exactTextSha256,
      declarationKind: def.declarationKind ?? "UNKNOWN",
      nested: !!def.nested,
      section,
      charStart: def.charStart,
      charEnd: def.charStart + exactText.length,
      source: identity,
      dependencies,
      embeddedExceptions,
      calculations,
      crossReferences,
      alternativeFormulationGroup: `alt-group:${canonicalTerm}`,
      unusualDraftingFlags,
      semanticTrapFlags,
      provenanceValidated,
    });
  }

  return out;
}
