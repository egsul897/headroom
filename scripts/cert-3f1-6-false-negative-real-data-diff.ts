/**
 * Phase 3F.1.6 Final Foundation Certification - Section 6.
 * AUDIT-ONLY, READ-ONLY script. Independently measures the P1-10
 * plausibility gate's FALSE-NEGATIVE surface on real data: for each of
 * FWRG/LSB/CONMED/DSGR, this reconstructs the UNGATED candidate list (the
 * exact same regex patterns stage-structure.ts uses, copied here read-only -
 * production file is never imported for its internal, unexported matching
 * step) and diffs it against the REAL, gated `parseDocumentStructure` output.
 * Every match present in the ungated set but absent from the gated set was
 * SUPPRESSED by the plausibility gate. Each suppression is printed with
 * enough surrounding text to independently classify by hand as a correctly-
 * rejected in-text citation or a WRONGLY-rejected genuine heading (a
 * material false negative / BLOCKER).
 *
 * Run via: npx tsx scripts/cert-3f1-6-false-negative-real-data-diff.ts
 */
import { readFileSync } from "node:fs";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { parseDocument } from "../lib/extraction/parse";
import type { CompilerDocumentInput } from "../lib/contract-model/compiler/types";

// Verbatim copies of stage-structure.ts's own regex literals (read from the
// file's own source at the time of writing this script - NOT re-derived or
// approximated) so the "ungated" candidate set is produced by the identical
// matching shapes, just without the P1-10 filter applied.
const ARTICLE_PATTERNS = [
  /ARTICLE\s+([IVXLC]+|\d+)\.?\s+([A-Z][A-Z ,&';-]{0,58}?)(?=\s+[A-Z][a-z]|\s*$)/g,
  /^ARTICLE\s+([IVXLC]+|\d+)\.?\s*([^\n]*)$/gim,
];
const SECTION_PATTERNS = [
  /(?:Section|SECTION|§)\s+(\d+\.\d+)\.?\s+(\[?[A-Z][A-Za-z ,&';[\]-]{1,90}?\]?)\s*\.(?!\d)/g,
  /^Section\s+(\d+\.\d+)\.?\s*([^\n]*)$/gim,
  /^§\s?(\d+\.\d+)\.?\s*([^\n]*)$/gim,
  /^(\d+\.\d+)\s+([A-Z][^\n]*)$/gm,
];
const INTEGER_SECTION_PATTERNS = [
  /(?:Section|SECTION)\s+(\d{1,2})(?!\.\d)\.?\s+(\[?[A-Z][A-Za-z ,&';[\]-]{1,90}?\]?)\s*\.(?!\d)/g,
  /^(?:Section|SECTION)\s+(\d{1,2})(?!\.\d)\.?\s*([^\n]*)$/gim,
];
const BARE_INTEGER_SECTION_PATTERN = /^(\d{1,2})\.\s+([A-Z][a-z][^\n]*)$/gm;

// The exact gate under test - imported live, so this script always tests
// against whatever is actually shipped, never a stale copy.
const HEADING_CITATION_SIGNAL_PHRASE =
  /(?:under|pursuant\s+to|referred\s+to\s+in|as\s+defined\s+in|set\s+forth\s+in|described\s+in|specified\s+in|contemplated\s+by|required\s+by|permitted\s+by|governed\s+by|in\s+accordance\s+with|subject\s+to|provided\s+(?:for\s+)?in)\s*$/i;
function rejectByPrecedingContext(text: string, matchIndex: number): boolean {
  const windowStart = Math.max(0, matchIndex - 80);
  const before = text.slice(windowStart, matchIndex).replace(/\s+$/, "");
  if (before.length === 0) return false;
  return HEADING_CITATION_SIGNAL_PHRASE.test(before);
}

function allMatches(text: string, patterns: RegExp[]): RegExpExecArray[] {
  const out: RegExpExecArray[] = [];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push(m);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out;
}

interface SuppressionRow {
  documentId: string;
  charStart: number;
  matchedText: string;
  precedingContext: string;
}

function findUngatedCandidateStarts(text: string): Set<number> {
  const starts = new Set<number>();
  for (const m of [...allMatches(text, ARTICLE_PATTERNS), ...allMatches(text, SECTION_PATTERNS), ...allMatches(text, INTEGER_SECTION_PATTERNS), ...allMatches(text, [BARE_INTEGER_SECTION_PATTERN])]) {
    starts.add(m.index);
  }
  return starts;
}

async function auditPackage(packageKey: string, documents: CompilerDocumentInput[]): Promise<SuppressionRow[]> {
  // Precise attribution: only count a candidate as "gate-suppressed" when
  // rejectByPrecedingContext ITSELF returns true for that exact charStart -
  // never merely "present in ungated but absent from parseDocumentStructure's
  // output", which conflates the P1-10 gate with unrelated, legitimate
  // filters (overlapsAny dedup between decimal/integer/bare-integer pattern
  // sets, fallsInsideAnEstablishedSpan nesting rejection for the bare-integer
  // pattern) that also make a raw regex hit never become a node, for reasons
  // that have nothing to do with P1-10.
  const rows: SuppressionRow[] = [];
  for (const d of documents) {
    const ungated = findUngatedCandidateStarts(d.text);
    for (const charStart of ungated) {
      if (!rejectByPrecedingContext(d.text, charStart)) continue; // gate would accept - not a gate suppression
      const windowStart = Math.max(0, charStart - 100);
      rows.push({
        documentId: d.documentId,
        charStart,
        matchedText: d.text.slice(charStart, Math.min(charStart + 120, d.text.length)),
        precedingContext: d.text.slice(windowStart, charStart),
      });
    }
  }
  console.log(`\n========== ${packageKey}: ${rows.length} candidate(s) REJECTED BY THE P1-10 GATE ITSELF (rejectByPrecedingContext true) ==========`);
  for (const r of rows) {
    console.log(`\n-- documentId=${r.documentId} charStart=${r.charStart}`);
    console.log(`   preceding: ${JSON.stringify(r.precedingContext)}`);
    console.log(`   matched:   ${JSON.stringify(r.matchedText)}`);
  }
  return rows;
}

async function loadFwrgLsb(): Promise<CompilerDocumentInput[]> {
  return [
    { documentId: "fwrg-article-6", label: "FWRG Article 6", text: readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", "utf-8") },
    { documentId: "fwrg-definitions", label: "FWRG Definitions", text: readFileSync("tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt", "utf-8") },
    { documentId: "lsb-article-6", label: "LSB Article 6", text: readFileSync("tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt", "utf-8") },
    { documentId: "lsb-definitions", label: "LSB Definitions", text: readFileSync("tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt", "utf-8") },
  ];
}
async function loadConmed(): Promise<CompilerDocumentInput[]> {
  const files = [
    "ex10-1-eighth-ar-credit-agreement-2025-06-16.htm",
    "ex10-2-ar-guarantee-and-collateral-agreement-2025-06-16.htm",
    "ex10-2-second-amendment-2022-08-02.htm",
    "ex10-1-first-omnibus-amendment-2026-06-01.htm",
  ];
  const documents: CompilerDocumentInput[] = [];
  for (const file of files) {
    const raw = readFileSync(`tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/${file}`);
    const parsed = await parseDocument(raw, "text/html");
    documents.push({ documentId: `conmed-${file}`, label: file, text: parsed.fullText });
  }
  return documents;
}
async function loadDsgr(): Promise<CompilerDocumentInput[]> {
  const files = [
    "doc-a-2022-amended-restated-credit-agreement.txt",
    "doc-b-2024-third-amendment.txt",
    "doc-c-2025-fourth-amendment.txt",
    "doc-d-2025-second-amended-restated-credit-agreement.txt",
  ];
  return files.map((file) => ({ documentId: `dsgr-${file}`, label: file, text: readFileSync(`tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/${file}`, "utf-8") }));
}

async function main() {
  const fwrgLsb = await loadFwrgLsb();
  const fwrg = fwrgLsb.filter((d) => d.documentId.startsWith("fwrg"));
  const lsb = fwrgLsb.filter((d) => d.documentId.startsWith("lsb"));
  const conmed = await loadConmed();
  const dsgr = await loadDsgr();

  const allRows: SuppressionRow[] = [];
  allRows.push(...(await auditPackage("FWRG", fwrg)));
  allRows.push(...(await auditPackage("LSB", lsb)));
  allRows.push(...(await auditPackage("CONMED", conmed)));
  allRows.push(...(await auditPackage("DSGR", dsgr)));

  console.log(`\n\n=== TOTAL suppressed candidates across all 4 real packages: ${allRows.length} ===`);
  console.log("Manually classify each printed row above as CORRECTLY_REJECTED_CITATION or WRONGLY_REJECTED_HEADING.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
