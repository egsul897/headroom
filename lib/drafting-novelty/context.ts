/**
 * Controlling-context recovery for novelty findings.
 *
 * Does NOT classify legal consequences from isolated short windows.
 * Marks CONTEXT_INCOMPLETE when parent prohibition / provisos / defs are missing.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { normalizeDraftingText } from "./normalize";
import type { NoveltyFinding, SourceSpan } from "./types";
import type { ContextCompleteness, ControllingContext } from "./phase2-types";

function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function spanOf(documentId: string, path: string, text: string, start: number, end: number): SourceSpan {
  const excerpt = text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 600);
  return { documentId, path, charStart: start, charEnd: end, excerpt };
}

function findSectionBounds(text: string, anchor: number): { start: number; end: number } {
  const sectionRe = /(?:^|\n)\s*(?:SECTION|Section|ARTICLE|Article)\s+[0-9]+/g;
  let start = 0;
  let end = text.length;
  let m: RegExpExecArray | null;
  const starts: number[] = [0];
  while ((m = sectionRe.exec(text)) !== null) {
    if (typeof m.index === "number") starts.push(m.index);
  }
  starts.push(text.length);
  for (let i = 0; i < starts.length - 1; i++) {
    if (starts[i]! <= anchor && anchor < starts[i + 1]!) {
      start = starts[i]!;
      end = starts[i + 1]!;
      break;
    }
  }
  // Cap controlling provision length for artifact size, but keep far more than 1400.
  end = Math.min(end, start + 12000);
  return { start, end };
}

function extractProvisoSpans(documentId: string, path: string, sectionText: string, sectionStart: number): SourceSpan[] {
  const out: SourceSpan[] = [];
  const re = /\bprovided that\b|\bprovided,? however\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sectionText)) !== null) {
    const local = m.index;
    const abs = sectionStart + local;
    const end = Math.min(sectionText.length, local + 900);
    out.push(spanOf(documentId, path, sectionText, local, end));
    // rewrite absolute into returned span
    out[out.length - 1] = {
      documentId,
      path,
      charStart: abs,
      charEnd: sectionStart + end,
      excerpt: sectionText.slice(local, end).replace(/\s+/g, " ").trim().slice(0, 600),
    };
    if (out.length >= 8) break;
  }
  return out;
}

function extractDefinedTerms(sectionText: string): string[] {
  const terms = new Set<string>();
  for (const m of sectionText.matchAll(/[“"]([A-Z][^”"]{1,80})[”"]/g)) {
    if (m[1]) terms.add(m[1].trim());
  }
  return [...terms].sort().slice(0, 40);
}

function findDefinitionSpan(
  fullText: string,
  documentId: string,
  path: string,
  term: string,
): SourceSpan | undefined {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`[“"]${escaped}[”"]\\s*(?:means|has the meaning)`, "i");
  const m = re.exec(fullText);
  if (!m || typeof m.index !== "number") return undefined;
  const start = m.index;
  const end = Math.min(fullText.length, start + 1200);
  return spanOf(documentId, path, fullText, start, end);
}

function extractCrossReferences(sectionText: string): string[] {
  const refs = new Set<string>();
  for (const m of sectionText.matchAll(/\bSection\s+[0-9]+(?:\.[0-9]+)?(?:\([a-z0-9]+\))*/gi)) {
    refs.add(m[0]!.replace(/\s+/g, " "));
  }
  for (const m of sectionText.matchAll(/\b(?:Exhibit|Schedule)\s+[A-Z0-9.\-]+/gi)) {
    refs.add(m[0]!.replace(/\s+/g, " "));
  }
  return [...refs].sort().slice(0, 40);
}

export function recoverControllingContext(finding: NoveltyFinding, repoRoot = process.cwd()): ControllingContext {
  const path = finding.span.path;
  const abs = path.startsWith("/") ? path : `${repoRoot}/${path}`;
  const missingPieces: string[] = [];
  const notes: string[] = [];

  if (!existsSync(abs)) {
    return {
      findingId: finding.findingId,
      completeness: "CONTEXT_INCOMPLETE",
      documentHash: "",
      windowHash: hashText(finding.span.excerpt),
      controllingSpan: finding.span,
      provisos: [],
      definedTerms: [],
      crossReferences: [],
      amendmentHints: [],
      relatedDocumentHints: [],
      missingPieces: ["source_file_missing"],
      notes: ["Cannot recover controlling context — source file absent."],
    };
  }

  const raw = readFileSync(abs, "utf8");
  const text = normalizeDraftingText(raw);
  const documentHash = hashText(text);
  const windowHash = hashText(text.slice(finding.span.charStart, finding.span.charEnd));

  // Validate stored offsets still map; if drift, search for excerpt.
  let anchor = finding.span.charStart;
  const storedSlice = text.slice(finding.span.charStart, finding.span.charEnd);
  if (!storedSlice.includes(finding.span.excerpt.slice(0, 40)) && finding.span.excerpt.length > 40) {
    const relocated = text.indexOf(finding.span.excerpt.slice(0, 80));
    if (relocated >= 0) {
      anchor = relocated;
      notes.push("Relocated window via excerpt search after normalization drift.");
    } else {
      missingPieces.push("window_offset_unverified");
    }
  }

  const bounds = findSectionBounds(text, anchor);
  const sectionText = text.slice(bounds.start, bounds.end);
  const controllingSpan = spanOf(finding.span.documentId, path, text, bounds.start, bounds.end);

  // Parent prohibition / chapeau heuristics inside section.
  let parentProhibition: SourceSpan | undefined;
  let chapeau: SourceSpan | undefined;
  const prohib = /\b(?:shall not|will not|may not|the Borrower shall not|no (?:Loan Party|Restricted Subsidiary))\b/i.exec(sectionText);
  if (prohib && typeof prohib.index === "number") {
    parentProhibition = {
      documentId: finding.span.documentId,
      path,
      charStart: bounds.start + prohib.index,
      charEnd: Math.min(bounds.end, bounds.start + prohib.index + 500),
      excerpt: sectionText.slice(prohib.index, prohib.index + 500).replace(/\s+/g, " ").trim(),
    };
  } else {
    missingPieces.push("parent_prohibition");
  }

  // Chapeau: text before first lettered (a)/(b) clause after section head.
  const letter = /\n\s*\(([a-z]|[ivx]+)\)\s+/i.exec(sectionText);
  if (letter && typeof letter.index === "number" && letter.index > 40) {
    chapeau = spanOf(finding.span.documentId, path, sectionText, 0, Math.min(letter.index, 800));
    chapeau = {
      ...chapeau,
      charStart: bounds.start,
      charEnd: bounds.start + Math.min(letter.index, 800),
    };
  } else {
    missingPieces.push("chapeau");
  }

  const provisos = extractProvisoSpans(finding.span.documentId, path, sectionText, bounds.start);
  if (provisos.length === 0 && /\bprovided that\b/i.test(finding.span.excerpt)) {
    missingPieces.push("proviso_span");
  }

  const termNames = extractDefinedTerms(sectionText);
  const definedTerms: ControllingContext["definedTerms"] = [];
  for (const term of termNames.slice(0, 12)) {
    const def = findDefinitionSpan(text, finding.span.documentId, path, term);
    if (def) definedTerms.push({ term, span: def });
  }
  if (termNames.length > 0 && definedTerms.length === 0) {
    missingPieces.push("defined_term_bodies");
  }

  const crossReferences = extractCrossReferences(sectionText);
  const amendmentHints: string[] = [];
  if (/\bamendment\b/i.test(sectionText)) amendmentHints.push("section_mentions_amendment");
  if (/amended and restated/i.test(text.slice(0, 2000))) amendmentHints.push("document_is_amended_restated");

  const relatedDocumentHints: string[] = [];
  for (const m of sectionText.matchAll(/\b(?:Intercreditor Agreement|Indenture|ABL Credit Agreement|Notes|Security Agreement)\b/g)) {
    relatedDocumentHints.push(m[0]!);
  }

  let completeness: ContextCompleteness = "COMPLETE";
  if (missingPieces.includes("source_file_missing") || missingPieces.includes("window_offset_unverified")) {
    completeness = "CONTEXT_INCOMPLETE";
  } else if (missingPieces.length >= 2 || sectionText.length < 400) {
    completeness = "PARTIAL";
  }
  // Isolated short window without recovered section → incomplete.
  if (bounds.end - bounds.start <= 1500 && finding.span.charEnd - finding.span.charStart <= 1400) {
    if (!parentProhibition && provisos.length === 0) {
      completeness = "CONTEXT_INCOMPLETE";
      missingPieces.push("controlling_provision_too_narrow");
      notes.push("Refusing legal-consequence classification from isolated ≤1400-char window without recovered parent context.");
    }
  }

  return {
    findingId: finding.findingId,
    completeness,
    documentHash,
    windowHash,
    controllingSpan,
    parentProhibition,
    chapeau,
    provisos,
    definedTerms,
    crossReferences,
    amendmentHints: [...new Set(amendmentHints)],
    relatedDocumentHints: [...new Set(relatedDocumentHints)].slice(0, 20),
    missingPieces: [...new Set(missingPieces)],
    notes,
  };
}

export function recoverContextsForFindings(findings: NoveltyFinding[], repoRoot = process.cwd()): ControllingContext[] {
  return findings.map((f) => recoverControllingContext(f, repoRoot));
}
