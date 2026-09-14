/**
 * F-7B.2 - SOURCE-ANCHORED DEFINITION ATTRIBUTION (deterministic, provider-free).
 *
 * Why this exists (docs/phase-3-remediation-f7b2/00-unsafe-fallback-reproduction.json): the F-7A stitcher attributed a
 * model-emitted IRDefinition that matched no planner DEFINITION unit and carried no owned inventory lineage to
 * `shard.ownedUnitKeys[0]` (SHARD_FIRST_UNIT). "The model emitted it from this shard" is not evidence that the
 * definition belongs to the shard's PRIMARY owned source, and in the real five-shard F-7B.1 rerun it let 20 definitions
 * into authoritative IR with no provenance anchor, failing the pre-registered trust gate.
 *
 * This module supplies the ONLY additional proof class the stitcher may use: a definition DECLARATION for the emitted
 * term, deterministically located inside the emitting shard's own PRIMARY owned source text. It reuses the existing
 * structural definition grammar (compiler/structural-definitions.ts - the same "Term" means / "Term": / Term: patterns,
 * quote encodings and normalization the structural index itself uses), so there is no parallel legal parser and no
 * package- or term-specific rule anywhere in it.
 *
 * What it deliberately does NOT do:
 *   - it never looks at read-only cross-shard context, tool-retrieved provisions, or any text outside the shard's owned
 *     units (a definition seen only in retrieved context can never become owned);
 *   - a bare mention of a quoted/capitalized term is not a declaration ("... including Existing Liens", "as defined in
 *     Section 2.01" carry no definitional grammar and never anchor);
 *   - when the same term is declared more than once inside owned source it returns AMBIGUOUS - never the first match.
 */
import { createHash } from "node:crypto";
import { DEFINITION_TERM_QUOTE, detectStructuralDefinitions } from "../structural-definitions";
import { normalizeDefinedTermRef } from "../amendment/chain";
import type { SemanticSourceUnit } from "./shard-types";

export const DEFINITION_SOURCE_ANCHOR_VERSION = "definition-source-anchor.v1";

/** One owned unit's primary source slice - the only text this module is ever allowed to read. */
export interface OwnedUnitSource {
  unitKey: string;
  documentId: string;
  regionId: string;
  /** The unit's own primary text (region-relative slice). */
  text: string;
  /** Region-relative bounds of `text`, used only to tell whether two owned units are physically adjacent. */
  charStart: number;
  charEnd: number;
  /** Absolute document offset of `text[0]`, when the region carries one. */
  absCharStart: number | null;
}

/** Attribution provenance for a definition retained through the primary-source path (stitcher/audit metadata only - not IR). */
export interface DefinitionSourceAnchor {
  documentId: string;
  regionId: string;
  unitKey: string;
  /** Offsets of the declaration within the unit's own primary text. */
  charStart: number;
  charEnd: number;
  /** Absolute document offsets when the region carries an absolute start; null otherwise. */
  absCharStart: number | null;
  absCharEnd: number | null;
  termName: string;
  normalizedTermName: string;
  declarationExcerpt: string;
  declarationTextHash: string;
  method: "UNIQUE_PRIMARY_SOURCE_DECLARATION";
}

export type DefinitionAnchorResult =
  | { status: "ANCHORED"; anchor: DefinitionSourceAnchor }
  | { status: "NOT_DECLARED_IN_OWNED_SOURCE" }
  | { status: "AMBIGUOUS"; candidates: { unitKey: string; charStart: number; charEnd: number }[] };

/** normalizedTerm -> every declaration of it found in the shard's owned primary source. */
export type OwnedDeclarationIndex = Map<string, DefinitionSourceAnchor[]>;

function sha256(s: string): string { return createHash("sha256").update(s).digest("hex"); }

/**
 * Incorporation-by-reference declaration - `"Term" has the meaning assigned to such term in Section X`. This is the
 * fourth generic form the mission's own list names ("Term" has the meaning ...), and it is a real, formal definitional
 * entry: the term is introduced at THIS location and its substance is incorporated from the cited provision. The
 * structural index's own grammar recognises only `means` / `shall mean` / `shall have the meaning`, so this form is
 * added here for ATTRIBUTION ONLY - structural-definitions.ts is deliberately not changed, because adding units there
 * would change planner unit derivation and therefore the frozen shard boundaries/hashes.
 *
 * It reuses the structural index's own quote alternation verbatim (DEFINITION_TERM_QUOTE) and the same term-length
 * bounds, so there is exactly one quote/term grammar in the codebase. A bare mention ("... calculated on a Pro Forma
 * Basis", "including Existing Liens") carries none of this language and never matches.
 */
const INCORPORATION_DECLARATION = new RegExp(`${DEFINITION_TERM_QUOTE}\\s*([^"“”&]{1,100}?)\\s*${DEFINITION_TERM_QUOTE}\\s*(?:has|have)\\s+the\\s+meaning`, "gi");

/**
 * Multi-term declaration - one definitional verb introducing a LIST of quoted terms
 * (`"A," "B" and "C" means ...`, `"X" and "Y" have the meaning ...`). This is a generic drafting form, not a
 * package-specific one: the structural index's grammar anchors on a single quoted term immediately followed by the verb,
 * so every term but the last in such a list is invisible to it. Those terms are genuinely DECLARED at this location in
 * the owned primary text, so for ATTRIBUTION they must be locatable; structural-definitions.ts is still not changed,
 * because new planner units would move the frozen shard boundaries.
 *
 * It reuses the same quote alternation and term-length bound as every other pattern here, and requires at least two
 * quoted terms so it never overlaps the single-term structural grammar. The definitional verb is still mandatory: a run
 * of quoted phrases with no verb after it ("... the terms "Available Amount", "Fixed Amounts" and others") never matches.
 */
const MULTI_TERM_DECLARATION = new RegExp(`((?:${DEFINITION_TERM_QUOTE}\\s*[^"“”&]{1,100}?\\s*${DEFINITION_TERM_QUOTE}\\s*(?:,|;)?\\s*(?:and|or)?\\s*){2,})(?:means|shall\\s+mean|(?:shall\\s+)?(?:has|have)\\s+the\\s+meaning)`, "gi");
const SINGLE_QUOTED_TERM = new RegExp(`${DEFINITION_TERM_QUOTE}\\s*([^"“”&]{1,100}?)\\s*${DEFINITION_TERM_QUOTE}`, "g");

function scanMultiTermDeclarations(text: string): { term: string; charStart: number; charEnd: number }[] {
  const re = new RegExp(MULTI_TERM_DECLARATION.source, MULTI_TERM_DECLARATION.flags);
  const out: { term: string; charStart: number; charEnd: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const listStart = m.index;
    const list = m[1] ?? "";
    const inner = new RegExp(SINGLE_QUOTED_TERM.source, SINGLE_QUOTED_TERM.flags);
    let t: RegExpExecArray | null;
    while ((t = inner.exec(list)) !== null) {
      // a trailing comma/semicolon inside the closing quote ("Term ," ) is punctuation, not part of the term
      const term = (t[1] ?? "").replace(/[,;]\s*$/, "").trim();
      if (term.length >= 1 && term.length <= 100) out.push({ term, charStart: listStart + t.index, charEnd: listStart + t.index + t[0].length });
      if (t.index === inner.lastIndex) inner.lastIndex++;
    }
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

function scanIncorporationDeclarations(text: string): { term: string; charStart: number; charEnd: number }[] {
  const re = new RegExp(INCORPORATION_DECLARATION.source, INCORPORATION_DECLARATION.flags);
  const out: { term: string; charStart: number; charEnd: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const term = (m[1] ?? "").trim();
    if (term.length >= 1 && term.length <= 100) out.push({ term, charStart: m.index, charEnd: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/**
 * Scans each owned unit's primary text once with the existing structural definition grammar and indexes every
 * declaration it finds by normalized term. Deterministic: same units in, same index out.
 */
export function buildOwnedDeclarationIndex(units: OwnedUnitSource[]): OwnedDeclarationIndex {
  const index: OwnedDeclarationIndex = new Map();
  for (const run of contiguousOwnedRuns(units)) {
    const runText = run.map((u) => u.text).join("");
    if (!runText) continue;
    // nodes = [] : this scan is scoped to the shard's own owned text, so the enclosing-node lookup has nothing to add -
    // the owned unit at the declaration's offset IS the structural owner. Only the term and its offsets are used.
    const structural = detectStructuralDefinitions(run[0]!.documentId, runText, []).map((d) => ({ term: d.exactTerm, charStart: d.charStart, charEnd: d.charEnd, excerpt: d.definitionExcerpt }));
    const extra = [...scanIncorporationDeclarations(runText), ...scanMultiTermDeclarations(runText)]
      // a declaration already found by the structural grammar is never double-counted
      .filter((i) => !structural.some((d) => i.charStart < d.charEnd && i.charEnd > d.charStart))
      .map((i) => ({ ...i, excerpt: runText.slice(i.charStart, Math.min(runText.length, i.charStart + 200)) }));
    const seen = new Set<string>();
    for (const d of [...structural, ...extra]) {
      const normalized = normalizeDefinedTermRef(d.term);
      if (!normalized) continue;
      // the same span found by two patterns is ONE declaration, not an ambiguity
      const dedupeKey = `${normalized}@${d.charStart}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const owner = unitAtRunOffset(run, d.charStart);
      if (!owner) continue;
      const anchor: DefinitionSourceAnchor = {
        documentId: owner.unit.documentId,
        regionId: owner.unit.regionId,
        unitKey: owner.unit.unitKey,
        charStart: d.charStart - owner.runOffset,
        charEnd: d.charEnd - owner.runOffset,
        absCharStart: owner.unit.absCharStart === null ? null : owner.unit.absCharStart + (d.charStart - owner.runOffset),
        absCharEnd: owner.unit.absCharStart === null ? null : owner.unit.absCharStart + (d.charEnd - owner.runOffset),
        termName: d.term,
        normalizedTermName: normalized,
        declarationExcerpt: d.excerpt.slice(0, 200),
        declarationTextHash: sha256(runText.slice(d.charStart, d.charEnd)),
        method: "UNIQUE_PRIMARY_SOURCE_DECLARATION",
      };
      index.set(normalized, [...(index.get(normalized) ?? []), anchor]);
    }
  }
  return index;
}

/**
 * Groups the shard's owned units into maximal runs of PHYSICALLY ADJACENT text in one region, so a declaration is still
 * located when the structural index happens to have split it across a unit boundary. This is not a widening of scope:
 * every character of a run is owned primary source of the same shard, and the declaration is still attributed to the one
 * owned unit its own offset falls inside. An isolated unit is simply a run of one, which is the per-unit scan.
 */
function contiguousOwnedRuns(units: OwnedUnitSource[]): OwnedUnitSource[][] {
  const byRegion = new Map<string, OwnedUnitSource[]>();
  for (const u of units) byRegion.set(u.regionId, [...(byRegion.get(u.regionId) ?? []), u]);
  const runs: OwnedUnitSource[][] = [];
  for (const group of byRegion.values()) {
    const sorted = [...group].sort((a, b) => a.charStart - b.charStart || a.charEnd - b.charEnd);
    let current: OwnedUnitSource[] = [];
    for (const u of sorted) {
      const prev = current[current.length - 1];
      if (prev && prev.charEnd === u.charStart) current.push(u);
      else { if (current.length) runs.push(current); current = [u]; }
    }
    if (current.length) runs.push(current);
  }
  return runs;
}

/** Maps an offset in a run's concatenated text back to the owned unit that physically contains it. */
function unitAtRunOffset(run: OwnedUnitSource[], offset: number): { unit: OwnedUnitSource; runOffset: number } | null {
  let cursor = 0;
  for (const unit of run) {
    if (offset >= cursor && offset < cursor + unit.text.length) return { unit, runOffset: cursor };
    cursor += unit.text.length;
  }
  return null;
}

/**
 * The single question the stitcher asks: does the emitting shard's own primary source uniquely declare this term?
 * Exactly one declaration anchors it; none leaves it unattributed; more than one is an explicit ambiguity.
 */
export function locateDefinitionDeclaration(termName: string, index: OwnedDeclarationIndex): DefinitionAnchorResult {
  const key = normalizeDefinedTermRef(termName);
  const found = index.get(key) ?? [];
  if (found.length === 0) return { status: "NOT_DECLARED_IN_OWNED_SOURCE" };
  if (found.length > 1) return { status: "AMBIGUOUS", candidates: found.map((a) => ({ unitKey: a.unitKey, charStart: a.charStart, charEnd: a.charEnd })) };
  return { status: "ANCHORED", anchor: found[0]! };
}

/** Builds the owned-unit source slices for one shard from the plan's units and the resolved region texts. */
export function ownedUnitSources(units: SemanticSourceUnit[], ownedUnitKeys: string[], regionText: (regionId: string) => string | null): OwnedUnitSource[] {
  const out: OwnedUnitSource[] = [];
  for (const key of ownedUnitKeys) {
    const unit = units.find((u) => u.unitKey === key);
    if (!unit) continue;
    const text = regionText(unit.regionId);
    if (text === null) continue;
    out.push({ unitKey: unit.unitKey, documentId: unit.documentId, regionId: unit.regionId, text: text.slice(unit.charStart, unit.charEnd), charStart: unit.charStart, charEnd: unit.charEnd, absCharStart: unit.absCharStart });
  }
  return out;
}
