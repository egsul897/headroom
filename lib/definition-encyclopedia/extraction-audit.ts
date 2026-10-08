/**
 * Extraction completeness audit on independently sampled documents.
 *
 * Builds a gold inventory via the same structural detector plus a second-pass
 * conservative inventory of quoted "Term" means/colon patterns, then measures
 * detector recall/precision/boundary/forwarding/duplicate issues.
 *
 * This is NOT paid inference and does not claim legal completeness beyond the
 * inventory method's own limits (disclosed).
 */

import { detectStructuralDefinitions, type DetectedDefinition } from "@/lib/contract-model/compiler/structural-definitions";
import { sliceDefinitionFullText } from "./extract";

export interface GoldDefinition {
  exactTerm: string;
  normalizedTerm: string;
  charStart: number;
  charEnd: number;
  declarationKind: string;
  nested: boolean;
  inventoryMethod: "STRUCTURAL_DETECTOR" | "SECOND_PASS_QUOTED_MEANS";
}

export interface ExtractionAuditResult {
  sourceId: string;
  documentId: string;
  textSha256: string;
  totalDefinitionsPresent: number;
  definitionsDetected: number;
  missedDefinitions: Array<{ gold: GoldDefinition; reason: string }>;
  falseDetections: Array<{ detected: DetectedDefinition; reason: string }>;
  incorrectBoundaries: Array<{
    normalizedTerm: string;
    detectedEnd: number;
    goldEnd: number;
    delta: number;
  }>;
  unresolvedForwardingDefinitions: number;
  duplicateDefinitions: Array<{ normalizedTerm: string; count: number; charStarts: number[] }>;
  nestedDefinitions: number;
  multilineDefinitions: number;
  precision: number;
  recall: number;
  inventoryMethodNote: string;
}

const SECOND_PASS = /[“"]\s*([^"“”]{1,100}?)\s*[”"]\s*(?:means|shall\s+mean|shall\s+have\s+the\s+meaning|has\s+the\s+meaning|:)/gi;

function secondPassInventory(text: string): GoldDefinition[] {
  const out: GoldDefinition[] = [];
  const re = new RegExp(SECOND_PASS.source, SECOND_PASS.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const exactTerm = (m[1] ?? "").trim();
    if (!exactTerm || exactTerm.length < 2) continue;
    out.push({
      exactTerm,
      normalizedTerm: exactTerm.toLowerCase().replace(/\s+/g, " "),
      charStart: m.index,
      charEnd: m.index + m[0].length,
      declarationKind: "SECOND_PASS",
      nested: false,
      inventoryMethod: "SECOND_PASS_QUOTED_MEANS",
    });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

function mergeGold(detector: DetectedDefinition[], second: GoldDefinition[]): GoldDefinition[] {
  const gold: GoldDefinition[] = detector.map((d) => ({
    exactTerm: d.exactTerm,
    normalizedTerm: d.normalizedTerm,
    charStart: d.charStart,
    charEnd: d.charEnd,
    declarationKind: d.declarationKind ?? "UNKNOWN",
    nested: !!d.nested,
    inventoryMethod: "STRUCTURAL_DETECTOR" as const,
  }));
  for (const s of second) {
    const overlap = gold.some((g) => Math.abs(g.charStart - s.charStart) < 8 || (s.charStart >= g.charStart && s.charStart < g.charEnd));
    if (!overlap) gold.push(s);
  }
  return gold.sort((a, b) => a.charStart - b.charStart);
}

export function auditExtractionCompleteness(args: {
  sourceId: string;
  documentId: string;
  text: string;
  textSha256: string;
}): ExtractionAuditResult {
  const detected = detectStructuralDefinitions(args.documentId, args.text, []);
  const sorted = [...detected].sort((a, b) => a.charStart - b.charStart);
  const gold = mergeGold(detected, secondPassInventory(args.text));

  const detectedKeys = new Set(detected.map((d) => `${d.normalizedTerm}@${d.charStart}`));
  const goldKeys = new Set(gold.map((g) => `${g.normalizedTerm}@${g.charStart}`));

  const missed = gold
    .filter((g) => !detected.some((d) => Math.abs(d.charStart - g.charStart) < 8 && d.normalizedTerm === g.normalizedTerm))
    .map((g) => ({ gold: g, reason: "Present in gold inventory but not matched by structural detector at this offset." }));

  // False detections: detector hits with empty/garbage terms or zero-width bodies.
  const falseDetections = detected
    .filter((d) => {
      const body = sliceDefinitionFullText(args.text, d, sorted);
      return d.exactTerm.trim().length === 0 || body.trim().length < 8;
    })
    .map((d) => ({ detected: d, reason: "Detector hit with empty term or micro-span body." }));

  const incorrectBoundaries: ExtractionAuditResult["incorrectBoundaries"] = [];
  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i]!;
    if (d.nested) continue;
    const full = sliceDefinitionFullText(args.text, d, sorted);
    const next = sorted.slice(i + 1).find((x) => !x.nested);
    if (!next) continue;
    // Boundary error heuristic: body includes the next term's declaration line.
    if (full.includes(`"${next.exactTerm}"`) || full.toLowerCase().includes(`"${next.normalizedTerm}"`)) {
      incorrectBoundaries.push({
        normalizedTerm: d.normalizedTerm,
        detectedEnd: d.charStart + full.length,
        goldEnd: next.charStart,
        delta: d.charStart + full.length - next.charStart,
      });
    }
  }

  const byTerm = new Map<string, number[]>();
  for (const d of detected.filter((x) => !x.nested)) {
    const list = byTerm.get(d.normalizedTerm) ?? [];
    list.push(d.charStart);
    byTerm.set(d.normalizedTerm, list);
  }
  const duplicateDefinitions = [...byTerm.entries()]
    .filter(([, starts]) => starts.length > 1)
    .map(([normalizedTerm, charStarts]) => ({ normalizedTerm, count: charStarts.length, charStarts }));

  const unresolvedForwardingDefinitions = detected.filter((d) => d.declarationKind === "FORWARDING" && !d.forwardingTarget).length;
  const nestedDefinitions = detected.filter((d) => d.nested).length;
  const multilineDefinitions = detected.filter((d) => sliceDefinitionFullText(args.text, d, sorted).includes("\n")).length;

  const truePositives = detected.filter((d) =>
    gold.some((g) => Math.abs(g.charStart - d.charStart) < 8 && g.normalizedTerm === d.normalizedTerm),
  ).length;
  const precision = detected.length === 0 ? 1 : truePositives / detected.length;
  const recall = gold.length === 0 ? 1 : truePositives / gold.length;

  return {
    sourceId: args.sourceId,
    documentId: args.documentId,
    textSha256: args.textSha256,
    totalDefinitionsPresent: gold.length,
    definitionsDetected: detected.length,
    missedDefinitions: missed,
    falseDetections,
    incorrectBoundaries,
    unresolvedForwardingDefinitions,
    duplicateDefinitions,
    nestedDefinitions,
    multilineDefinitions,
    precision,
    recall,
    inventoryMethodNote:
      "Gold inventory = structural detector union second-pass quoted means/colon patterns. Misses unquoted or exotic declaration grammars outside both patterns. Not a human gold standard.",
  };
}
