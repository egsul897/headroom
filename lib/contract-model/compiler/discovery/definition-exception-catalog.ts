/**
 * Issuer-agnostic deterministic discovery of definition-based exception catalogs.
 *
 * Many credit agreements express negative covenants as one-line prohibitions
 * ("no Debt other than Permitted Debt") with the operative baskets living in a
 * lettered definition. This module finds those catalogs and emits one
 * DiscoveredCandidate per enumerated clause plus a parent DEFINITIONAL candidate,
 * without any issuer-, ticker-, or provision-id hardcoding.
 *
 * Reuses splitEnumeratedItems from semantic-coverage (existing capability).
 * Never invents permissions or executable capacity.
 */
import { createHash } from "node:crypto";
import type { CovenantFamily } from "@prisma/client";
import type { StructuralIndex } from "../structural-index";
import type { DetectedDefinition } from "../structural-definitions";
import type { DiscoveredCandidate, DiscoveryRole } from "./types";
import { DISCOVERY_PIPELINE_VERSION } from "./pipeline";

export const DEFINITION_EXCEPTION_CATALOG_VERSION = "definition-exception-catalog.v1";

const PERMITTED_TERM_RE = /^Permitted\s+[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*$/;
const OTHER_THAN_PERMITTED_RE =
  /\b(?:other\s+than|except(?:\s+for)?|excluding)\s+(?:any\s+)?(Permitted\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\b/gi;
// Allow optional curly/straight quotes and internal spaces: definition of " Permitted Debt "
const CLAUSE_OF_DEF_RE =
  /\bclause\s*\(([a-z0-9]+)\)\s+of\s+the\s+definition\s+of\s+[“"']?\s*(Permitted\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s*[”"']?/gi;

export type ExceptionCatalogSupportStatus =
  | "SUPPORTED_STRUCTURE"
  | "PARTIAL_STRUCTURE"
  | "AMBIGUOUS"
  | "UNSUPPORTED_SEMANTICS";

export interface ExceptionCatalogClause {
  marker: string;
  charStartInDefinition: number;
  charEndInDefinition: number;
  text: string;
  /** Absolute offsets into the document text when available. */
  documentCharStart: number | null;
  documentCharEnd: number | null;
}

export interface ExceptionCatalogDiscovery {
  documentId: string;
  termExact: string;
  termNormalized: string;
  definitionNodeId: string | null;
  definitionCharStart: number | null;
  definitionCharEnd: number | null;
  chapeauText: string;
  clauses: ExceptionCatalogClause[];
  referencedFromProhibitionRefs: string[];
  supportStatus: ExceptionCatalogSupportStatus;
  candidates: DiscoveredCandidate[];
  /** Cross-links from clause text to other Permitted* definition clauses. */
  crossDefinitionLinks: {
    fromMarker: string;
    toTerm: string;
    toMarker: string;
    excerpt: string;
  }[];
}

function sha24(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 24);
}

function normalizeTerm(term: string): string {
  return term.replace(/\s+/g, " ").trim().toLowerCase();
}

function familyForTerm(term: string): CovenantFamily[] {
  const t = term.toLowerCase();
  if (/\b(debt|indebtedness)\b/.test(t)) return ["INDEBTEDNESS"];
  if (/\bliens?\b/.test(t)) return ["LIENS"];
  if (/\binvestments?\b/.test(t)) return ["INVESTMENTS"];
  if (/\b(restricted\s+payments?|distributions?)\b/.test(t)) return ["RESTRICTED_PAYMENTS"];
  return [];
}

function roleForClause(text: string): DiscoveryRole {
  if (/\b(?:ratio|leverage|coverage)\b/i.test(text)) return "RATIO_BASED_PERMISSION";
  if (/\b(?:aggregate|combined|shared)\b/i.test(text) && /\$|\d+%|percent/i.test(text)) return "SHARED_CAP";
  if (/\brefinanc/i.test(text)) return "REFINANCING_PERMISSION";
  return "BASKET";
}

function makeCandidate(args: {
  documentId: string;
  discoveryKey: string;
  structuralNodeIds: string[];
  structuralNodeKeys: string[];
  normalizedSourceRef: string;
  families: CovenantFamily[];
  role: DiscoveryRole;
  description: string;
  evidenceSignals: string[];
  multipleRulesLikely: boolean;
  definedTermDependencyLikely: boolean;
  sourceCitation: string;
}): DiscoveredCandidate {
  return {
    discoveryId: sha24(`${DEFINITION_EXCEPTION_CATALOG_VERSION}|${args.discoveryKey}`),
    documentId: args.documentId,
    structuralNodeKeys: args.structuralNodeKeys,
    structuralNodeIds: args.structuralNodeIds,
    normalizedSourceRef: args.normalizedSourceRef,
    families: args.families,
    role: args.role,
    roleRaw: args.role,
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: args.families,
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: args.description,
    multipleRulesLikely: args.multipleRulesLikely,
    definedTermDependencyLikely: args.definedTermDependencyLikely,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: args.evidenceSignals,
    reviewStatus: "NEEDS_REVIEW",
    confidence: null,
    sourceCitation: args.sourceCitation,
    discoveryRunVersion: `${DISCOVERY_PIPELINE_VERSION}+${DEFINITION_EXCEPTION_CATALOG_VERSION}`,
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    supersessionReason: "definition-exception-catalog does not assert operative currency; amendment supersession not applied",
  };
}

function findProhibitionRefs(documentText: string, termExact: string): string[] {
  const refs: string[] = [];
  const re = new RegExp(
    `\\b(?:other\\s+than|except(?:\\s+for)?)\\s+(?:any\\s+)?${termExact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "gi",
  );
  if (re.test(documentText)) refs.push(`prohibition→${termExact}`);
  // Also generic capture for any Permitted* referenced this way near section numbers.
  OTHER_THAN_PERMITTED_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OTHER_THAN_PERMITTED_RE.exec(documentText)) !== null) {
    if (normalizeTerm(m[1]!) === normalizeTerm(termExact)) {
      // Try to find a nearby section heading of form "10.4 Debt"
      const windowStart = Math.max(0, m.index - 400);
      const window = documentText.slice(windowStart, m.index + m[0].length);
      const secMatches = [...window.matchAll(/(\d+\.\d+)\s+[A-Z][A-Za-z ]{0,40}/g)];
      const sec = secMatches.length > 0 ? secMatches[secMatches.length - 1]! : null;
      refs.push(sec ? `§${sec[1]}→${termExact}` : `text→${termExact}`);
    }
  }
  return [...new Set(refs)];
}

/**
 * Split a Permitted* definition body into top-level lettered clauses only.
 * Markers must sit at a line start (after newline) as `(a)` / `(b)` / …
 * Mid-line nested markers such as "provided that (i)" are ignored — those
 * caused catastrophic over-splitting when reusing generic enumerated splitters.
 */
function splitTopLevelLetteredClauses(text: string): {
  chapeauText: string;
  items: { marker: string; start: number; end: number; text: string }[];
} | null {
  // Allow unicode spaces (NBSP / NNBSP) common in EDGAR HTML→text extracts.
  const markerRe = /\n[\s\u00a0\u202f]*\(([a-z])\)[\s\u00a0\u202f]+/gi;
  const markers: { marker: string; start: number; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(text)) !== null) {
    markers.push({
      marker: m[1]!.toLowerCase(),
      start: m.index + 1, // point at '('
      contentStart: m.index + m[0].length,
    });
  }
  // Also allow a marker at the very beginning of the body (no leading newline).
  // Horizontal whitespace only — do not let ^\s* swallow newlines and double-count.
  const head = text.match(/^[ \t\u00a0\u202f]*\(([a-z])\)[ \t\u00a0\u202f]+/i);
  if (head && head.index === 0) {
    markers.unshift({
      marker: head[1]!.toLowerCase(),
      start: 0,
      contentStart: head[0].length,
    });
  }
  // De-dup by start offset; keep first occurrence order.
  markers.sort((a, b) => a.start - b.start);
  const dedup: typeof markers = [];
  const seenStarts = new Set<number>();
  for (const mk of markers) {
    if (seenStarts.has(mk.start)) continue;
    seenStarts.add(mk.start);
    dedup.push(mk);
  }
  if (dedup.length < 2) return null;

  // Keep only the ascending top-level alphabet (a)(b)(c)… — drop nested
  // romanettes like line-start "(i)" that appear after EDGAR page breaks.
  const topLevel: typeof dedup = [];
  let expected = "a".charCodeAt(0);
  for (const mk of dedup) {
    const code = mk.marker.charCodeAt(0);
    if (code === expected) {
      topLevel.push(mk);
      expected += 1;
    }
    // else: skip out-of-sequence markers (nested (i)/(ii) debris)
  }
  if (topLevel.length < 2) return null;

  const items = topLevel.map((mk, i) => {
    const nextStart = i + 1 < topLevel.length ? topLevel[i + 1]!.start : text.length;
    // Trim trailing nested residue: if the next raw marker sits before nextStart
    // and was skipped, content still ends at next top-level marker — correct.
    return {
      marker: mk.marker,
      start: mk.start,
      end: nextStart,
      text: text.slice(mk.contentStart, nextStart),
    };
  });
  return { chapeauText: text.slice(0, topLevel[0]!.start), items };
}

function locateDefinitionBody(
  index: StructuralIndex,
  def: DetectedDefinition,
): { text: string; nodeId: string | null; charStart: number | null; charEnd: number | null } {
  const nodeId = def.sourceNodeId ?? null;
  // Prefer the structural index's full definition text (term, optional documentId).
  const full = index.getDefinitionFullText(def.exactTerm, def.documentId)
    ?? index.getDefinitionFullText(def.normalizedTerm, def.documentId);
  if (full && full.trim().length > 80) {
    return {
      text: full,
      nodeId,
      charStart: def.charStart,
      charEnd: def.charStart + full.length,
    };
  }
  // Fallback: scan document for "{Term} means" with a bounded window.
  const docText = index.getDocumentText(def.documentId) ?? "";
  if (!docText) return { text: "", nodeId, charStart: null, charEnd: null };
  const escaped = def.exactTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = docText.match(new RegExp(`${escaped}\\s*means[\\s\\S]{0,20000}`, "i"));
  if (!match || match.index == null) {
    // Last resort: definitionExcerpt alone (may be too short to split).
    return {
      text: def.definitionExcerpt ?? "",
      nodeId,
      charStart: def.charStart,
      charEnd: def.charEnd,
    };
  }
  const slice = match[0];
  const afterMeans = slice.search(/\smeans\b/i);
  const fromMeans = afterMeans >= 0 ? slice.slice(afterMeans) : slice;
  const nextDef = fromMeans.slice(10).search(/\n\s*[A-Z][A-Za-z ]{2,60}\s+means\b/);
  const text = nextDef >= 0 ? slice.slice(0, afterMeans + 10 + nextDef) : slice;
  return { text, nodeId, charStart: match.index, charEnd: match.index + text.length };
}

/**
 * Some credit agreements draft definitions without quotation marks
 * ("Permitted Debt means:" rather than "\"Permitted Debt\" means").
 * Structural Phase-2A detection requires quotes; this supplemental scan is
 * issuer-agnostic and only looks for Permitted* catalogs with lettered bodies.
 */
function findUnquotedPermittedDefinitions(
  index: StructuralIndex,
  documentIds: string[],
): DetectedDefinition[] {
  const out: DetectedDefinition[] = [];
  const re = /(?:^|\n)\s*(Permitted\s+[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*)\s+means\s*:?/g;
  for (const documentId of documentIds) {
    const text = index.getDocumentText(documentId) ?? "";
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const exactTerm = m[1]!.replace(/\s+/g, " ").trim();
      if (!PERMITTED_TERM_RE.test(exactTerm)) continue;
      const charStart = m.index + m[0].indexOf(exactTerm);
      out.push({
        documentId,
        exactTerm,
        normalizedTerm: normalizeTerm(exactTerm),
        sourceNodeKey: null,
        sourceNodeId: null,
        charStart,
        charEnd: charStart + exactTerm.length,
        definitionExcerpt: text.slice(charStart, charStart + 240),
      });
    }
  }
  return out;
}

/**
 * Discover lettered exception catalogs from structural definitions
 * plus unquoted Permitted* declarations. Pure / deterministic / issuer-agnostic.
 */
export function discoverDefinitionExceptionCatalogs(
  index: StructuralIndex,
  definitions: DetectedDefinition[],
  documentIds?: string[],
): ExceptionCatalogDiscovery[] {
  const out: ExceptionCatalogDiscovery[] = [];
  const docs = documentIds ?? [...new Set(definitions.map((d) => d.documentId))];
  const unquoted = findUnquotedPermittedDefinitions(index, docs);
  // Prefer structural defs when both exist for the same term+document.
  const merged = new Map<string, DetectedDefinition>();
  for (const def of [...unquoted, ...definitions]) {
    const key = `${def.documentId}|${normalizeTerm(def.exactTerm)}`;
    if (!PERMITTED_TERM_RE.test(def.exactTerm.trim())) continue;
    if (!merged.has(key)) merged.set(key, def);
  }

  for (const def of merged.values()) {
    const body = locateDefinitionBody(index, def);
    if (!body.text || body.text.length < 80) continue;

    // Prefer stopping unquoted bodies before the next Permitted* definition.
    let bodyText = body.text;
    const nextPermitted = bodyText.slice(20).search(/\n\s*Permitted\s+[A-Z][A-Za-z ]{0,40}\s+means\b/);
    if (nextPermitted >= 0) bodyText = bodyText.slice(0, 20 + nextPermitted);

    const split = splitTopLevelLetteredClauses(bodyText);
    if (!split || split.items.length < 2) continue;

    const docText = index.getDocumentText(def.documentId) ?? "";
    const prohibitionRefs = findProhibitionRefs(docText, def.exactTerm);
    const families = familyForTerm(def.exactTerm);

    const clauses: ExceptionCatalogClause[] = split.items.map((item) => ({
      marker: item.marker,
      charStartInDefinition: item.start,
      charEndInDefinition: item.end,
      text: item.text.trim(),
      documentCharStart: body.charStart != null ? body.charStart + item.start : null,
      documentCharEnd: body.charStart != null ? body.charStart + item.end : null,
    }));

    // Scan the full definition body for cross-definition clause links so a
    // nested "clause (x)" reference is not lost to enumeration splitting.
    const crossDefinitionLinks: ExceptionCatalogDiscovery["crossDefinitionLinks"] = [];
    CLAUSE_OF_DEF_RE.lastIndex = 0;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = CLAUSE_OF_DEF_RE.exec(bodyText)) !== null) {
      // Attribute to the nearest preceding top-level catalog marker when possible.
      const offset = linkMatch.index;
      let fromMarker = "?";
      for (const clause of clauses) {
        if (clause.charStartInDefinition <= offset && offset < clause.charEndInDefinition) {
          fromMarker = clause.marker;
          break;
        }
      }
      crossDefinitionLinks.push({
        fromMarker,
        toTerm: linkMatch[2]!,
        toMarker: linkMatch[1]!,
        excerpt: linkMatch[0],
      });
    }

    const supportStatus: ExceptionCatalogSupportStatus =
      prohibitionRefs.length > 0 && clauses.length >= 2
        ? "SUPPORTED_STRUCTURE"
        : clauses.length >= 2
          ? "PARTIAL_STRUCTURE"
          : "AMBIGUOUS";

    const nodeIds = body.nodeId ? [body.nodeId] : [];
    const nodeKeys = def.sourceNodeKey ? [def.sourceNodeKey] : [];

    const parentCandidate = makeCandidate({
      documentId: def.documentId,
      discoveryKey: `catalog|${def.documentId}|${def.normalizedTerm}`,
      structuralNodeIds: nodeIds,
      structuralNodeKeys: nodeKeys,
      normalizedSourceRef: `def:${def.exactTerm}`,
      families,
      role: "DEFINITIONAL_DEPENDENCY_CANDIDATE",
      description: `Definition catalog for ${def.exactTerm} with ${clauses.length} enumerated exception clauses`,
      evidenceSignals: [
        "permitted_term_definition",
        `enumerated_clauses:${clauses.length}`,
        ...(prohibitionRefs.length ? ["referenced_from_prohibition"] : []),
      ],
      multipleRulesLikely: true,
      definedTermDependencyLikely: true,
      sourceCitation: `${def.documentId} / definition "${def.exactTerm}"`,
    });

    const clauseCandidates = clauses.map((clause) =>
      makeCandidate({
        documentId: def.documentId,
        discoveryKey: `catalog-clause|${def.documentId}|${def.normalizedTerm}|${clause.marker}|${clause.text.slice(0, 120)}`,
        structuralNodeIds: nodeIds,
        structuralNodeKeys: nodeKeys,
        normalizedSourceRef: `def:${def.exactTerm}(${clause.marker})`,
        families,
        role: roleForClause(clause.text),
        description: `${def.exactTerm} clause (${clause.marker}): ${clause.text.slice(0, 160).replace(/\s+/g, " ")}`,
        evidenceSignals: [
          "enumerated_exception_clause",
          `marker:${clause.marker}`,
          ...(clause.text.match(/\$[\d,]+/) ? ["dollar_cap"] : []),
          ...(clause.text.match(/\d+(?:\.\d+)?%/)? ["percentage_cap"] : []),
          ...(clause.text.match(/\b(?:ratio|leverage|coverage)\b/i) ? ["ratio_condition"] : []),
        ],
        multipleRulesLikely: false,
        definedTermDependencyLikely: /definition of|Section\s+\d+/i.test(clause.text),
        sourceCitation: `${def.documentId} / ${def.exactTerm} (${clause.marker})`,
      }),
    );

    out.push({
      documentId: def.documentId,
      termExact: def.exactTerm,
      termNormalized: def.normalizedTerm,
      definitionNodeId: body.nodeId,
      definitionCharStart: body.charStart,
      definitionCharEnd: body.charEnd,
      chapeauText: split.chapeauText.trim(),
      clauses,
      referencedFromProhibitionRefs: prohibitionRefs,
      supportStatus,
      candidates: [parentCandidate, ...clauseCandidates],
      crossDefinitionLinks,
    });
  }

  return out;
}

/**
 * Section-embedded exception catalogs: "shall not … except:" / "other than the following:"
 * followed by top-level lettered clauses. Common alternative to Permitted* definitions.
 * Issuer-agnostic.
 */
export function discoverSectionExceptionCatalogs(
  index: StructuralIndex,
  documentIds: string[],
): ExceptionCatalogDiscovery[] {
  const out: ExceptionCatalogDiscovery[] = [];
  // Match only through the exception-introducer; body is sliced separately so
  // a long catalog cannot swallow later section headings via lastIndex.
  // Preamble must not cross another §N.N heading (prevents 7.02+[Reserved]
  // from absorbing 7.03's "Create, incur … except:").
  const headerRe =
    /(?:^|\n)\s*(?:Section\s+)?(\d+\.\d+)[^\n]{0,120}?\n((?:(?!\n\s*(?:Section\s+)?\d+\.\d+\b)[\s\S]){0,800}?(?:shall not|will not|Create[\s\u00a0\u202f]*,[\s\u00a0\u202f]*incur)(?:(?!\n\s*(?:Section\s+)?\d+\.\d+\b)[\s\S]){0,600}?(?:except\s*:|other than the following\s*:|other than as follows\s*:))/gi;

  for (const documentId of documentIds) {
    const text = index.getDocumentText(documentId) ?? "";
    if (!text) continue;
    headerRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    const seenSections = new Set<string>();
    while ((m = headerRe.exec(text)) !== null) {
      const sectionRef = m[1]!;
      if (seenSections.has(sectionRef)) continue;
      const bodyStart = m.index + m[0].length;
      const after = text.slice(bodyStart, bodyStart + 20000);
      // Bound catalog at next section heading (e.g. 7.02 / 7.03 / Section 8.01).
      const nextSec = after.search(/\n\s*(?:Section\s+)?\d+\.\d+\b/);
      const catalogBody = nextSec >= 0 ? after.slice(0, nextSec) : after.slice(0, 8000);
      const split = splitTopLevelLetteredClauses("\n" + catalogBody);
      if (!split || split.items.length < 2) continue;
      seenSections.add(sectionRef);

      const preamble = (m[2] ?? "").replace(/\s+/g, " ").trim();
      // Prefer heading family signal (… Liens. / … Indebtedness.) over body text.
      const headingFamily = familyForTerm(m[0].slice(0, 120));
      const families =
        headingFamily.length > 0
          ? headingFamily
          : familyForTerm(preamble + " " + catalogBody.slice(0, 200));
      const termExact = `Section ${sectionRef} Exceptions`;
      const charStart = m.index;
      const clauses: ExceptionCatalogClause[] = split.items.map((item) => ({
        marker: item.marker,
        charStartInDefinition: item.start,
        charEndInDefinition: item.end,
        text: item.text.trim(),
        documentCharStart: bodyStart + item.start,
        documentCharEnd: bodyStart + item.end,
      }));

      const crossDefinitionLinks: ExceptionCatalogDiscovery["crossDefinitionLinks"] = [];
      CLAUSE_OF_DEF_RE.lastIndex = 0;
      let linkMatch: RegExpExecArray | null;
      const bodyForLinks = catalogBody;
      while ((linkMatch = CLAUSE_OF_DEF_RE.exec(bodyForLinks)) !== null) {
        // Attribute to nearest enclosing top-level clause when possible.
        let fromMarker = "?";
        for (const clause of clauses) {
          if (clause.charStartInDefinition <= linkMatch.index && linkMatch.index < clause.charEndInDefinition) {
            fromMarker = clause.marker;
            break;
          }
        }
        crossDefinitionLinks.push({
          fromMarker,
          toTerm: linkMatch[2]!,
          toMarker: linkMatch[1]!,
          excerpt: linkMatch[0],
        });
      }
      // Debt↔lien ties: "permitted under Section 7.01(i)", "combined with … Section 7.03(g)".
      const secClauseRe =
        /\b(?:permitted\s+under|pursuant to|combined[^.|;]{0,80}?with[^.|;]{0,80}?|under)\s+Section\s*(\d+\.\d+)\(([a-z0-9]+)\)/gi;
      let sm: RegExpExecArray | null;
      while ((sm = secClauseRe.exec(bodyForLinks)) !== null) {
        let fromMarker = sectionRef;
        for (const clause of clauses) {
          if (clause.charStartInDefinition <= sm.index && sm.index < clause.charEndInDefinition) {
            fromMarker = clause.marker;
            break;
          }
        }
        crossDefinitionLinks.push({
          fromMarker,
          toTerm: `Section ${sm[1]}`,
          toMarker: sm[2]!,
          excerpt: sm[0].slice(0, 120),
        });
      }

      const resolved = index.resolveUniqueNodeByRef(documentId, sectionRef);
      const nodeId = resolved.status === "UNIQUE" ? resolved.node.nodeId : null;
      const nodeKey = resolved.status === "UNIQUE" ? resolved.node.nodeKey : `${documentId}::${sectionRef}`;

      const parentCandidate = makeCandidate({
        documentId,
        discoveryKey: `section-catalog|${documentId}|${sectionRef}`,
        structuralNodeIds: nodeId ? [nodeId] : [],
        structuralNodeKeys: [nodeKey],
        normalizedSourceRef: sectionRef,
        families,
        role: "GENERAL_PROHIBITION",
        description: `Section ${sectionRef} general prohibition with ${clauses.length} lettered exceptions`,
        evidenceSignals: ["section_exception_catalog", `enumerated_clauses:${clauses.length}`, "except_or_other_than_following"],
        multipleRulesLikely: true,
        definedTermDependencyLikely: /definition of|Section\s+\d+/i.test(catalogBody),
        sourceCitation: `${documentId} §${sectionRef}`,
      });

      const clauseCandidates = clauses.map((clause) =>
        makeCandidate({
          documentId,
          discoveryKey: `section-clause|${documentId}|${sectionRef}|${clause.marker}|${clause.text.slice(0, 120)}`,
          structuralNodeIds: nodeId ? [nodeId] : [],
          structuralNodeKeys: [nodeKey],
          normalizedSourceRef: `${sectionRef}(${clause.marker})`,
          families,
          role: roleForClause(clause.text),
          description: `§${sectionRef}(${clause.marker}): ${clause.text.slice(0, 160).replace(/\s+/g, " ")}`,
          evidenceSignals: [
            "section_enumerated_exception_clause",
            `marker:${clause.marker}`,
            ...(clause.text.match(/\$[\d,]+/) ? ["dollar_cap"] : []),
            ...(clause.text.match(/\d+(?:\.\d+)?%/) ? ["percentage_cap"] : []),
          ],
          multipleRulesLikely: false,
          definedTermDependencyLikely: /definition of|Section\s+\d+/i.test(clause.text),
          sourceCitation: `${documentId} §${sectionRef}(${clause.marker})`,
        }),
      );

      out.push({
        documentId,
        termExact,
        termNormalized: normalizeTerm(termExact),
        definitionNodeId: nodeId,
        definitionCharStart: charStart,
        definitionCharEnd: bodyStart + catalogBody.length,
        chapeauText: preamble,
        clauses,
        referencedFromProhibitionRefs: [`§${sectionRef}`],
        supportStatus: "SUPPORTED_STRUCTURE",
        candidates: [parentCandidate, ...clauseCandidates],
        crossDefinitionLinks,
      });
    }
  }
  return out;
}

/**
 * Deterministic GENERAL_PROHIBITION candidates for sections whose body
 * says "other than Permitted X" / "except Permitted X". Issuer-agnostic.
 */
export function discoverProhibitionToPermittedLinks(
  index: StructuralIndex,
  documentIds: string[],
): DiscoveredCandidate[] {
  const out: DiscoveredCandidate[] = [];
  for (const documentId of documentIds) {
    const text = index.getDocumentText(documentId) ?? "";
    if (!text) continue;
    OTHER_THAN_PERMITTED_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = OTHER_THAN_PERMITTED_RE.exec(text)) !== null) {
      const term = m[1]!;
      const windowStart = Math.max(0, m.index - 500);
      const window = text.slice(windowStart, m.index + 80);
      // Prefer the nearest preceding section heading (last match in the window).
      const secMatches = [...window.matchAll(/(\d+\.\d+)\s+([A-Z][A-Za-z ]{1,40})/g)];
      const sec = secMatches.length > 0 ? secMatches[secMatches.length - 1]! : null;
      const sectionRef = sec ? sec[1]! : `offset:${m.index}`;
      const heading = sec ? sec[2]!.trim() : term;
      const families = familyForTerm(term);
      // Resolve structural node if possible
      const resolved = index.resolveUniqueNodeByRef(documentId, sectionRef);
      const nodeId = resolved.status === "UNIQUE" ? resolved.node.nodeId : null;
      const nodeKey = resolved.status === "UNIQUE" ? resolved.node.nodeKey : `${documentId}::${sectionRef}`;
      out.push(
        makeCandidate({
          documentId,
          discoveryKey: `prohibition|${documentId}|${sectionRef}|${normalizeTerm(term)}`,
          structuralNodeIds: nodeId ? [nodeId] : [],
          structuralNodeKeys: [nodeKey],
          normalizedSourceRef: sectionRef,
          families,
          role: "GENERAL_PROHIBITION",
          description: `General prohibition at ${sectionRef} (${heading}) pointing to ${term}`,
          evidenceSignals: ["other_than_permitted", `term:${term}`],
          multipleRulesLikely: false,
          definedTermDependencyLikely: true,
          sourceCitation: `${documentId} §${sectionRef}`,
        }),
      );
    }
  }
  // Deduplicate by discoveryId
  const seen = new Set<string>();
  return out.filter((c) => {
    if (seen.has(c.discoveryId)) return false;
    seen.add(c.discoveryId);
    return true;
  });
}
