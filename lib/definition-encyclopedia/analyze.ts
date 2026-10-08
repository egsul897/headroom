/**
 * Deterministic analytics over extracted definition text.
 * Flags are observational heuristics — not legal conclusions.
 */

import type { DetectedDefinition } from "@/lib/contract-model/compiler/structural-definitions";
import { canonicalFamilyFor } from "./priority-terms";
import type {
  AmendmentChange,
  AlternativeFormulation,
  CalculationSignal,
  CrossReference,
  DefinitionExample,
  DependencyGraphEdge,
  DependencyRef,
  EmbeddedException,
  SemanticTrapFinding,
  UnusualDraftingFinding,
} from "./schema";

export function inferSectionLabel(text: string, charStart: number): string | null {
  const window = text.slice(Math.max(0, charStart - 2500), charStart);
  const patterns = [
    /\b(?:Section|SECTION)\s+(\d+\.\d+)\b/g,
    /\b(?:Article|ARTICLE)\s+([IVXLC]+|\d+)\b/g,
    /\b(1\.01)\b/g,
  ];
  let last: string | null = null;
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(window)) !== null) {
      last = m[1] ? (m[0].toLowerCase().includes("article") ? `Article ${m[1]}` : m[1]) : null;
    }
  }
  // Prefer an explicit 1.01 / Definitions heading near the declaration.
  if (/\bDefined Terms\b|\bDefinitions\b/i.test(window.slice(-400))) {
    return last ?? "1.01";
  }
  return last;
}

export function detectDependencies(exactText: string, selfNormalized: string, universe: Set<string>): DependencyRef[] {
  // Longest-first scan so "Consolidated Net Income" wins over "Income".
  const candidates = [...universe].filter((t) => t !== selfNormalized && t.length >= 5).sort((a, b) => b.length - a.length);
  const hits: DependencyRef[] = [];
  const occupied: Array<[number, number]> = [];
  const lower = exactText.toLowerCase();

  for (const term of candidates) {
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(term, from);
      if (idx < 0) break;
      const end = idx + term.length;
      // Word-ish boundary check
      const before = idx === 0 ? " " : lower[idx - 1]!;
      const after = end >= lower.length ? " " : lower[end]!;
      if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) {
        from = idx + 1;
        continue;
      }
      if (occupied.some(([a, b]) => idx < b && end > a)) {
        from = idx + 1;
        continue;
      }
      occupied.push([idx, end]);
      hits.push({
        exactTerm: exactText.slice(idx, end),
        normalizedTerm: term,
        canonicalFamily: canonicalFamilyFor(term),
        mentionOffset: idx,
        mentionLength: term.length,
      });
      from = end;
    }
  }
  return hits.sort((a, b) => a.mentionOffset - b.mentionOffset);
}

const EXCEPTION_PATTERNS: Array<{ kind: EmbeddedException["kind"]; re: RegExp }> = [
  { kind: "PROVIDED_THAT", re: /\bprovided\s+that\b/gi },
  { kind: "EXCEPT_THAT", re: /\bexcept\s+that\b/gi },
  { kind: "OTHER_THAN", re: /\bother\s+than\b/gi },
  { kind: "EXCLUDING", re: /\bexcluding\b/gi },
  { kind: "SUBJECT_TO", re: /\bsubject\s+to\b/gi },
  { kind: "SO_LONG_AS", re: /\bso\s+long\s+as\b/gi },
  { kind: "UNLESS", re: /\bunless\b/gi },
];

export function detectEmbeddedExceptions(exactText: string): EmbeddedException[] {
  const out: EmbeddedException[] = [];
  for (const { kind, re } of EXCEPTION_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(exactText)) !== null) {
      const start = m.index;
      out.push({
        kind,
        excerpt: exactText.slice(start, Math.min(exactText.length, start + 160)).replace(/\s+/g, " ").trim(),
        offset: start,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

const CALC_PATTERNS: Array<{ kind: CalculationSignal["kind"]; re: RegExp }> = [
  { kind: "RATIO_OF", re: /\bratio\s+of\b/gi },
  { kind: "SUM_OF", re: /\bsum\s+of\b/gi },
  { kind: "GREATER_OF", re: /\bgreater\s+of\b/gi },
  { kind: "LESSER_OF", re: /\blesser\s+of\b/gi },
  { kind: "PLUS_WITHOUT_DUPLICATION", re: /\bwithout\s+duplication\b/gi },
  { kind: "PRO_FORMA", re: /\b[Pp]ro\s+[Ff]orma\b/g },
  { kind: "PERCENT_OF", re: /\b\d+(?:\.\d+)?\s*%\s+of\b/g },
  { kind: "MINUS", re: /\bminus\b/gi },
];

export function detectCalculations(exactText: string): CalculationSignal[] {
  const out: CalculationSignal[] = [];
  for (const { kind, re } of CALC_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(exactText)) !== null) {
      out.push({
        kind,
        excerpt: exactText.slice(m.index, Math.min(exactText.length, m.index + 120)).replace(/\s+/g, " ").trim(),
        offset: m.index,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

export function detectCrossReferences(exactText: string): CrossReference[] {
  const out: CrossReference[] = [];
  const patterns: Array<{ kind: CrossReference["kind"]; re: RegExp }> = [
    { kind: "SECTION", re: /\bSections?\s+\d+(?:\.\d+)+(?:\([a-z0-9]+\))*/gi },
    { kind: "ARTICLE", re: /\bArticles?\s+(?:[IVXLC]+|\d+)/gi },
    { kind: "SCHEDULE", re: /\bSchedules?\s+[0-9A-Za-z.-]+/gi },
    { kind: "EXHIBIT", re: /\bExhibits?\s+[0-9A-Za-z.-]+/gi },
    { kind: "CLAUSE", re: /\bclauses?\s+\([a-z0-9]+\)/gi },
    { kind: "DEFINITION", re: /\bin\s+the\s+definition\s+of\s+[“"][^”"]+[”"]/gi },
  ];
  for (const { kind, re } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(exactText)) !== null) {
      out.push({
        kind,
        ref: m[0]!.replace(/\s+/g, " ").trim(),
        excerpt: exactText.slice(Math.max(0, m.index - 20), Math.min(exactText.length, m.index + m[0]!.length + 40)).replace(/\s+/g, " ").trim(),
        offset: m.index,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

export function flagUnusualDrafting(def: DetectedDefinition, exactText: string): string[] {
  const flags: string[] = [];
  if (def.declarationKind === "FORWARDING") flags.push("FORWARDING_DEFINITION");
  if (def.declarationKind === "QUOTED_COLON") flags.push("COLON_STYLE_DEFINITION");
  if (def.declarationKind === "UNQUOTED_COLON") flags.push("UNQUOTED_COLON_DEFINITION");
  if (/\b(?:means|shall mean)\b[\s\S]{0,80}\b(?:means|shall mean)\b/i.test(exactText)) {
    flags.push("NESTED_MEANS_INSIDE_BODY");
  }
  if (/\bfor\s+purposes\s+of\b/i.test(exactText) && /\bonly\b/i.test(exactText)) {
    flags.push("PURPOSE_LIMITED_DEFINITION");
  }
  if (/\bat\s+the\s+option\s+of\s+the\s+Borrower\b/i.test(exactText) || /\bBorrower\s+may\s+(?:elect|choose|determine)\b/i.test(exactText)) {
    flags.push("BORROWER_ELECTION_INSIDE_DEFINITION");
  }
  if (/\brun-?rate\b/i.test(exactText)) flags.push("RUN_RATE_ADJUSTMENT");
  if (/\badd-?backs?\b|\badded\s+back\b/i.test(exactText) && exactText.length > 2000) {
    flags.push("LONG_ADDBACK_STACK");
  }
  if (/\b(?:greater|lesser)\s+of\b[\s\S]{0,120}\b(?:and|or)\b[\s\S]{0,80}%/i.test(exactText)) {
    flags.push("GROWING_BASKET_FORMULA");
  }
  if (/\bNot\s+Otherwise\s+Applied\b/i.test(exactText)) flags.push("NOT_OTHERWISE_APPLIED_GATE");
  return flags;
}

export function flagSemanticTraps(def: DetectedDefinition, exactText: string, canonicalTerm: string): string[] {
  const flags: string[] = [];
  if (def.declarationKind === "FORWARDING") {
    flags.push("TRAP_FORWARDING_BODY_ELSEWHERE");
  }
  if (canonicalTerm === "Default" && /\bEvent\s+of\s+Default\b/i.test(exactText)) {
    flags.push("TRAP_DEFAULT_INCLUDES_OR_PRECURSORS_EOD");
  }
  if (canonicalTerm === "Event of Default" && /\bnotice\b/i.test(exactText) && /\bgrace|cure|lapse\b/i.test(exactText)) {
    flags.push("TRAP_EOD_NOTICE_AND_GRACE");
  }
  if (canonicalTerm === "Consolidated EBITDA" && /\bminus\b/i.test(exactText) && /\bnon-?cash\b/i.test(exactText)) {
    flags.push("TRAP_EBITDA_NONCASH_CLAWBACK");
  }
  if (canonicalTerm === "Available Amount" && /\bRetained\s+Excess\s+Cash\s+Flow\b|\bExcess\s+Cash\s+Flow\b/i.test(exactText)) {
    flags.push("TRAP_AVAILABLE_AMOUNT_ECF_RETENTION_LINK");
  }
  if (canonicalTerm === "Unrestricted Subsidiary" && /\bAvailable\s+Amount\b|\bInvestment\b/i.test(exactText)) {
    flags.push("TRAP_UNRESTRICTED_DESIGNATION_COSTS_CAPACITY");
  }
  if (canonicalTerm === "Permitted Refinancing Indebtedness" && /\bWeighted\s+Average\s+Life\b/i.test(exactText)) {
    flags.push("TRAP_REFINANCING_WAL_CONSTRAINT");
  }
  if (canonicalTerm === "Incremental Amount" || canonicalTerm === "First Lien Net Leverage Ratio") {
    if (/\bratio\b/i.test(exactText) && /\bfree\s+and\s+clear\b|\bFixed\s+Incremental\b/i.test(exactText)) {
      flags.push("TRAP_INCREMENTAL_FREE_AND_CLEAR_VS_RATIO");
    }
  }
  if (/\bwithout\s+duplication\b/i.test(exactText) && /\bplus\b/i.test(exactText) && /\bminus\b/i.test(exactText)) {
    flags.push("TRAP_PLUS_MINUS_WITHOUT_DUPLICATION");
  }
  if (/\bon\s+a\s+Pro\s+Forma\s+Basis\b/i.test(exactText)) {
    flags.push("TRAP_PRO_FORMA_BASIS_UNDEFINED_HERE");
  }
  // Exact-term mismatch vs family label (e.g. "EBITDA" under Consolidated EBITDA family)
  if (def.normalizedTerm !== canonicalTerm.toLowerCase()) {
    flags.push("TRAP_FAMILY_LABEL_NOT_EXACT_TERM");
  }
  return flags;
}

export function buildDependencyGraph(examples: DefinitionExample[]): {
  nodes: Array<{ exampleId: string; normalizedTerm: string; canonicalTerm: string }>;
  edges: DependencyGraphEdge[];
} {
  const bySourceAndTerm = new Map<string, DefinitionExample>();
  for (const ex of examples) {
    bySourceAndTerm.set(`${ex.source.sourceId}::${ex.normalizedTerm}`, ex);
  }
  const nodes = examples.map((ex) => ({
    exampleId: ex.exampleId,
    normalizedTerm: ex.normalizedTerm,
    canonicalTerm: ex.canonicalTerm,
  }));
  const edges: DependencyGraphEdge[] = [];
  for (const ex of examples) {
    const seen = new Set<string>();
    for (const dep of ex.dependencies) {
      if (!dep.canonicalFamily && !examples.some((e) => e.normalizedTerm === dep.normalizedTerm)) {
        // Keep edges only when the dependency is itself a priority example somewhere,
        // or when it resolves inside the same source priority set.
      }
      const key = `${ex.exampleId}->${dep.normalizedTerm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sameSource = bySourceAndTerm.get(`${ex.source.sourceId}::${dep.normalizedTerm}`);
      edges.push({
        fromExampleId: ex.exampleId,
        toNormalizedTerm: dep.normalizedTerm,
        toExampleId: sameSource?.exampleId ?? null,
        canonicalFamily: dep.canonicalFamily,
      });
    }
  }
  return { nodes, edges };
}

export function buildAlternativeFormulations(examples: DefinitionExample[]): AlternativeFormulation[] {
  const byGroup = new Map<string, DefinitionExample[]>();
  for (const ex of examples) {
    const list = byGroup.get(ex.alternativeFormulationGroup) ?? [];
    list.push(ex);
    byGroup.set(ex.alternativeFormulationGroup, list);
  }
  const out: AlternativeFormulation[] = [];
  for (const [groupId, list] of byGroup) {
    const exactTerms = [...new Set(list.map((e) => e.exactTerm))];
    out.push({
      groupId,
      canonicalTerm: list[0]!.canonicalTerm,
      exampleIds: list.map((e) => e.exampleId),
      exactTerms,
      sourceIds: [...new Set(list.map((e) => e.source.sourceId))],
      equivalenceClaim: false,
      note:
        exactTerms.length > 1
          ? `Grouped ${exactTerms.length} distinct exact labels under "${list[0]!.canonicalTerm}" for comparison only; do not treat as legally equivalent.`
          : `Single exact label "${exactTerms[0]}" across ${list.length} independently sourced example(s); instrument-level text still may differ.`,
    });
  }
  return out.sort((a, b) => a.canonicalTerm.localeCompare(b.canonicalTerm));
}

export function collectUnusualDrafting(examples: DefinitionExample[]): UnusualDraftingFinding[] {
  const out: UnusualDraftingFinding[] = [];
  for (const ex of examples) {
    for (const flag of ex.unusualDraftingFlags) {
      out.push({
        findingId: `unusual:${ex.exampleId}:${flag}`,
        exampleId: ex.exampleId,
        flag,
        detail: `Observational drafting flag on ${ex.exactTerm} in ${ex.source.sourceId}.`,
        excerpt: ex.exactText.slice(0, 220).replace(/\s+/g, " ").trim(),
      });
    }
  }
  return out;
}

export function collectSemanticTraps(examples: DefinitionExample[]): SemanticTrapFinding[] {
  const out: SemanticTrapFinding[] = [];
  for (const ex of examples) {
    for (const flag of ex.semanticTrapFlags) {
      out.push({
        trapId: `trap:${ex.exampleId}:${flag}`,
        exampleId: ex.exampleId,
        flag,
        detail: `Semantic trap signal on ${ex.exactTerm} (${ex.canonicalTerm}) in ${ex.source.agreementVersion}.`,
        excerpt: ex.exactText.slice(0, 220).replace(/\s+/g, " ").trim(),
      });
    }
  }
  return out;
}

/**
 * Detect where the same normalized term's definition text changes across
 * agreement versions within a package (amendment / restatement lineage).
 */
export function detectAmendmentChanges(examples: DefinitionExample[]): AmendmentChange[] {
  const byPackageTerm = new Map<string, DefinitionExample[]>();
  for (const ex of examples) {
    const key = `${ex.source.packageKey}::${ex.normalizedTerm}`;
    const list = byPackageTerm.get(key) ?? [];
    list.push(ex);
    byPackageTerm.set(key, list);
  }

  const versionOrder = (v: string): string => v;
  const changes: AmendmentChange[] = [];

  for (const [, list] of byPackageTerm) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) =>
      versionOrder(a.source.agreementVersion).localeCompare(versionOrder(b.source.agreementVersion)) ||
      a.source.sourceId.localeCompare(b.source.sourceId),
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const before = sorted[i]!;
      const after = sorted[i + 1]!;
      if (before.source.sourceId === after.source.sourceId) continue;
      const textChanged = before.exactTextSha256 !== after.exactTextSha256;
      const lenDelta = after.exactText.length - before.exactText.length;
      changes.push({
        changeId: `amd:${before.exampleId}->${after.exampleId}`,
        packageKey: before.source.packageKey,
        canonicalTerm: before.canonicalTerm,
        normalizedTerm: before.normalizedTerm,
        beforeExampleId: before.exampleId,
        afterExampleId: after.exampleId,
        beforeAgreementVersion: before.source.agreementVersion,
        afterAgreementVersion: after.source.agreementVersion,
        textChanged,
        beforeTextSha256: before.exactTextSha256,
        afterTextSha256: after.exactTextSha256,
        observation: textChanged
          ? `Definition text changed between versions (exactText length delta ${lenDelta >= 0 ? "+" : ""}${lenDelta} chars). Not an interpretation of economic effect.`
          : "Same normalized term appears in both versions with identical exactText SHA-256 (restatement without textual change in the captured span).",
      });
    }
  }
  return changes;
}
