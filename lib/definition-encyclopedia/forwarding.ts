/**
 * Forwarding-definition resolution.
 *
 * A FORWARDING declaration (e.g. “Available Amount has the meaning assigned
 * to such term in Section 6.08(a)(3)”) is NOT a complete semantic definition.
 * Capacity must never be calculated from the forwarding stub alone.
 */

import type { DetectedDefinition, DefinitionForwardingTarget } from "@/lib/contract-model/compiler/structural-definitions";
import { detectStructuralDefinitions } from "@/lib/contract-model/compiler/structural-definitions";
import { sliceDefinitionFullText } from "./extract";

export type ForwardingResolutionStatus =
  | "RESOLVED_TO_SECTION_SPAN"
  | "RESOLVED_TO_DEFINITION"
  | "RESOLVED_TO_PREAMBLE_MARKER"
  | "UNRESOLVED_SECTION_NOT_FOUND"
  | "UNRESOLVED_DEFINITION_NOT_FOUND"
  | "UNRESOLVED_NO_TARGET"
  | "NOT_FORWARDING";

export interface ForwardingResolution {
  exampleId?: string;
  exactTerm: string;
  normalizedTerm: string;
  sourceId: string;
  documentId: string;
  agreementVersion: string;
  originalDeclarationText: string;
  originalCharStart: number;
  originalCharEnd: number;
  forwardingTarget: DefinitionForwardingTarget | null;
  status: ForwardingResolutionStatus;
  /** Referenced provision text when a section/definition target was located. */
  referencedProvisionText: string | null;
  referencedCharStart: number | null;
  referencedCharEnd: number | null;
  dependencyPath: string[];
  /** Explicit legal-safety flag — never compute capacity from forwarding alone. */
  capacityCalculationAllowed: false;
  notes: string[];
}

function findSectionSpan(text: string, sectionRef: string): { start: number; end: number; excerpt: string } | null {
  // Tolerate "6.08(a)(3)", "Section 6.08(a)(3)", optional spaces.
  const escaped = sectionRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\(/g, "\\s*\\(").replace(/\\\)/g, "\\s*\\)");
  const patterns = [
    new RegExp(`(?:Section|SECTION|§)\\s*${escaped}\\b`, "i"),
    new RegExp(`(?:^|\\n)\\s*${escaped}\\b`, "m"),
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const start = m.index;
    // Bound to a reasonable provision window or next section-ish boundary.
    const rest = text.slice(start);
    const next = rest.search(/\n(?:Section|SECTION|ARTICLE|Article)\s+\d+/);
    const end = start + (next > 0 ? Math.min(next, 12000) : Math.min(rest.length, 12000));
    return { start, end, excerpt: text.slice(start, end) };
  }
  return null;
}

export function resolveForwardingDefinition(args: {
  def: DetectedDefinition;
  text: string;
  allDefsSorted: DetectedDefinition[];
  sourceId: string;
  agreementVersion: string;
  exampleId?: string;
}): ForwardingResolution {
  const { def, text, allDefsSorted, sourceId, agreementVersion, exampleId } = args;
  const originalDeclarationText = sliceDefinitionFullText(text, def, allDefsSorted).trimEnd();
  const base = {
    exampleId,
    exactTerm: def.exactTerm.replace(/\s+/g, " ").trim(),
    normalizedTerm: def.normalizedTerm,
    sourceId,
    documentId: def.documentId,
    agreementVersion,
    originalDeclarationText,
    originalCharStart: def.charStart,
    originalCharEnd: def.charStart + originalDeclarationText.length,
    forwardingTarget: def.forwardingTarget ?? null,
    capacityCalculationAllowed: false as const,
  };

  if (def.declarationKind !== "FORWARDING" || !def.forwardingTarget) {
    return {
      ...base,
      status: def.declarationKind === "FORWARDING" ? "UNRESOLVED_NO_TARGET" : "NOT_FORWARDING",
      referencedProvisionText: null,
      referencedCharStart: null,
      referencedCharEnd: null,
      dependencyPath: [def.normalizedTerm],
      notes:
        def.declarationKind === "FORWARDING"
          ? ["FORWARDING declaration without a parseable target — unresolved."]
          : ["Not a forwarding definition."],
    };
  }

  const target = def.forwardingTarget;
  const path = [def.normalizedTerm, `${target.kind}:${target.ref}`];

  if (target.kind === "SECTION") {
    const span = findSectionSpan(text, target.ref);
    if (!span) {
      return {
        ...base,
        status: "UNRESOLVED_SECTION_NOT_FOUND",
        referencedProvisionText: null,
        referencedCharStart: null,
        referencedCharEnd: null,
        dependencyPath: path,
        notes: [
          `Forwarding target Section ${target.ref} was not located in this document text.`,
          "Do not calculate capacity from the forwarding stub alone.",
        ],
      };
    }
    return {
      ...base,
      status: "RESOLVED_TO_SECTION_SPAN",
      referencedProvisionText: span.excerpt,
      referencedCharStart: span.start,
      referencedCharEnd: span.end,
      dependencyPath: path,
      notes: [
        `Located Section ${target.ref} span (${span.end - span.start} chars).`,
        "Referenced provision preserved; capacity calculation still forbidden from forwarding alone.",
      ],
    };
  }

  if (target.kind === "DEFINITION") {
    const norm = target.ref.toLowerCase().replace(/\s+/g, " ").trim();
    const hit = allDefsSorted.find((d) => d.normalizedTerm === norm && !d.nested);
    if (!hit) {
      return {
        ...base,
        status: "UNRESOLVED_DEFINITION_NOT_FOUND",
        referencedProvisionText: null,
        referencedCharStart: null,
        referencedCharEnd: null,
        dependencyPath: path,
        notes: [`Forwarding target definition "${target.ref}" not found in this document.`],
      };
    }
    const body = sliceDefinitionFullText(text, hit, allDefsSorted).trimEnd();
    return {
      ...base,
      status: "RESOLVED_TO_DEFINITION",
      referencedProvisionText: body,
      referencedCharStart: hit.charStart,
      referencedCharEnd: hit.charStart + body.length,
      dependencyPath: [...path, hit.normalizedTerm],
      notes: [
        `Resolved to definition "${hit.exactTerm.replace(/\s+/g, " ")}" (${body.length} chars).`,
        "Do not calculate capacity from the forwarding stub alone.",
      ],
    };
  }

  // PREAMBLE
  return {
    ...base,
    status: "RESOLVED_TO_PREAMBLE_MARKER",
    referencedProvisionText: null,
    referencedCharStart: null,
    referencedCharEnd: null,
    dependencyPath: path,
    notes: [`Forwarding points to ${target.ref}; preamble/recitals body not auto-extracted.`, "Unresolved as operative capacity source."],
  };
}

export function resolveAllForwardingInDocument(args: {
  text: string;
  documentId: string;
  sourceId: string;
  agreementVersion: string;
}): ForwardingResolution[] {
  const defs = detectStructuralDefinitions(args.documentId, args.text, []);
  const sorted = [...defs].sort((a, b) => a.charStart - b.charStart);
  return sorted
    .filter((d) => !d.nested && d.declarationKind === "FORWARDING")
    .map((d) =>
      resolveForwardingDefinition({
        def: d,
        text: args.text,
        allDefsSorted: sorted,
        sourceId: args.sourceId,
        agreementVersion: args.agreementVersion,
      }),
    );
}
