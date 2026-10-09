/**
 * Deterministic covenant-family candidate discovery (no LLM).
 */

import { createHash } from "node:crypto";
import { classifyFamiliesFromText } from "../taxonomy/families";
import { scoreDiscoveryPotential } from "../rank/discovery-score";
import { detectPatternsInText } from "../patterns/library";
import { normalizeStructureScanText } from "./structural";
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
  const scan = normalizeStructureScanText(text);
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
    const span = operativeSpan(node, sectionNodes, scan.length);
    const fullSpan = scan.slice(span.start, span.end);
    // Inherit parent section/article heading so 10.04(i) under "Investments" is not
    // primarily classified as INDEBTEDNESS from body mentions alone.
    const parentHeading = ancestralHeadings(node, byId);
    const headingForFamily = [parentHeading, node.heading].filter(Boolean).join(" / ");
    const families = classifyFamiliesFromText(fullSpan.slice(0, 4000), headingForFamily);
    if (families.length === 1 && families[0] === "UNKNOWN") {
      // Keep UNKNOWN only when heading still looks covenant-relevant.
      if (!/\b(?:Indebtedness|Lien|Restricted|Investment|Disposition|Affiliate|Covenant|Default|Guarantee|Subsidiary|Prepayment|Incremental|Available Amount|Sale|Fundamental)\b/i.test(node.heading + fullSpan.slice(0, 400))) {
        continue;
      }
    }
    const rank = scoreDiscoveryPotential(fullSpan.slice(0, 4000), node.heading);
    if (rank.score < 2 && families[0] === "UNKNOWN") continue;
    const mergedFamilies = uniqueFamilies([...families, ...rank.families]);
    // Negative-covenant / capacity sections often bury growers, Available Amount
    // builders, reclassification elections, and shared caps deep in lettered
    // exceptions — keep a longer span and stitch head+tail so closing
    // compliance / reclass paragraphs are not dropped (CONMED §7.2 pattern).
    const capacitySection =
      /\b(?:Indebtedness|Liens?|Restricted\s+Payments?|Investments?|Dispositions?|Asset\s+Sales?|Available\s+Amount|Incremental)\b/i.test(
        headingForFamily,
      ) ||
      mergedFamilies.some((f) =>
        ["INDEBTEDNESS", "LIENS", "RESTRICTED_PAYMENTS", "INVESTMENTS", "ASSET_SALES"].includes(f),
      );
    const excerptCap = capacitySection ? 5200 : 1600;
    const excerpt = stitchHeadTail(fullSpan, excerptCap);
    out.push({
      candidateId: candidateId(sourceId, node.nodeId),
      sourceId,
      nodeId: node.nodeId,
      families: mergedFamilies,
      signals: [...rank.signals, ...detectPatternsInText(excerpt).map((p) => `pattern:${p}`)],
      excerpt,
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: rank.score,
    });
  }

  // Document-level fallback when structure is sparse but text is rich.
  if (out.length === 0 && scan.length > 2000) {
    const rank = scoreDiscoveryPotential(scan.slice(0, 100_000));
    if (rank.score >= 6) {
      out.push({
        candidateId: candidateId(sourceId, "document-fallback"),
        sourceId,
        families: rank.families.length ? rank.families : ["UNKNOWN"],
        signals: [...rank.signals, "sparse_structure_document_fallback"],
        excerpt: scan.slice(0, 800),
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: rank.score,
      });
    }
  }

  return out;
}

const EXCERPT_HOTSPOTS: RegExp[] = [
  /\bwithout duplication\s+for purposes of\s+Section\b/gi,
  /\bFixed Incremental Amount\b/gi,
  /\bIncremental Cap\b/gi,
  /\bIncremental Prepayment Amount\b/gi,
  /\bPrepayment Incremental Amount\b/gi,
  /\bclassify or reclassify\b/gi,
  /\blater divide,\s*classify or reclassify\b/gi,
  /\bAvailable Amount(?:\s+Builder Basket)?\b/gi,
  /\bNot Otherwise Applied\b/gi,
  /\bRatio Incremental Amount\b/gi,
];

/** Prefer head + relationship hotspots + tail when a long section exceeds budget. */
export function stitchHeadTail(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const headBudget = Math.floor(budget * 0.48);
  const tailBudget = Math.floor(budget * 0.22);
  const hotBudget = budget - headBudget - tailBudget - 40;
  const windows: Array<{ start: number; end: number }> = [];
  for (const re of EXCERPT_HOTSPOTS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    let hits = 0;
    while ((m = g.exec(text)) !== null && hits < 4) {
      hits++;
      windows.push({
        start: Math.max(0, m.index - 160),
        end: Math.min(text.length, m.index + m[0].length + 380),
      });
    }
  }
  windows.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end + 40) last.end = Math.max(last.end, w.end);
    else merged.push({ ...w });
  }
  const hotParts: string[] = [];
  let used = 0;
  for (const w of merged) {
    if (used >= hotBudget) break;
    // Skip windows already covered by head/tail slices.
    if (w.end <= headBudget) continue;
    if (w.start >= text.length - tailBudget) continue;
    const slice = text.slice(w.start, Math.min(w.end, w.start + (hotBudget - used)));
    if (!slice.trim()) continue;
    hotParts.push(slice);
    used += slice.length + 24;
  }
  const head = text.slice(0, headBudget);
  const tail = text.slice(text.length - tailBudget);
  if (!hotParts.length) {
    return `${text.slice(0, Math.floor(budget * 0.62))}\n/*[…mid-section omitted…]*/\n${text.slice(text.length - Math.floor(budget * 0.35))}`;
  }
  return `${head}\n/*[…hotspots…]*/\n${hotParts.join("\n/*[…]*/\n")}\n/*[…tail…]*/\n${tail}`;
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
