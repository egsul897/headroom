/**
 * Phase 2F.1 §2 - exact, machine-readable baseline diagnostic for
 * Documents C and D, reproduced from source BEFORE any code change in
 * this task. Reads only already-sealed Phase 2F first-blind artifacts
 * (never overwrites them) plus a fresh, read-only pass over the frozen
 * structural-parsing regexes to name exactly which pattern each document
 * fails.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility");
const CURATED = path.join(PKG_DIR, "curated");
const RAW = path.join(PKG_DIR, "raw-source");
const FREEZE = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze");

const stage1 = JSON.parse(fs.readFileSync(path.join(FREEZE, "phase-2f-stage1-structural-summary.json"), "utf-8"));
const stage2Summary = JSON.parse(fs.readFileSync(path.join(FREEZE, "phase-2f-stage2-discovery-summary.json"), "utf-8"));
const stage4Bundles = JSON.parse(fs.readFileSync(path.join(FREEZE, "phase-2f-stage4-context-bundles.json"), "utf-8"));
const stage5Findings: Array<{ documentId: string }> = JSON.parse(fs.readFileSync(path.join(FREEZE, "phase-2f-stage5-audit-findings.json"), "utf-8"));

// The exact frozen patterns as of Phase 2F (unchanged at the time this diagnostic is produced).
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
const DEFINITION_QUOTE = String.raw`(?:&#14[7-8];|&#822[01];|&ldquo;|&rdquo;|["""])`;
const DEFINITION_DECLARATION = new RegExp(`${DEFINITION_QUOTE}\\s*([^"""&]{1,100}?)\\s*${DEFINITION_QUOTE}\\s*(?:means|shall mean|shall have the meaning)`, "gi");

function countMatches(re: RegExp, text: string): number {
  const r = new RegExp(re.source, re.flags);
  let n = 0;
  while (r.exec(text) !== null) n++;
  return n;
}

interface DocDiagnostic {
  documentId: string;
  rawSourceFile: string;
  rawSourceSha256: string;
  rawSourceBytes: number;
  curatedTextChars: number;
  phase2aNodeCount: number;
  phase2aSectionsRecognized: number;
  phase2aDefinitionsRecognized: number;
  phase2bCandidateCount: number;
  phase2dBundleCount: number;
  phase2eAuditRegionCount: number;
  phase2eFindingCount: number;
  dangerousUnflagged: boolean;
  articlePatternMatches: number;
  sectionPatternMatches: number;
  definitionPatternMatches: number;
  representativeExcerpt: string;
  headingLikeLinesSample: string[];
}

function diagnose(documentId: string, rawFile: string, curatedFiles: string[]): DocDiagnostic {
  const rawPath = path.join(RAW, rawFile);
  const rawBytes = fs.readFileSync(rawPath);
  const curatedText = curatedFiles.map((f) => fs.readFileSync(path.join(CURATED, f), "utf-8")).join("\n\n");

  const stage1Doc = stage1.documents[documentId];
  const phase2bCandidates = stage2Summary.perDocument[documentId];
  const phase2bCount = typeof phase2bCandidates?.finalCandidateCount === "number" ? phase2bCandidates.finalCandidateCount : 0;
  const bundleCount = (stage4Bundles as Array<{ originatingDocumentId: string }>).filter((b) => b.originatingDocumentId === documentId).length;
  const findingCount = stage5Findings.filter((f) => f.documentId === documentId).length;

  // heading-like lines: short lines starting with a number/word, all-caps or title-case, under 80 chars
  const lines = curatedText.split("\n").map((l) => l.trim()).filter(Boolean);
  const headingLike = lines.filter((l) => l.length < 80 && /^(SECTION|Section|ARTICLE|\d+[.)])/i.test(l)).slice(0, 12);

  return {
    documentId,
    rawSourceFile: rawFile,
    rawSourceSha256: crypto.createHash("sha256").update(rawBytes).digest("hex"),
    rawSourceBytes: rawBytes.length,
    curatedTextChars: curatedText.length,
    phase2aNodeCount: stage1Doc?.totalNodes ?? 0,
    phase2aSectionsRecognized: stage1Doc?.nodesByType?.SECTION ?? 0,
    phase2aDefinitionsRecognized: stage1Doc?.definitionsDetected ?? 0,
    phase2bCandidateCount: phase2bCount,
    phase2dBundleCount: bundleCount,
    phase2eAuditRegionCount: 0, // regions are not persisted per-document in stage5 output; findings are the observable proxy
    phase2eFindingCount: findingCount,
    dangerousUnflagged: phase2bCount === 0 && findingCount === 0,
    articlePatternMatches: ARTICLE_PATTERNS.reduce((n, p) => n + countMatches(p, curatedText), 0),
    sectionPatternMatches: SECTION_PATTERNS.reduce((n, p) => n + countMatches(p, curatedText), 0),
    definitionPatternMatches: countMatches(DEFINITION_DECLARATION, curatedText),
    representativeExcerpt: curatedText.slice(0, 900),
    headingLikeLinesSample: headingLike,
  };
}

const docC = diagnose("conmed-doc-c-second-amendment-2022", "ex10-2-second-amendment-2022-08-02.htm", ["second-amendment-2022-full.txt"]);
const docD = diagnose("conmed-doc-d-first-omnibus-amendment-2026", "ex10-1-first-omnibus-amendment-2026-06-01.htm", ["first-omnibus-amendment-2026-curated.txt"]);

const out = { generatedAt: new Date().toISOString(), note: "Read-only reproduction from already-sealed Phase 2F first-blind artifacts (tests/fixtures/unseen-packages/phase-2f-freeze/) plus the frozen (as of Phase 2F) structural-parsing regexes. Nothing here overwrites the sealed Phase 2F result.", documentC: docC, documentD: docD };

fs.mkdirSync(path.join(FREEZE, "phase-2f1"), { recursive: true });
fs.writeFileSync(path.join(FREEZE, "phase-2f1", "baseline-diagnostic-c-d.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
