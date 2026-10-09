/**
 * Deterministic covenant-family candidate discovery (no LLM).
 */

import { createHash } from "node:crypto";
import { classifyFamiliesFromText } from "../taxonomy/families";
import { scoreDiscoveryPotential } from "../rank/discovery-score";
import { detectPatternsInText } from "../patterns/library";
import type { CovenantCandidateRecord, KnowledgeTaxonomyFamily, StructuralNodeRecord } from "../types";

/** Expand heading-only spans to the next section start so body text is analyzed. */
function operativeSpan(
  node: StructuralNodeRecord,
  sectionNodes: StructuralNodeRecord[],
  textLen: number,
): { start: number; end: number } {
  const start = node.charStart;
  const later = sectionNodes
    .filter((n) => n.charStart > node.charStart)
    .sort((a, b) => a.charStart - b.charStart);
  const nextStart = later[0]?.charStart;
  // Prefer next-section boundary; fall back to at least 2.5k chars of body.
  const end = Math.min(
    textLen,
    Math.max(node.charEnd, nextStart ?? node.charStart + 2500, node.charStart + 2500),
  );
  // If next section is close, stop before it.
  if (nextStart != null && nextStart > start) {
    return { start, end: Math.min(textLen, Math.max(node.charEnd, nextStart)) };
  }
  return { start, end };
}

export function discoverCovenantCandidates(
  sourceId: string,
  text: string,
  nodes: StructuralNodeRecord[],
): CovenantCandidateRecord[] {
  const out: CovenantCandidateRecord[] = [];
  // Include ambiguous section candidates when they carry a usable sectionRef —
  // curated/HTML exhibits often triage headings as ambiguous while still
  // providing source-backed spans suitable for discovery (not verification).
  const sectionNodes = nodes
    .filter(
      (n) =>
        (n.nodeType === "SECTION" || n.nodeType === "ARTICLE" || n.nodeType === "SUBSECTION") &&
        (!n.ambiguous || /^[\dA-Za-z.()-]+$/.test(n.sectionRef)),
    )
    .sort((a, b) => a.charStart - b.charStart);

  const byId = new Map(nodes.map((n) => [n.nodeId, n]));

  for (const node of sectionNodes) {
    const span = operativeSpan(node, sectionNodes, text.length);
    const excerpt = text.slice(span.start, Math.min(span.end, span.start + 4000));
    // Inherit parent section/article heading so 10.04(i) under "Investments" is not
    // primarily classified as INDEBTEDNESS from body mentions alone.
    const parentHeading = ancestralHeadings(node, byId);
    const headingForFamily = [parentHeading, node.heading].filter(Boolean).join(" / ");
    const families = classifyFamiliesFromText(excerpt, headingForFamily);
    if (families.length === 1 && families[0] === "UNKNOWN") {
      // Keep UNKNOWN only when heading still looks covenant-relevant.
      if (!/\b(?:Indebtedness|Lien|Restricted|Investment|Disposition|Affiliate|Covenant|Default|Guarantee|Subsidiary|Prepayment|Incremental|Available Amount|Sale|Fundamental)\b/i.test(node.heading + excerpt.slice(0, 400))) {
        continue;
      }
    }
    const rank = scoreDiscoveryPotential(excerpt, node.heading);
    if (rank.score < 2 && families[0] === "UNKNOWN") continue;
    const mergedFamilies = uniqueFamilies([...families, ...rank.families]);
    // Negative-covenant / capacity sections often bury growers, Available Amount
    // builders, and shared caps deep in lettered exceptions — keep a longer span.
    const capacitySection =
      /\b(?:Indebtedness|Liens?|Restricted\s+Payments?|Investments?|Dispositions?|Asset\s+Sales?|Available\s+Amount|Incremental)\b/i.test(
        headingForFamily,
      ) ||
      mergedFamilies.some((f) =>
        ["INDEBTEDNESS", "LIENS", "RESTRICTED_PAYMENTS", "INVESTMENTS", "ASSET_SALES"].includes(f),
      );
    const excerptCap = capacitySection ? 3600 : 1600;
    out.push({
      candidateId: candidateId(sourceId, node.nodeId),
      sourceId,
      nodeId: node.nodeId,
      families: mergedFamilies,
      signals: [...rank.signals, ...detectPatternsInText(excerpt).map((p) => `pattern:${p}`)],
      excerpt: excerpt.slice(0, excerptCap),
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: rank.score,
    });
  }

  // Document-level fallback when structure is sparse but text is rich.
  if (out.length === 0 && text.length > 2000) {
    const rank = scoreDiscoveryPotential(text.slice(0, 100_000));
    if (rank.score >= 6) {
      out.push({
        candidateId: candidateId(sourceId, "document-fallback"),
        sourceId,
        families: rank.families.length ? rank.families : ["UNKNOWN"],
        signals: [...rank.signals, "sparse_structure_document_fallback"],
        excerpt: text.slice(0, 800),
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: rank.score,
      });
    }
  }

  return out;
}

function ancestralHeadings(
  node: StructuralNodeRecord,
  byId: Map<string, StructuralNodeRecord>,
): string {
  const parts: string[] = [];
  let cur: StructuralNodeRecord | undefined = node.parentNodeId
    ? byId.get(node.parentNodeId)
    : undefined;
  let guard = 0;
  while (cur && guard++ < 6) {
    if (cur.heading) parts.push(cur.heading);
    cur = cur.parentNodeId ? byId.get(cur.parentNodeId) : undefined;
  }
  return parts.join(" / ");
}

function uniqueFamilies(families: KnowledgeTaxonomyFamily[]): KnowledgeTaxonomyFamily[] {
  const seen = new Set<KnowledgeTaxonomyFamily>();
  const out: KnowledgeTaxonomyFamily[] = [];
  for (const f of families) {
    if (seen.has(f)) continue;
    seen.add(f);
    out.push(f);
  }
  return out.length ? out : ["UNKNOWN"];
}

function candidateId(sourceId: string, nodeId: string): string {
  return createHash("sha256").update(`${sourceId}|${nodeId}`).digest("hex").slice(0, 24);
}
