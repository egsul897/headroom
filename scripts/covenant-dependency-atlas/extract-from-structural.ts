/**
 * Structural-index dependency adapter (Phase 2).
 *
 * Derives dependency *candidates* from raw document text via the production
 * structural parser APIs (read-only import — does not modify those modules).
 * Does NOT use Phase-3F ground-truth annotations.
 *
 * Legal dependency is never asserted from bare textual similarity: edges
 * require an explicit connective or a definition occurrence inside a
 * structurally parsed section, with unresolved targets preserved.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";
import { analyzeGraph } from "./graph-analysis";
import { buildCompletenessReport } from "./completeness";
import { annotateEdgesWithRootCause } from "./classify-unresolved";
import type { AtlasDocument, AtlasEdge, AtlasNode, DependencyEdgeKind } from "./schema";
import {
  edgeIdOf,
  nodeIdForCrossDocument,
  nodeIdForFinancialInput,
  nodeIdForSection,
  nodeIdForTerm,
  nodeIdForUnresolved,
} from "./schema";

export interface StructuralDocInput {
  documentId: string;
  packageId: string;
  sourceFile: string;
  label: string;
  text: string;
  /** development | evaluation — evaluation docs must not tune connectives. */
  split: "development" | "evaluation";
  issuer?: string;
}

const CONNECTIVE_RULES: { re: RegExp; kind: DependencyEdgeKind; label: string }[] = [
  { re: /\bas\s+defined\s+in\b/i, kind: "COVENANT_TO_DEFINITION", label: "as defined in" },
  { re: /\bsubject\s+to\b/i, kind: "COVENANT_TO_CONDITION", label: "subject to" },
  { re: /\bexcept\s+as\s+(?:provided|set\s+forth|permitted)\b/i, kind: "COVENANT_TO_EXCEPTION", label: "except as provided" },
  { re: /\bpermitted\s+by\b/i, kind: "COVENANT_TO_EXCEPTION", label: "permitted by" },
  { re: /\breclassif(?:y|ication|iable)\b/i, kind: "RECLASSIFICATION", label: "reclassification" },
  { re: /\b(?:shares?|shared)\s+(?:capacity|basket|amount)\b|\bAvailable\s+Amount\b/i, kind: "COVENANT_TO_SHARED_BASKET", label: "shared capacity/basket" },
  { re: /\b(?:Restricted|Unrestricted)\s+Subsidiar(?:y|ies)\b|\bLoan\s+Part(?:y|ies)\b|\bGuarantor(?:s)?\b/i, kind: "ENTITY_SCOPE", label: "entity-scope term" },
  { re: /\b(?:Total\s+Net\s+)?Leverage\s+Ratio\b|\bInterest\s+Coverage\s+Ratio\b|\bFixed\s+Charge\s+Coverage\b/i, kind: "RATIO_CALCULATION", label: "ratio reference" },
  { re: /\bas\s+amended\b|\bAmendment\b.{0,40}\b(?:Section|hereby)\b/i, kind: "COVENANT_TO_AMENDMENT", label: "amendment authority" },
  {
    re: /\b(?:Security|Collateral|Intercreditor|Guarantee|Custody)\s+Agreement\b|\bCollateral\s+Documents?\b|\b(?:Pledge\s+and\s+)?Collateral\s+Account\s+Control\s+Agreement\b/i,
    kind: "COVENANT_TO_CROSS_DOCUMENT",
    label: "cross-document instrument",
  },
];

const FINANCIAL_INPUT_CUES: { re: RegExp; key: string }[] = [
  { re: /\bNet\s+Income\b/, key: "NET_INCOME" },
  { re: /\bConsolidated\s+Net\s+Income\b/, key: "CONSOLIDATED_NET_INCOME" },
  { re: /\bInterest\s+Expense\b/, key: "INTEREST_EXPENSE" },
  { re: /\bUnrestricted\s+Cash\b/, key: "UNRESTRICTED_CASH" },
  { re: /\bConsolidated\s+Total\s+Assets\b/, key: "CONSOLIDATED_TOTAL_ASSETS" },
  { re: /\bPrevailing\s+Market\s+Value\b/, key: "PREVAILING_MARKET_VALUE" },
];

/** Max chars for Atlas-owned definition body window (does not change production detector spans). */
const DEF_BODY_MAX = 3500;

function sha16(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

/**
 * Production `detectStructuralDefinitions` sets charEnd at the end of the
 * declaration match ("… means") — typically ~20–50 chars — while
 * `definitionExcerpt` already carries a bounded body. Atlas-owned extraction
 * therefore reconstructs a body window from excerpt + text after charStart
 * until the next definition declaration or DEF_BODY_MAX. Production parser
 * spans are never mutated.
 */
function definitionBodyWindow(
  text: string,
  d: { charStart: number; charEnd: number; definitionExcerpt: string },
  nextDefStart: number | null,
): { body: string; bodyStart: number; bodyEnd: number } {
  const bodyStart = d.charStart;
  const excerptEnd = d.charStart + (d.definitionExcerpt?.length ?? 0);
  const boundByNext = nextDefStart != null ? nextDefStart : text.length;
  const bodyEnd = Math.min(text.length, boundByNext, d.charStart + DEF_BODY_MAX, Math.max(d.charEnd, excerptEnd, d.charStart + 400));
  // Prefer a longer window when the next definition is nearby but excerpt is short.
  const expandedEnd = Math.min(text.length, boundByNext, d.charStart + DEF_BODY_MAX);
  const end = Math.max(bodyEnd, Math.min(expandedEnd, Math.max(excerptEnd, d.charStart + 800)));
  return { body: text.slice(bodyStart, end), bodyStart, bodyEnd: end };
}

function ensureNode(nodes: Map<string, AtlasNode>, node: AtlasNode): void {
  if (!nodes.has(node.nodeId)) nodes.set(node.nodeId, node);
}

function addEdge(edges: Map<string, AtlasEdge>, edge: AtlasEdge): void {
  if (!edges.has(edge.edgeId)) edges.set(edge.edgeId, edge);
}

function sectionNodes(nodes: StructuralNode[]): StructuralNode[] {
  return nodes.filter((n) => n.nodeType === "SECTION" || n.nodeType === "SUBSECTION" || n.nodeType === "ARTICLE");
}

function isCovenantishSection(sectionRef: string, heading: string | null | undefined): boolean {
  const h = `${sectionRef} ${heading ?? ""}`.toLowerCase();
  const ref = sectionRef.trim();
  return (
    /\b6\.\d+|\b7\.\d+|\barticle\s+[vi]+|\bnegative\s+covenant|\bindebtedness\b|\bliens?\b|\binvestments?\b|\brestricted\s+payments?\b|\bfinancial\s+(?:covenant|condition)\b|\baffirmative\s+covenant|\blimitation on\b/.test(
      h,
    ) ||
    /^6\./.test(ref) ||
    /^7\./.test(ref) ||
    /^5\./.test(ref) ||
    /^(?:VI|VII|6|7)$/i.test(ref)
  );
}

/**
 * High-value defined-term candidates commonly controlling negative-covenant meaning.
 * Used only when a covenantish section contains the term but no local structural
 * definition exists — emit UNRESOLVED COVENANT_TO_DEFINITION (fail-closed).
 * Does not fabricate definition bodies.
 */
const UNRESOLVED_DEFINED_TERM_CANDIDATES = [
  "Indebtedness",
  "EBITDA",
  "Consolidated EBITDA",
  "Available Amount",
  "Permitted Lien",
  "Permitted Liens",
  "Restricted Subsidiary",
  "Restricted Subsidiaries",
  "Unrestricted Subsidiary",
  "Investment",
  "Investments",
  "Leverage Ratio",
  "Total Leverage Ratio",
  "Consolidated Net Income",
  "Net Income",
  "Guarantor",
  "Guarantors",
  "Collateral",
  "Loan Party",
  "Loan Parties",
];

export function loadTextDocument(path: string): string {
  const raw = readFileSync(path, "utf-8");
  // Light HTML strip for .htm fixtures — not a full browser parse.
  if (/\.html?$/i.test(path) || /<html[\s>]/i.test(raw.slice(0, 500))) {
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }
  return raw;
}

export function extractFromStructural(input: StructuralDocInput): AtlasDocument {
  const { documentId, packageId, sourceFile, label, text } = input;
  const structuralNodes = parseDocumentStructure({ documentId, label, text });
  const definitions = detectStructuralDefinitions(documentId, text, structuralNodes);
  const references = detectStructuralReferences(documentId, text, structuralNodes);
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes: structuralNodes }]]), definitions, references);

  const nodes = new Map<string, AtlasNode>();
  const edges = new Map<string, AtlasEdge>();

  const nodeById = new Map(structuralNodes.map((n) => [n.nodeId, n]));
  const sectionRefOf = (sourceNodeId: string | null): string | null => {
    if (!sourceNodeId) return null;
    return nodeById.get(sourceNodeId)?.sectionRef ?? null;
  };

  const defsSorted = [...definitions].sort((a, b) => a.charStart - b.charStart);
  const nextDefStartAfter = (charStart: number): number | null => {
    for (const d of defsSorted) {
      if (d.charStart > charStart) return d.charStart;
    }
    return null;
  };

  const defByNorm = new Map<string, (typeof definitions)[number]>();
  for (const d of definitions) {
    defByNorm.set(d.normalizedTerm, d);
    const termName = d.exactTerm;
    const termId = nodeIdForTerm(documentId, termName);
    ensureNode(nodes, {
      nodeId: termId,
      kind: "DEFINITION",
      documentId,
      label: termName,
      sectionRef: sectionRefOf(d.sourceNodeId),
      unitId: d.sourceNodeId,
      termName,
      materiality: null,
      notes: null,
    });
  }

  for (const sn of sectionNodes(structuralNodes)) {
    const sid = nodeIdForSection(documentId, sn.sectionRef);
    ensureNode(nodes, {
      nodeId: sid,
      kind: isCovenantishSection(sn.sectionRef, sn.heading) ? "COVENANT" : "SECTION",
      documentId,
      label: sn.heading || sn.sectionRef,
      sectionRef: sn.sectionRef,
      unitId: sn.nodeId,
      termName: null,
      materiality: null,
      notes: null,
    });
  }

  // Definition → definition via "as defined in" / compositional term mentions inside definition bodies.
  for (const d of definitions) {
    const { body, bodyStart } = definitionBodyWindow(text, d, nextDefStartAfter(d.charStart));
    const fromId = nodeIdForTerm(documentId, d.exactTerm);
    for (const other of definitions) {
      if (other.normalizedTerm === d.normalizedTerm) continue;
      if (other.exactTerm.length < 4) continue;
      // Require word-boundary occurrence in body AND a connective near it OR the body uses means/plus/minus.
      const termRe = new RegExp(`\\b${other.exactTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      const m = body.match(termRe);
      if (!m || m.index == null) continue;
      const window = body.slice(Math.max(0, m.index - 40), Math.min(body.length, m.index + other.exactTerm.length + 40));
      const compositional = /\b(?:means|plus|minus|divided by|less|including|as defined|ratio of)\b/i.test(body.slice(0, 240)) || /\bas\s+defined\b/i.test(window);
      if (!compositional) continue;
      const toId = nodeIdForTerm(documentId, other.exactTerm);
      addEdge(edges, {
        edgeId: edgeIdOf("DEFINITION_TO_DEFINITION", fromId, toId, sha16(window)),
        kind: "DEFINITION_TO_DEFINITION",
        fromNodeId: fromId,
        toNodeId: toId,
        resolution: "RESOLVED",
        confidence: "MEDIUM",
        evidenceClass: "STRUCTURAL_DEFINITION_OCCURRENCE",
        rationale: `Definition '${d.exactTerm}' body compositionally references '${other.exactTerm}' (Atlas definition-body window; production charEnd left unchanged).`,
        sourceSpans: [
          {
            documentId,
            sourceFile,
            sectionRef: sectionRefOf(d.sourceNodeId) ?? null,
            unitId: null,
            charStart: bodyStart + m.index,
            charEnd: bodyStart + m.index + other.exactTerm.length,
            excerpt: window.slice(0, 200),
          },
        ],
        unresolvedReason: null,
        sharedBasketKey: null,
        financialInputKey: null,
        rootCause: null,
        controllingRestrictionRisk: false,
      });
    }

    for (const cue of FINANCIAL_INPUT_CUES) {
      if (!cue.re.test(body)) continue;
      if (!/\b(?:means|plus|minus|divided by|less|aggregate|ratio of)\b/i.test(body.slice(0, 400))) continue;
      const finId = nodeIdForFinancialInput(cue.key);
      ensureNode(nodes, {
        nodeId: finId,
        kind: "FINANCIAL_INPUT",
        documentId,
        label: cue.key,
        sectionRef: null,
        unitId: null,
        termName: null,
        materiality: null,
        notes: "Financial input leaf from compositional definition body.",
      });
      addEdge(edges, {
        edgeId: edgeIdOf("FINANCIAL_INPUT", fromId, finId, cue.key),
        kind: "FINANCIAL_INPUT",
        fromNodeId: fromId,
        toNodeId: finId,
        resolution: "RESOLVED",
        confidence: "MEDIUM",
        evidenceClass: "EXPLICIT_SOURCE_CONNECTIVE",
        rationale: `Definition '${d.exactTerm}' compositionally references financial input ${cue.key}.`,
        sourceSpans: [
          {
            documentId,
            sourceFile,
            sectionRef: sectionRefOf(d.sourceNodeId) ?? null,
            unitId: null,
            charStart: bodyStart,
            charEnd: bodyStart + Math.min(body.length, 240),
            excerpt: body.slice(0, 200),
          },
        ],
        unresolvedReason: null,
        sharedBasketKey: null,
        financialInputKey: cue.key,
        rootCause: null,
        controllingRestrictionRisk: false,
      });
    }
  }

  // Section → definition when a defined term occurs in a covenantish section with inventory-backed definition.
  for (const sn of sectionNodes(structuralNodes)) {
    if (!isCovenantishSection(sn.sectionRef, sn.heading)) continue;
    const fromId = nodeIdForSection(documentId, sn.sectionRef);
    const body = text.slice(sn.charStart, Math.min(sn.charEnd, sn.charStart + 4000));
    for (const d of definitions) {
      if (d.exactTerm.length < 5) continue;
      const termRe = new RegExp(`\\b${d.exactTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      const m = body.match(termRe);
      if (!m || m.index == null) continue;
      const toId = nodeIdForTerm(documentId, d.exactTerm);
      addEdge(edges, {
        edgeId: edgeIdOf("COVENANT_TO_DEFINITION", fromId, toId),
        kind: "COVENANT_TO_DEFINITION",
        fromNodeId: fromId,
        toNodeId: toId,
        resolution: "RESOLVED",
        confidence: "MEDIUM",
        evidenceClass: "STRUCTURAL_DEFINITION_OCCURRENCE",
        rationale: `Section ${sn.sectionRef} contains defined term '${d.exactTerm}' with a structural definition in this document.`,
        sourceSpans: [
          {
            documentId,
            sourceFile,
            sectionRef: sn.sectionRef,
            unitId: sn.nodeId,
            charStart: sn.charStart + m.index,
            charEnd: sn.charStart + m.index + d.exactTerm.length,
            excerpt: body.slice(Math.max(0, m.index - 30), m.index + d.exactTerm.length + 30).slice(0, 200),
          },
        ],
        unresolvedReason: null,
        sharedBasketKey: null,
        financialInputKey: null,
        rootCause: null,
        controllingRestrictionRisk: false,
      });
    }

    // Fail-closed: controlling defined-term candidates present in covenant text but
    // missing from local structural definitions (common in neg-covenant excerpts).
    // Do NOT fabricate definition bodies — leave UNRESOLVED with MISSING_DEFINITION.
    for (const term of UNRESOLVED_DEFINED_TERM_CANDIDATES) {
      if (defByNorm.has(term.toLowerCase())) continue;
      const termRe = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      const m = body.match(termRe);
      if (!m || m.index == null) continue;
      const toId = nodeIdForUnresolved(documentId, `missing-def-${term}`);
      ensureNode(nodes, {
        nodeId: toId,
        kind: "UNRESOLVED_TARGET",
        documentId,
        label: term,
        sectionRef: null,
        unitId: null,
        termName: term,
        materiality: null,
        notes: "Defined-term candidate in covenantish section without local structural definition — not fabricated.",
      });
      addEdge(edges, {
        edgeId: edgeIdOf("COVENANT_TO_DEFINITION", fromId, toId, term),
        kind: "COVENANT_TO_DEFINITION",
        fromNodeId: fromId,
        toNodeId: toId,
        resolution: "UNRESOLVED",
        confidence: "LOW",
        evidenceClass: "STRUCTURAL_DEFINITION_OCCURRENCE",
        rationale: `Section ${sn.sectionRef} contains controlling term '${term}' with no local structural definition (fail-closed; definition may live in another document).`,
        sourceSpans: [
          {
            documentId,
            sourceFile,
            sectionRef: sn.sectionRef,
            unitId: sn.nodeId,
            charStart: sn.charStart + m.index,
            charEnd: sn.charStart + m.index + term.length,
            excerpt: body.slice(Math.max(0, m.index - 30), m.index + term.length + 30).slice(0, 200),
          },
        ],
        unresolvedReason: `Term '${term}' not declared by any structural definition in this document text.`,
        sharedBasketKey: null,
        financialInputKey: null,
        rootCause: "MISSING_DEFINITION",
        controllingRestrictionRisk: true,
      });
    }
  }

  // Section-body high-risk family scan (Atlas-owned): cross-document instruments,
  // shared baskets, entity scope, reclassification, remote "subject to" conditions.
  // Requires an explicit connective/instrument phrase in the section body — never similarity-only.
  for (const sn of sectionNodes(structuralNodes)) {
    if (!isCovenantishSection(sn.sectionRef, sn.heading)) continue;
    const fromId = nodeIdForSection(documentId, sn.sectionRef);
    const body = text.slice(sn.charStart, Math.min(sn.charEnd, sn.charStart + 5000));
    const bodyStart = sn.charStart;

    const pushSectionEdge = (
      kind: DependencyEdgeKind,
      toId: string,
      resolution: AtlasEdge["resolution"],
      rationale: string,
      excerpt: string,
      charStart: number,
      charEnd: number,
      unresolvedReason: string | null,
      extra?: Partial<AtlasEdge>,
    ) => {
      addEdge(edges, {
        edgeId: edgeIdOf(kind, fromId, toId, sha16(excerpt + String(charStart))),
        kind,
        fromNodeId: fromId,
        toNodeId: toId,
        resolution,
        confidence: resolution === "RESOLVED" ? "MEDIUM" : "LOW",
        evidenceClass: "EXPLICIT_SOURCE_CONNECTIVE",
        rationale,
        sourceSpans: [
          {
            documentId,
            sourceFile,
            sectionRef: sn.sectionRef,
            unitId: sn.nodeId,
            charStart,
            charEnd,
            excerpt: excerpt.slice(0, 220),
          },
        ],
        unresolvedReason,
        sharedBasketKey: extra?.sharedBasketKey ?? null,
        financialInputKey: null,
        rootCause: null,
        controllingRestrictionRisk: false,
      });
    };

    const xdRe =
      /\b(?:Security|Collateral|Intercreditor|Guarantee|Custody)\s+Agreement\b|\bCollateral\s+Documents?\b|\b(?:Pledge\s+and\s+)?Collateral\s+Account\s+Control\s+Agreement\b/gi;
    let xd: RegExpExecArray | null;
    while ((xd = xdRe.exec(body)) !== null) {
      const label = xd[0]!;
      const toId = nodeIdForCrossDocument(label);
      ensureNode(nodes, {
        nodeId: toId,
        kind: "CROSS_DOCUMENT_TARGET",
        documentId,
        label,
        sectionRef: null,
        unitId: null,
        termName: null,
        materiality: null,
        notes: null,
      });
      pushSectionEdge(
        "COVENANT_TO_CROSS_DOCUMENT",
        toId,
        "UNRESOLVED",
        `Section ${sn.sectionRef} references cross-document instrument '${label}'.`,
        body.slice(Math.max(0, xd.index - 40), xd.index + label.length + 40),
        bodyStart + xd.index,
        bodyStart + xd.index + label.length,
        "Cross-document instrument reference; target not in this document text.",
      );
    }

    if (/\b(?:shares?|shared)\s+(?:capacity|basket|amount)\b|\bAvailable\s+Amount\b|\bAvailable\s+(?:RP|Investment)\s+Capacity\s+Amount\b/i.test(body)) {
      const key = /\bAvailable\s+RP\s+Capacity\s+Amount\b/i.test(body)
        ? "Available RP Capacity Amount"
        : /\bAvailable\s+Investment\s+Capacity\s+Amount\b/i.test(body)
          ? "Available Investment Capacity Amount"
          : /\bAvailable\s+Amount\b/i.test(body)
            ? "Available Amount"
            : "SHARED_CAPACITY";
      const toId = nodeIdForTerm(documentId, key);
      ensureNode(nodes, {
        nodeId: toId,
        kind: "SHARED_BASKET",
        documentId,
        label: key,
        sectionRef: sectionRefOf(defByNorm.get(key.toLowerCase())?.sourceNodeId ?? null),
        unitId: null,
        termName: key,
        materiality: null,
        notes: null,
      });
      const resolved = defByNorm.has(key.toLowerCase()) || key === "SHARED_CAPACITY";
      pushSectionEdge(
        "COVENANT_TO_SHARED_BASKET",
        toId,
        resolved ? "RESOLVED" : "UNRESOLVED",
        `Section ${sn.sectionRef} references shared-capacity basket '${key}'.`,
        body.slice(0, 200),
        bodyStart,
        bodyStart + Math.min(200, body.length),
        resolved ? null : `Shared basket '${key}' not located as a structural definition.`,
        { sharedBasketKey: key },
      );
    }

    if (/\b(?:Restricted|Unrestricted)\s+Subsidiar(?:y|ies)\b|\bLoan\s+Part(?:y|ies)\b|\bGuarantor(?:s)?\b|\bRestricted\s+Part(?:y|ies)\b/i.test(body)) {
      const toId = `${fromId}::entity_scope`;
      ensureNode(nodes, {
        nodeId: toId,
        kind: "ENTITY_SCOPE_RULE",
        documentId,
        label: `Entity scope signal @ ${sn.sectionRef}`,
        sectionRef: sn.sectionRef,
        unitId: sn.nodeId,
        termName: null,
        materiality: null,
        notes: "Entity-scope term in covenantish section body.",
      });
      pushSectionEdge(
        "ENTITY_SCOPE",
        toId,
        "RESOLVED",
        `Section ${sn.sectionRef} contains entity-scope defined-party language.`,
        body.slice(0, 200),
        bodyStart,
        bodyStart + Math.min(200, body.length),
        null,
      );
    }

    if (/\breclassif(?:y|ication|iable)\b/i.test(body)) {
      const toId = nodeIdForUnresolved(documentId, `reclass-${sn.sectionRef}`);
      ensureNode(nodes, {
        nodeId: toId,
        kind: "UNRESOLVED_TARGET",
        documentId,
        label: `reclassification @ ${sn.sectionRef}`,
        sectionRef: sn.sectionRef,
        unitId: null,
        termName: null,
        materiality: null,
        notes: null,
      });
      pushSectionEdge(
        "RECLASSIFICATION",
        toId,
        "UNRESOLVED",
        `Section ${sn.sectionRef} contains reclassification connective; destination provision not uniquely resolved.`,
        body.slice(0, 200),
        bodyStart,
        bodyStart + Math.min(200, body.length),
        "Reclassification connective found; destination provision not uniquely resolved.",
      );
    }

    // Remote condition / exception / amendment connectives in section body
    // (not only adjacent to typed structural cross-references). Cap per section
    // to avoid combinatorial explosion while preserving fail-closed coverage.
    const subjectRe = /\bsubject\s+to\b/gi;
    let sm: RegExpExecArray | null;
    let subjectCount = 0;
    while ((sm = subjectRe.exec(body)) !== null && subjectCount < 3) {
      subjectCount += 1;
      const toId = nodeIdForUnresolved(documentId, `subject-to-${sn.sectionRef}-${sm.index}`);
      ensureNode(nodes, {
        nodeId: toId,
        kind: "UNRESOLVED_TARGET",
        documentId,
        label: `subject-to @ ${sn.sectionRef}`,
        sectionRef: sn.sectionRef,
        unitId: null,
        termName: null,
        materiality: null,
        notes: "Remote condition connective in section body; target not uniquely resolved without section-ref binding.",
      });
      pushSectionEdge(
        "COVENANT_TO_CONDITION",
        toId,
        "UNRESOLVED",
        `Section ${sn.sectionRef} contains remote-condition connective 'subject to' (fail-closed; target unresolved).`,
        body.slice(Math.max(0, sm.index - 40), sm.index + 80),
        bodyStart + sm.index,
        bodyStart + sm.index + sm[0]!.length,
        "Remote condition connective found; destination provision not uniquely resolved.",
      );
    }

    const exceptRe = /\bexcept\s+as\s+(?:provided|set\s+forth|permitted)\b|\bpermitted\s+by\b/gi;
    let em: RegExpExecArray | null;
    let exceptCount = 0;
    while ((em = exceptRe.exec(body)) !== null && exceptCount < 3) {
      exceptCount += 1;
      const toId = nodeIdForUnresolved(documentId, `except-${sn.sectionRef}-${em.index}`);
      ensureNode(nodes, {
        nodeId: toId,
        kind: "UNRESOLVED_TARGET",
        documentId,
        label: `exception @ ${sn.sectionRef}`,
        sectionRef: sn.sectionRef,
        unitId: null,
        termName: null,
        materiality: null,
        notes: null,
      });
      pushSectionEdge(
        "COVENANT_TO_EXCEPTION",
        toId,
        "UNRESOLVED",
        `Section ${sn.sectionRef} contains exception connective '${em[0]}' (fail-closed; target unresolved).`,
        body.slice(Math.max(0, em.index - 40), em.index + 80),
        bodyStart + em.index,
        bodyStart + em.index + em[0]!.length,
        "Exception connective found; destination provision not uniquely resolved.",
      );
    }

    if (/\bas\s+amended\b/i.test(body)) {
      const toId = nodeIdForUnresolved(documentId, `amended-${sn.sectionRef}`);
      ensureNode(nodes, {
        nodeId: toId,
        kind: "UNRESOLVED_TARGET",
        documentId,
        label: `as amended @ ${sn.sectionRef}`,
        sectionRef: sn.sectionRef,
        unitId: null,
        termName: null,
        materiality: null,
        notes: "Amendment connective local to section; chain resolution coordinates with PR #150.",
      });
      pushSectionEdge(
        "COVENANT_TO_AMENDMENT",
        toId,
        "UNRESOLVED",
        `Section ${sn.sectionRef} contains amendment connective 'as amended' (fail-closed; amendment target not uniquely resolved).`,
        body.slice(0, 200),
        bodyStart,
        bodyStart + Math.min(200, body.length),
        "Amendment connective found; amendment-chain target resolution deferred (coordinate PR #150).",
      );
    }

    // Ratio references in covenantish bodies (financial covenant / basket tests).
    const ratioRe = /\b(?:Total\s+Net\s+|First\s+Lien\s+|Senior\s+Secured\s+)?Leverage\s+Ratio\b|\bInterest\s+Coverage\s+Ratio\b|\bFixed\s+Charge\s+Coverage(?:\s+Ratio)?\b/gi;
    let rm: RegExpExecArray | null;
    while ((rm = ratioRe.exec(body)) !== null) {
      const label = rm[0]!.replace(/\s+/g, " ");
      const toId = defByNorm.has(label.toLowerCase())
        ? nodeIdForTerm(documentId, label)
        : nodeIdForUnresolved(documentId, `ratio-ref-${label}`);
      if (!defByNorm.has(label.toLowerCase())) {
        ensureNode(nodes, {
          nodeId: toId,
          kind: "UNRESOLVED_TARGET",
          documentId,
          label,
          sectionRef: null,
          unitId: null,
          termName: label,
          materiality: null,
          notes: "Ratio reference in covenant body without local ratio definition.",
        });
      }
      pushSectionEdge(
        "RATIO_CALCULATION",
        toId,
        defByNorm.has(label.toLowerCase()) ? "RESOLVED" : "UNRESOLVED",
        `Section ${sn.sectionRef} references ratio '${label}'.`,
        body.slice(Math.max(0, rm.index - 40), rm.index + label.length + 40),
        bodyStart + rm.index,
        bodyStart + rm.index + rm[0]!.length,
        defByNorm.has(label.toLowerCase()) ? null : `Ratio '${label}' not located as a structural definition in this document.`,
      );
    }
  }

  // Typed cross-references with legal connectives near the reference mention.
  for (const ref of references) {
    const fromNode = structuralNodes.find((n) => n.nodeId === ref.sourceNodeId) ?? null;
    const fromId = fromNode ? nodeIdForSection(documentId, fromNode.sectionRef) : nodeIdForUnresolved(documentId, `ref-source-${ref.referenceText.slice(0, 40)}`);
    if (!fromNode) {
      ensureNode(nodes, {
        nodeId: fromId,
        kind: "UNRESOLVED_TARGET",
        documentId,
        label: ref.referenceText,
        sectionRef: null,
        unitId: null,
        termName: null,
        materiality: null,
        notes: "Reference source node missing from structural parse.",
      });
    } else {
      ensureNode(nodes, {
        nodeId: fromId,
        kind: isCovenantishSection(fromNode.sectionRef, fromNode.heading) ? "COVENANT" : "SECTION",
        documentId,
        label: fromNode.heading || fromNode.sectionRef,
        sectionRef: fromNode.sectionRef,
        unitId: fromNode.nodeId,
        termName: null,
        materiality: null,
        notes: null,
      });
    }

    const ctxStart = Math.max(0, ref.charStart - 80);
    const ctx = text.slice(ctxStart, Math.min(text.length, ref.charEnd + 80));
    let matched: (typeof CONNECTIVE_RULES)[number] | null = null;
    for (const rule of CONNECTIVE_RULES) {
      if (rule.re.test(ctx)) {
        matched = rule;
        break;
      }
    }
    if (!matched) continue; // no legal connective — do not admit similarity-only edge

    let kind = matched.kind;
    let toId: string;
    let resolution: AtlasEdge["resolution"] = "UNRESOLVED";
    let unresolvedReason: string | null = null;
    let sharedBasketKey: string | null = null;

    if (kind === "COVENANT_TO_CROSS_DOCUMENT") {
      toId = nodeIdForCrossDocument(ref.referenceText);
      ensureNode(nodes, {
        nodeId: toId,
        kind: "CROSS_DOCUMENT_TARGET",
        documentId,
        label: ref.referenceText,
        sectionRef: null,
        unitId: null,
        termName: null,
        materiality: null,
        notes: null,
      });
      unresolvedReason = "Cross-document instrument reference; target not in this document text.";
    } else if (kind === "COVENANT_TO_SHARED_BASKET") {
      sharedBasketKey = /Available\s+Amount/i.test(ctx) ? "Available Amount" : "SHARED_CAPACITY";
      toId = nodeIdForTerm(documentId, sharedBasketKey);
      ensureNode(nodes, {
        nodeId: toId,
        kind: "SHARED_BASKET",
        documentId,
        label: sharedBasketKey,
        sectionRef: sectionRefOf(defByNorm.get(sharedBasketKey.toLowerCase())?.sourceNodeId ?? null),
        unitId: null,
        termName: sharedBasketKey,
        materiality: null,
        notes: null,
      });
      resolution = defByNorm.has(sharedBasketKey.toLowerCase()) ? "RESOLVED" : "UNRESOLVED";
      unresolvedReason = resolution === "RESOLVED" ? null : `Shared basket '${sharedBasketKey}' not located as a structural definition.`;
    } else if (kind === "ENTITY_SCOPE") {
      toId = `${fromId}::entity_scope`;
      ensureNode(nodes, {
        nodeId: toId,
        kind: "ENTITY_SCOPE_RULE",
        documentId,
        label: `Entity scope signal @ ${fromNode?.sectionRef ?? "unknown"}`,
        sectionRef: fromNode?.sectionRef ?? null,
        unitId: fromNode?.nodeId ?? null,
        termName: null,
        materiality: null,
        notes: "Entity-scope term co-located with typed cross-reference connective window.",
      });
      resolution = "RESOLVED";
    } else if (kind === "RECLASSIFICATION") {
      toId = nodeIdForUnresolved(documentId, `reclass-${ref.referenceText}`);
      ensureNode(nodes, {
        nodeId: toId,
        kind: "UNRESOLVED_TARGET",
        documentId,
        label: `reclassification @ ${ref.referenceText}`,
        sectionRef: ref.referenceText,
        unitId: null,
        termName: null,
        materiality: null,
        notes: null,
      });
      unresolvedReason = "Reclassification connective found; destination provision not uniquely resolved.";
    } else {
      // Prefer the structural reference detector's own resolution (never fuzzy).
      const targetRef = ref.normalizedTarget || ref.referenceText.replace(/^Sections?\s+/i, "").trim();
      const targetNode = ref.targetNodeId ? nodeById.get(ref.targetNodeId) ?? null : null;
      if (ref.resolved && targetNode) {
        toId = nodeIdForSection(documentId, targetNode.sectionRef);
        ensureNode(nodes, {
          nodeId: toId,
          kind: "SECTION",
          documentId,
          label: targetNode.heading || targetNode.sectionRef,
          sectionRef: targetNode.sectionRef,
          unitId: targetNode.nodeId,
          termName: null,
          materiality: null,
          notes: null,
        });
        resolution = "RESOLVED";
      } else if (ref.targetAmbiguous) {
        toId = nodeIdForUnresolved(documentId, `ambiguous-${targetRef}`);
        ensureNode(nodes, {
          nodeId: toId,
          kind: "UNRESOLVED_TARGET",
          documentId,
          label: `ambiguous ${targetRef}`,
          sectionRef: targetRef,
          unitId: null,
          termName: null,
          materiality: null,
          notes: null,
        });
        resolution = "AMBIGUOUS";
        unresolvedReason = `Ambiguous structural reference to ${targetRef}.`;
      } else {
        toId = nodeIdForUnresolved(documentId, `section-${targetRef}`);
        ensureNode(nodes, {
          nodeId: toId,
          kind: "UNRESOLVED_TARGET",
          documentId,
          label: targetRef,
          sectionRef: targetRef,
          unitId: null,
          termName: null,
          materiality: null,
          notes: null,
        });
        unresolvedReason = ref.unresolvedReason ?? `Reference '${ref.referenceText}' did not uniquely resolve in the structural index.`;
      }
    }

    addEdge(edges, {
      edgeId: edgeIdOf(kind, fromId, toId, sha16(ref.referenceText + String(ref.charStart))),
      kind,
      fromNodeId: fromId,
      toNodeId: toId,
      resolution,
      confidence: resolution === "RESOLVED" ? "MEDIUM" : "LOW",
      evidenceClass: "STRUCTURAL_CROSS_REFERENCE",
      rationale: `Structural cross-reference '${ref.referenceText}' with connective '${matched.label}'.`,
      sourceSpans: [
        {
          documentId,
          sourceFile,
          sectionRef: fromNode?.sectionRef ?? null,
          unitId: fromNode?.nodeId ?? null,
          charStart: ref.charStart,
          charEnd: ref.charEnd,
          excerpt: ctx.slice(0, 220),
        },
      ],
      unresolvedReason,
      sharedBasketKey,
      financialInputKey: null,
      rootCause: null,
      controllingRestrictionRisk: false,
    });
  }

  // Ratio definitions: term name contains Ratio and body has compositional deps.
  // Component matching uses defined terms appearing in the Atlas body window after a
  // ratio connective — not production charEnd (which ends at "means").
  for (const d of definitions) {
    if (!/ratio/i.test(d.exactTerm)) continue;
    const fromId = nodeIdForTerm(documentId, d.exactTerm);
    const { body, bodyStart } = definitionBodyWindow(text, d, nextDefStartAfter(d.charStart));
    if (!/\bratio\b|\bdivided by\b|\bto\b/i.test(body.slice(0, 500))) continue;
    for (const other of definitions) {
      if (other.normalizedTerm === d.normalizedTerm) continue;
      if (other.exactTerm.length < 4) continue;
      // Prefer classic financial components; also admit defined terms named in "ratio of (a) X to (b) Y".
      const classic = /\b(EBITDA|Indebtedness|Interest|Cash|Income|Assets|Debt|Loan|Collateral|Market Value|LTV)\b/i.test(other.exactTerm);
      const termRe = new RegExp(`\\b${other.exactTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      const m = body.match(termRe);
      if (!m || m.index == null) continue;
      if (!classic && m.index > 500) continue; // non-classic components must appear near the ratio formula head
      if (!classic && !/\bratio of\b|\bexpressed as\b|\bpercentage\b/i.test(body.slice(0, Math.min(body.length, m.index + 80)))) continue;
      const toId = nodeIdForTerm(documentId, other.exactTerm);
      addEdge(edges, {
        edgeId: edgeIdOf("RATIO_CALCULATION", fromId, toId),
        kind: "RATIO_CALCULATION",
        fromNodeId: fromId,
        toNodeId: toId,
        resolution: "RESOLVED",
        confidence: "MEDIUM",
        evidenceClass: "STRUCTURAL_DEFINITION_OCCURRENCE",
        rationale: `Ratio definition '${d.exactTerm}' references component '${other.exactTerm}' (Atlas definition-body window).`,
        sourceSpans: [
          {
            documentId,
            sourceFile,
            sectionRef: sectionRefOf(d.sourceNodeId) ?? null,
            unitId: null,
            charStart: bodyStart + m.index,
            charEnd: bodyStart + m.index + other.exactTerm.length,
            excerpt: body.slice(Math.max(0, m.index - 40), m.index + other.exactTerm.length + 40).slice(0, 200),
          },
        ],
        unresolvedReason: null,
        sharedBasketKey: null,
        financialInputKey: null,
        rootCause: null,
        controllingRestrictionRisk: false,
      });
    }
  }

  void index; // structural index built for health / future expansion

  const nodeList = [...nodes.values()].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  let edgeList = annotateEdgesWithRootCause([...edges.values()].sort((a, b) => a.edgeId.localeCompare(b.edgeId)));
  const analysis = analyzeGraph(nodeList, edgeList);

  const covenantSections = sectionNodes(structuralNodes).filter((n) => isCovenantishSection(n.sectionRef, n.heading));
  const unitsWithEdges = new Set(edgeList.map((e) => e.fromNodeId)).size;

  const completeness = buildCompletenessReport({
    documentId,
    sourceFile,
    nodeCount: nodeList.length,
    edges: edgeList,
    diamondCount: analysis.diamondCount,
    cycleCount: analysis.cycleCount,
    expectations: {
      expectedMinimumByKind: {
        COVENANT_TO_DEFINITION: Math.min(3, covenantSections.length > 0 ? 1 : 0),
      },
      gapHints: [
        "STRUCTURAL_INDEX_ONLY extraction — no Phase-3F ground-truth assistance.",
        `split=${input.split}; issuer=${input.issuer ?? "unknown"}`,
      ],
      inventoryUnitCount: Math.max(1, covenantSections.length + definitions.length),
      unitsWithEdges,
    },
  });

  return {
    documentId,
    sourceFile,
    packageId,
    extractionMode: "STRUCTURAL_INDEX_ONLY",
    nodes: nodeList,
    edges: edgeList,
    motifs: analysis.motifs,
    completeness,
  };
}
