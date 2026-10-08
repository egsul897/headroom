/**
 * Deterministic definition extraction for the encyclopedia.
 * Reuses Phase 2A structural definition detection — zero paid inference.
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { detectStructuralDefinitions, type DetectedDefinition } from "@/lib/contract-model/compiler/structural-definitions";
import { PRIORITY_TERM_FAMILIES } from "./priority-terms";
import { ALL_EXTRACTION_FAMILIES, canonicalFamilyForExpanded, isExtractableNormalizedTerm } from "./phase2-terms";
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

/** Dependency scan universe: Phase-1 + Phase-2 extractable variants. */
export function priorityDependencyUniverse(): Set<string> {
  const s = new Set<string>();
  for (const family of ALL_EXTRACTION_FAMILIES) {
    for (const v of family.normalizedVariants) s.add(v);
  }
  // Keep Phase-1 list explicitly in case of merge gaps.
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

/**
 * Supplemental (WS-DEF-local) detector for joint declarations:
 *   "Pro Forma Basis", "Pro Forma Compliance" and "Pro Forma Effect" mean ...
 * Phase 2A structural detection typically indexes only the first quoted term.
 * We do NOT modify lib/contract-model/compiler/**; this is encyclopedia-only.
 */
export function detectJointDeclarationSiblings(
  documentId: string,
  text: string,
  already: DetectedDefinition[],
): DetectedDefinition[] {
  const have = new Set(already.map((d) => `${d.normalizedTerm}@${d.charStart}`));
  const out: DetectedDefinition[] = [];
  // Joint declarations where multiple quoted labels share one means-body.
  // Example: “Pro Forma Basis”, “Pro Forma Compliance” and “Pro Forma Effect” mean ...
  // Use RegExp("\\u201c...") — NOT String.raw — so unicode escapes are interpreted.
  const re = new RegExp(
    // Note: some instruments use singular "mean" in joint declarations ("A", "B" and "C" mean, ...).
    '(?:[\\u201c"][^"\\u201c\\u201d]{1,80}?[\\u201d"]\\s*,\\s*)+[\\u201c"][^"\\u201c\\u201d]{1,80}?[\\u201d"]\\s+(?:and|or)\\s+[\\u201c"][^"\\u201c\\u201d]{1,80}?[\\u201d"]\\s+(?:means?|shall\\s+mean|shall\\s+have\\s+the\\s+meaning|has\\s+the\\s+meaning|:)',
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const block = m[0];
    const termRe = new RegExp('[\\u201c"]\\s*([^"\\u201c\\u201d]{1,80}?)\\s*[\\u201d"]', "g");
    let tm: RegExpExecArray | null;
    const terms: Array<{ term: string; offset: number }> = [];
    while ((tm = termRe.exec(block)) !== null) {
      terms.push({ term: tm[1]!.trim(), offset: m.index + tm.index });
    }
    if (terms.length < 2) continue;
    for (const t of terms) {
      const normalizedTerm = t.term.toLowerCase().replace(/\s+/g, " ");
      if (already.some((d) => d.normalizedTerm === normalizedTerm && Math.abs(d.charStart - t.offset) < 40)) continue;
      const key = `${normalizedTerm}@${t.offset}`;
      if (have.has(key)) continue;
      out.push({
        documentId,
        exactTerm: t.term,
        normalizedTerm,
        sourceNodeKey: null,
        sourceNodeId: null,
        charStart: t.offset,
        charEnd: t.offset + t.term.length + 2,
        definitionExcerpt: text.slice(m.index, Math.min(text.length, m.index + 200)),
        declarationKind: "MEANS",
        forwardingTarget: null,
        nested: false,
      });
      have.add(key);
    }
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

export type ExtractionMode = "families" | "families_plus_inventory";

const INVENTORY_MAX_PER_DOC = 120;
const INVENTORY_MIN_BODY = 40;

export function extractPriorityDefinitionsFromText(
  text: string,
  identity: SourceIdentity,
  dependencyUniverse: Set<string> = priorityDependencyUniverse(),
  mode: ExtractionMode = "families_plus_inventory",
): DefinitionExample[] {
  const detected = detectStructuralDefinitions(identity.documentId, text, []);
  const jointTerms = detectJointDeclarationSiblings(identity.documentId, text, detected);
  // First term in each joint cluster is the span owner; later labels reuse that span.
  const jointClusters = new Map<string, DetectedDefinition[]>();
  for (const j of jointTerms) {
    // Cluster key = nearest preceding joint term's block via shared excerpt prefix (definitionExcerpt starts at block).
    const key = j.definitionExcerpt.slice(0, 80);
    const list = jointClusters.get(key) ?? [];
    list.push(j);
    jointClusters.set(key, list);
  }
  const spanOwnerStarts = new Set<number>();
  const siblingStarts = new Set<number>();
  for (const list of jointClusters.values()) {
    const ordered = [...list].sort((a, b) => a.charStart - b.charStart);
    spanOwnerStarts.add(ordered[0]!.charStart);
    for (const s of ordered.slice(1)) siblingStarts.add(s.charStart);
  }
  const sortedForSpans = [
    ...detected,
    ...jointTerms.map((j) => ({ ...j, nested: siblingStarts.has(j.charStart) })),
  ].sort((a, b) => a.charStart - b.charStart);
  const sorted = [...detected, ...jointTerms].sort((a, b) => a.charStart - b.charStart);
  const out: DefinitionExample[] = [];
  let inventoryAdded = 0;

  for (const def of sorted) {
    if (def.nested) continue;
    const inFamily = isExtractableNormalizedTerm(def.normalizedTerm);
    if (!inFamily && mode === "families") continue;
    if (!inFamily && inventoryAdded >= INVENTORY_MAX_PER_DOC) continue;

    // Joint-declaration non-owners reuse the span owner's full text.
    let spanStart = def.charStart;
    let exactText: string;
    if (siblingStarts.has(def.charStart)) {
      const owner = sortedForSpans
        .filter((d) => spanOwnerStarts.has(d.charStart) && d.charStart <= def.charStart)
        .sort((a, b) => b.charStart - a.charStart)[0];
      if (owner) {
        spanStart = owner.charStart;
        exactText = sliceDefinitionFullText(text, owner, sortedForSpans).trimEnd();
      } else {
        exactText = sliceDefinitionFullText(text, def, sortedForSpans).trimEnd();
      }
    } else {
      exactText = sliceDefinitionFullText(text, def, sortedForSpans).trimEnd();
    }
    // Skip pathological micro-spans (forwarding stubs still kept if they have content).
    if (exactText.length < 12) continue;
    if (!inFamily && exactText.length < INVENTORY_MIN_BODY) continue;

    // Noise filters for inventory mode
    if (!inFamily) {
      if (/^\d+$/.test(def.normalizedTerm)) continue;
      if (def.normalizedTerm.length < 3) continue;
    }

    const canonicalTerm = inFamily
      ? canonicalFamilyForExpanded(def.normalizedTerm)!
      : def.exactTerm.replace(/\s+/g, " ").trim();
    const exactTextSha256 = sha256Hex(exactText);
    const section = inferSectionLabel(text, spanStart);

    // Provenance: exactText must be a byte-equal substring at spanStart.
    const provenanceValidated = text.slice(spanStart, spanStart + exactText.length) === exactText;

    const dependencies = detectDependencies(exactText, def.normalizedTerm, dependencyUniverse);
    const embeddedExceptions = detectEmbeddedExceptions(exactText);
    const calculations = detectCalculations(exactText);
    const crossReferences = detectCrossReferences(exactText);
    const unusualDraftingFlags = flagUnusualDrafting(def, exactText);
    const semanticTrapFlags = flagSemanticTraps(def, exactText, canonicalTerm);

    out.push({
      exampleId: exampleIdFor(identity.sourceId, def.normalizedTerm, spanStart),
      canonicalTerm,
      exactTerm: def.exactTerm.replace(/\s+/g, " ").trim(),
      normalizedTerm: def.normalizedTerm,
      exactText,
      exactTextSha256,
      declarationKind: def.declarationKind ?? "UNKNOWN",
      nested: !!def.nested,
      section,
      charStart: spanStart,
      charEnd: spanStart + exactText.length,
      source: identity,
      dependencies,
      embeddedExceptions,
      calculations,
      crossReferences,
      alternativeFormulationGroup: inFamily ? `alt-group:${canonicalTerm}` : `inventory:${def.normalizedTerm}`,
      unusualDraftingFlags,
      semanticTrapFlags,
      provenanceValidated,
    });
    if (!inFamily) inventoryAdded += 1;
  }

  return out;
}
