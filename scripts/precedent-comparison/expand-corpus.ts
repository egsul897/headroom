/**
 * Expand the PCI public-credit corpus from authentic on-disk financing agreements.
 *
 * Does NOT call EDGAR, does NOT modify source fixtures, does NOT pay for inference.
 * Coordinates with WS-EHB/WS-CKF by reading their exports when present (via adapters)
 * but never downloads exhibits.
 *
 * Usage: npx tsx scripts/precedent-comparison/expand-corpus.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadEdgarAcquisitionQueue } from "../../lib/precedent-comparison/adapters/edgar-backfill";
import { loadKnowledgeFactoryCorpus } from "../../lib/precedent-comparison/adapters/knowledge-factory";

type Family =
  | "INDEBTEDNESS"
  | "LIENS"
  | "INVESTMENTS"
  | "RESTRICTED_PAYMENTS"
  | "ASSET_SALES"
  | "AFFILIATE_TRANSACTIONS"
  | "MANDATORY_PREPAYMENTS"
  | "FINANCIAL_COVENANTS"
  | "DEFINITIONS_CALCULATION_RULES"
  | "FUNDAMENTAL_CHANGES"
  | "QUALITATIVE_NEGATIVE_COVENANTS";

interface SourceSpec {
  packageId: string;
  issuerId: string;
  documentId: string;
  sourcePath: string;
  agreementType: "CREDIT_AGREEMENT" | "ABL" | "AMENDMENT" | "GUARANTEE_SECURITY" | "DEFINITIONS_EXCERPT";
  documentRole: "ORIGINAL" | "AMENDMENT" | "DEFINITION";
}

interface ProvisionOut {
  provisionId: string;
  packageId: string;
  documentId: string;
  sourcePath: string;
  sourceSectionRef: string;
  covenantFamily: Family;
  charStart: number;
  charEnd: number;
  sourceText: string;
  documentRole: "ORIGINAL" | "AMENDMENT" | "DEFINITION";
  agreementType: SourceSpec["agreementType"];
  issuerId: string;
  amendsProvisionId: string | null;
  tags: string[];
  reviewStatus: "SOURCE_ONLY";
  financialDefinitionTerms: string[];
  sourceVersionHash: string;
  evalIsolation: "NONE" | "HELD_OUT_CKG";
}

/** Issuers designated held-out for CKG / blind eval — do not drive pattern tuning. */
const HELD_OUT_ISSUERS = new Set(["superior", "gibraltar"]);

function isolationFor(issuerId: string): "NONE" | "HELD_OUT_CKG" {
  return HELD_OUT_ISSUERS.has(issuerId) ? "HELD_OUT_CKG" : "NONE";
}

function finalizeProvision(row: ProvisionOut): ProvisionOut {
  const evalIsolation = isolationFor(row.issuerId);
  const tags = [...row.tags];
  if (evalIsolation === "HELD_OUT_CKG" && !tags.includes("held-out-ckg")) tags.push("held-out-ckg");
  return { ...row, tags, evalIsolation };
}

const FAMILY_TITLE_RULES: Array<{ re: RegExp; family: Family; tags?: string[] }> = [
  { re: /\bIndebtedness\b/i, family: "INDEBTEDNESS" },
  { re: /\bLiens?\b/i, family: "LIENS" },
  { re: /\bInvestments?\b/i, family: "INVESTMENTS" },
  { re: /\bRestricted Payments?\b|\bRestricted Debt Payments?\b/i, family: "RESTRICTED_PAYMENTS", tags: ["restricted debt payments"] },
  { re: /\bAsset Sales?\b|\bDisposition of Assets\b|\bSale of Assets\b/i, family: "ASSET_SALES" },
  { re: /\bFundamental Changes\b/i, family: "FUNDAMENTAL_CHANGES", tags: ["asset dispositions"] },
  { re: /\bAffiliate/i, family: "AFFILIATE_TRANSACTIONS" },
  { re: /\bOptional Payments?\b|\bPayments? of Indebtedness\b|\bSubordinated\b|\bJunior\b|\bprepay/i, family: "MANDATORY_PREPAYMENTS", tags: ["junior debt prepayment"] },
  { re: /\bFinancial (Condition )?Covenants?\b|\bLeverage Ratio\b|\bInterest Coverage\b/i, family: "FINANCIAL_COVENANTS" },
  { re: /\bEBITDA\b|\bLeverage Ratio\b/i, family: "DEFINITIONS_CALCULATION_RULES", tags: ["financial definition"] },
];

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function clean(text: string): string {
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function classifyTitle(title: string): { family: Family; tags: string[] } | null {
  for (const rule of FAMILY_TITLE_RULES) {
    if (rule.re.test(title)) return { family: rule.family, tags: rule.tags ?? [] };
  }
  return null;
}

function extractSections(text: string): Array<{ sectionRef: string; title: string; start: number; end: number }> {
  // Prefer "Section 6.01. Title" / "SECTION 7.2 Title" including mid-paragraph headers.
  // Also accept TOC-style "SECTION 7.02\n\nIndebtedness" when the title follows within 80 chars.
  const headerRe =
    /(?:SECTION|Section)\s+(\d+\.\d+)\s*\.?\s+([A-Z\[\"][A-Za-z0-9 ;,&\-\/()]{2,100})/g;
  const matches: Array<{ sectionRef: string; title: string; start: number }> = [];
  for (const m of text.matchAll(headerRe)) {
    const num = m[1] ?? "";
    const title = (m[2] ?? "").replace(/\s+/g, " ").trim();
    // Reject cross-reference-like fragments ("Section 6.01 of the...")
    if (/^(of|hereof|thereof|above|below|to|and)\b/i.test(title)) continue;
    if (!/[A-Za-z]{3,}/.test(title)) continue;
    // Title should look like a heading word, not a sentence object
    const first = title.split(/\s+/)[0] ?? "";
    if (!/^[A-Z\[]/.test(first)) continue;
    // Skip bare page-number titles from some TOC extracts
    if (/^\d+$/.test(title)) continue;
    matches.push({ sectionRef: num, title: `Section ${num}. ${title}`, start: m.index! });
  }
  // Multiline headers: SECTION N.NN\nTitle (common in Superior / some EDGAR extracts)
  const multiRe = /(?:SECTION|Section)\s+(\d+\.\d+)\s*\.?\s*(?:\n+\s*)([A-Z][A-Za-z0-9 ;,&\-\/()]{2,80})/g;
  for (const m of text.matchAll(multiRe)) {
    const num = m[1] ?? "";
    const title = (m[2] ?? "").replace(/\s+/g, " ").trim();
    if (/^(of|hereof|thereof|above|below|to|and)\b/i.test(title)) continue;
    if (/^\d+$/.test(title)) continue;
    if (!/[A-Za-z]{3,}/.test(title)) continue;
    matches.push({ sectionRef: num, title: `Section ${num}. ${title}`, start: m.index! });
  }
  // Amendment-style "SECTION 2. Amendments" / "Section 1. Defined Terms"
  const amendHeaderRe = /(?:SECTION|Section)\s+(\d+)\s*\.\s+([A-Z][A-Za-z0-9 ;,&\-\/()]{2,80})/g;
  for (const m of text.matchAll(amendHeaderRe)) {
    const num = m[1] ?? "";
    const title = (m[2] ?? "").replace(/\s+/g, " ").trim();
    if (/^(of|hereof|thereof|above|below|to|and)\b/i.test(title)) continue;
    if (!/[A-Za-z]{3,}/.test(title)) continue;
    matches.push({ sectionRef: num, title: `Section ${num}. ${title}`, start: m.index! });
  }
  matches.sort((a, b) => a.start - b.start);
  const deduped: typeof matches = [];
  for (const m of matches) {
    const prev = deduped[deduped.length - 1];
    if (prev && m.start - prev.start < 40) continue;
    // Prefer later body headers over early TOC duplicates of the same section number
    if (prev && prev.sectionRef === m.sectionRef) {
      // Replace TOC hit with later body hit when gap is large (TOC vs operative text)
      if (m.start - prev.start > 50_000) {
        deduped[deduped.length - 1] = m;
      }
      continue;
    }
    // Also replace earlier TOC entry when same section appears much later
    const earlierIdx = deduped.findIndex((d) => d.sectionRef === m.sectionRef);
    if (earlierIdx >= 0) {
      if (m.start - deduped[earlierIdx]!.start > 50_000) deduped[earlierIdx] = m;
      continue;
    }
    deduped.push(m);
  }
  deduped.sort((a, b) => a.start - b.start);
  const out: Array<{ sectionRef: string; title: string; start: number; end: number }> = [];
  for (let i = 0; i < deduped.length; i++) {
    const cur = deduped[i]!;
    const end = i + 1 < deduped.length ? deduped[i + 1]!.start : Math.min(text.length, cur.start + 6000);
    out.push({ sectionRef: cur.sectionRef, title: cur.title, start: cur.start, end });
  }
  return out;
}

function extractLetterBaskets(sectionText: string, sectionStart: number, sectionRef: string): Array<{ ref: string; start: number; end: number; text: string }> {
  const baskets: Array<{ ref: string; start: number; end: number; text: string }> = [];
  const letterRe = /\(([a-z])\)\s+/g;
  const romanRe = /\(([ivx]+)\)\s+/gi;
  const hits: Array<{ letter: string; start: number }> = [];
  for (const m of sectionText.matchAll(letterRe)) {
    if (m.index! > Math.min(sectionText.length, 4500)) break;
    hits.push({ letter: m[1]!, start: m.index! });
  }
  // Roman-numeral baskets (common in Superior / modern LSTA forms) when lettered (a)/(b) density is low
  if (hits.length < 4) {
    for (const m of sectionText.matchAll(romanRe)) {
      if (m.index! > Math.min(sectionText.length, 5000)) break;
      const roman = (m[1] ?? "").toLowerCase();
      if (!/^[ivx]+$/.test(roman)) continue;
      hits.push({ letter: roman, start: m.index! });
    }
    hits.sort((a, b) => a.start - b.start);
  }
  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i]!;
    const next = hits[i + 1];
    const end = next ? next.start : Math.min(sectionText.length, cur.start + 900);
    const slice = sectionText.slice(cur.start, end);
    if (slice.length < 40) continue;
    baskets.push({
      ref: `${sectionRef}(${cur.letter})`,
      start: sectionStart + cur.start,
      end: sectionStart + end,
      text: clean(slice),
    });
  }
  return baskets.slice(0, 50);
}

function extractDefinitions(text: string): Array<{ term: string; start: number; end: number; text: string }> {
  const out: Array<{ term: string; start: number; end: number; text: string }> = [];
  const patterns = [
    /["“”]([A-Z][^"”]{2,80})["”]\s*(?:means|shall mean|:)/gi,
    /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,6})\s*(?:&#148;)?\s*means\b/g,
  ];
  const hits: Array<{ term: string; start: number }> = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const term = (m[1] ?? "").trim();
      if (term.length < 3 || term.length > 80) continue;
      if (/^(The|This|Any|Such|Section|Article|For|With|In)$/i.test(term)) continue;
      hits.push({ term, start: m.index! });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  const dedup: typeof hits = [];
  for (const h of hits) {
    const prev = dedup[dedup.length - 1];
    if (prev && h.start - prev.start < 20) continue;
    dedup.push(h);
  }
  for (let i = 0; i < dedup.length; i++) {
    const cur = dedup[i]!;
    const next = dedup[i + 1];
    const end = next ? next.start : Math.min(text.length, cur.start + 2500);
    const slice = clean(text.slice(cur.start, end));
    if (slice.length < 40) continue;
    // Prefer financial / covenant-relevant definitions
    if (!/(EBITDA|Leverage|Coverage|Indebtedness|Interest|Assets|Revenue|Debt|Investment|Lien|Subsidiary|Guarantor)/i.test(cur.term + " " + slice.slice(0, 220))) continue;
    out.push({ term: cur.term, start: cur.start, end, text: slice });
  }
  return out.slice(0, 160);
}

function buildFromSource(spec: SourceSpec, root: string): ProvisionOut[] {
  const abs = join(root, spec.sourcePath);
  if (!existsSync(abs)) return [];
  const text = readFileSync(abs, "utf8");
  const out: ProvisionOut[] = [];

  if (spec.documentRole === "DEFINITION" || /definition/i.test(spec.sourcePath)) {
    for (const d of extractDefinitions(text)) {
      const sourceText = d.text.slice(0, 2200);
      out.push({
        provisionId: `${spec.packageId}:def:${slug(d.term)}`,
        packageId: spec.packageId,
        documentId: spec.documentId,
        sourcePath: spec.sourcePath,
        sourceSectionRef: d.term,
        covenantFamily: "DEFINITIONS_CALCULATION_RULES",
        charStart: d.start,
        charEnd: d.start + sourceText.length,
        sourceText,
        documentRole: "DEFINITION",
        agreementType: "DEFINITIONS_EXCERPT",
        issuerId: spec.issuerId,
        amendsProvisionId: null,
        tags: ["financial definition"],
        reviewStatus: "SOURCE_ONLY",
        financialDefinitionTerms: [d.term],
        sourceVersionHash: sha256(sourceText),
        evalIsolation: "NONE",
      });
    }
  }

  for (const sec of extractSections(text)) {
    const classified = classifyTitle(sec.title);
    if (!classified) continue;
    if (/\[Reserved\]/i.test(sec.title)) continue;
    const body = clean(text.slice(sec.start, sec.end)).slice(0, 2400);
    if (body.length < 80) continue;
    out.push({
      provisionId: `${spec.packageId}:${sec.sectionRef}`,
      packageId: spec.packageId,
      documentId: spec.documentId,
      sourcePath: spec.sourcePath,
      sourceSectionRef: sec.sectionRef,
      covenantFamily: classified.family,
      charStart: sec.start,
      charEnd: sec.start + body.length,
      sourceText: body,
      documentRole: spec.documentRole === "DEFINITION" ? "ORIGINAL" : spec.documentRole,
      agreementType: spec.agreementType,
      issuerId: spec.issuerId,
      amendsProvisionId: null,
      tags: classified.tags,
      reviewStatus: "SOURCE_ONLY",
      financialDefinitionTerms: [],
      sourceVersionHash: sha256(body),
      evalIsolation: "NONE",
    });

    // basket-level slices for density on core negative covenants
    if (["INDEBTEDNESS", "LIENS", "INVESTMENTS", "RESTRICTED_PAYMENTS", "ASSET_SALES", "MANDATORY_PREPAYMENTS", "AFFILIATE_TRANSACTIONS"].includes(classified.family)) {
      const window = text.slice(sec.start, Math.min(text.length, sec.start + 8000));
      for (const b of extractLetterBaskets(window, sec.start, sec.sectionRef)) {
        out.push({
          provisionId: `${spec.packageId}:${b.ref}`,
          packageId: spec.packageId,
          documentId: spec.documentId,
          sourcePath: spec.sourcePath,
          sourceSectionRef: b.ref,
          covenantFamily: classified.family,
          charStart: b.start,
          charEnd: b.end,
          sourceText: b.text.slice(0, 1200),
          documentRole: spec.documentRole === "AMENDMENT" ? "AMENDMENT" : "ORIGINAL",
          agreementType: spec.agreementType,
          issuerId: spec.issuerId,
          amendsProvisionId: null,
          tags: [...classified.tags, "basket"],
          reviewStatus: "SOURCE_ONLY",
          financialDefinitionTerms: [],
          sourceVersionHash: sha256(b.text.slice(0, 1200)),
          evalIsolation: "NONE",
        });
      }
    }
  }

  // Also harvest definitions from full credit agreements / amendments
  if (spec.documentRole === "ORIGINAL" || spec.documentRole === "AMENDMENT") {
    for (const d of extractDefinitions(text).slice(0, 80)) {
      const sourceText = d.text.slice(0, 2200);
      out.push({
        provisionId: `${spec.packageId}:def:${slug(d.term)}`,
        packageId: spec.packageId,
        documentId: spec.documentId,
        sourcePath: spec.sourcePath,
        sourceSectionRef: d.term,
        covenantFamily: "DEFINITIONS_CALCULATION_RULES",
        charStart: d.start,
        charEnd: d.start + sourceText.length,
        sourceText,
        documentRole: "DEFINITION",
        agreementType: "DEFINITIONS_EXCERPT",
        issuerId: spec.issuerId,
        amendsProvisionId: null,
        tags: ["financial definition"],
        reviewStatus: "SOURCE_ONLY",
        financialDefinitionTerms: [d.term],
        sourceVersionHash: sha256(sourceText),
        evalIsolation: "NONE",
      });
    }
  }

  return out.map(finalizeProvision);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

const SOURCES: SourceSpec[] = [
  { packageId: "conmed-2025", issuerId: "conmed", documentId: "conmed-doc-a-eighth-ar-credit-agreement", sourcePath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt", agreementType: "CREDIT_AGREEMENT", documentRole: "ORIGINAL" },
  { packageId: "conmed-2025", issuerId: "conmed", documentId: "conmed-doc-a-eighth-ar-credit-agreement", sourcePath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-definitions-excerpt.txt", agreementType: "DEFINITIONS_EXCERPT", documentRole: "DEFINITION" },
  { packageId: "conmed-2025", issuerId: "conmed", documentId: "conmed-doc-c-second-amendment-2022", sourcePath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/second-amendment-2022-full.txt", agreementType: "AMENDMENT", documentRole: "AMENDMENT" },
  { packageId: "conmed-2025", issuerId: "conmed", documentId: "conmed-doc-b-guarantee-collateral-agreement", sourcePath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/guarantee-and-collateral-agreement-full.txt", agreementType: "GUARANTEE_SECURITY", documentRole: "ORIGINAL" },
  { packageId: "fwrg-2021", issuerId: "fwrg", documentId: "fwrg-doc-a-credit-agreement", sourcePath: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", agreementType: "CREDIT_AGREEMENT", documentRole: "ORIGINAL" },
  { packageId: "fwrg-2021", issuerId: "fwrg", documentId: "fwrg-doc-a-credit-agreement", sourcePath: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt", agreementType: "DEFINITIONS_EXCERPT", documentRole: "DEFINITION" },
  { packageId: "lsb-2023", issuerId: "lsb", documentId: "lsb-doc-a-abl-credit-agreement", sourcePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt", agreementType: "ABL", documentRole: "ORIGINAL" },
  { packageId: "lsb-2023", issuerId: "lsb", documentId: "lsb-doc-a-abl-credit-agreement", sourcePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt", agreementType: "DEFINITIONS_EXCERPT", documentRole: "DEFINITION" },
  { packageId: "chwy-2026", issuerId: "chwy", documentId: "chwy-doc-a-2026-credit-agreement", sourcePath: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt", agreementType: "CREDIT_AGREEMENT", documentRole: "ORIGINAL" },
  { packageId: "dsgr-2022", issuerId: "dsgr", documentId: "dsgr-doc-a-2022", sourcePath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt", agreementType: "CREDIT_AGREEMENT", documentRole: "ORIGINAL" },
  { packageId: "dsgr-2024", issuerId: "dsgr", documentId: "dsgr-doc-b-2024-third-amendment", sourcePath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt", agreementType: "AMENDMENT", documentRole: "AMENDMENT" },
  { packageId: "dsgr-2025", issuerId: "dsgr", documentId: "dsgr-doc-d-2025-second-ar", sourcePath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt", agreementType: "CREDIT_AGREEMENT", documentRole: "ORIGINAL" },
  { packageId: "riot-2025", issuerId: "riot", documentId: "riot-doc-a-2025", sourcePath: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-a-2025-04-22-credit-agreement.txt", agreementType: "CREDIT_AGREEMENT", documentRole: "ORIGINAL" },
  { packageId: "riot-2025b", issuerId: "riot", documentId: "riot-doc-b-2025-ar", sourcePath: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-b-2025-05-19-amended-restated-credit-agreement.txt", agreementType: "CREDIT_AGREEMENT", documentRole: "ORIGINAL" },
  { packageId: "riot-2026", issuerId: "riot", documentId: "riot-doc-c-2026-second-ar", sourcePath: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt", agreementType: "CREDIT_AGREEMENT", documentRole: "ORIGINAL" },
  { packageId: "gibraltar-2026", issuerId: "gibraltar", documentId: "gibraltar-doc-a-2026", sourcePath: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt", agreementType: "CREDIT_AGREEMENT", documentRole: "ORIGINAL" },
  // Previously unharvested authentic fixtures (read-only; no fixture mutation).
  { packageId: "superior-2022", issuerId: "superior", documentId: "superior-doc-a-2022-term-loan", sourcePath: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt", agreementType: "CREDIT_AGREEMENT", documentRole: "ORIGINAL" },
  { packageId: "superior-2024", issuerId: "superior", documentId: "superior-doc-b-2024-ar-term-loan", sourcePath: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt", agreementType: "CREDIT_AGREEMENT", documentRole: "ORIGINAL" },
  { packageId: "superior-2025", issuerId: "superior", documentId: "superior-doc-c-2025-first-amendment", sourcePath: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-c-2025-03-31-first-amendment.txt", agreementType: "AMENDMENT", documentRole: "AMENDMENT" },
  { packageId: "conmed-2025", issuerId: "conmed", documentId: "conmed-doc-d-first-omnibus-amendment-2026", sourcePath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/first-omnibus-amendment-2026-curated.txt", agreementType: "AMENDMENT", documentRole: "AMENDMENT" },
  { packageId: "dsgr-2025c", issuerId: "dsgr", documentId: "dsgr-doc-c-2025-fourth-amendment", sourcePath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-c-2025-fourth-amendment.txt", agreementType: "AMENDMENT", documentRole: "AMENDMENT" },
  { packageId: "lsb-2023", issuerId: "lsb", documentId: "lsb-doc-b-intercreditor-joinder", sourcePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/intercreditor-joinder.txt", agreementType: "GUARANTEE_SECURITY", documentRole: "ORIGINAL" },
];

function main(): void {
  const root = process.cwd();
  const ehb = loadEdgarAcquisitionQueue(root);
  const kf = loadKnowledgeFactoryCorpus(root);
  console.log("EHB:", ehb.availability, ehb.note);
  console.log("CKF:", kf.availability, kf.note);

  const byId = new Map<string, ProvisionOut>();
  for (const spec of SOURCES) {
    const rows = buildFromSource(spec, root);
    console.log(spec.documentId, "->", rows.length);
    for (const r of rows) {
      if (!byId.has(r.provisionId)) byId.set(r.provisionId, r);
    }
  }

  // Hand-authored amendment span for CONMED §7.1(b) restatement (fixture not section-headed).
  const amendPath = "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/second-amendment-2022-full.txt";
  const amendAbs = join(root, amendPath);
  if (existsSync(amendAbs)) {
    const at = readFileSync(amendAbs, "utf8");
    const m = at.search(/\(b\)\s+Section\s+7\.1\(b\)/);
    if (m >= 0) {
      const sourceText = clean(at.slice(m, m + 1800));
      const target = [...byId.keys()].find((id) => id === "conmed-2025:7.1") ?? null;
      byId.set(
        "conmed-2025:amend-c-2b",
        finalizeProvision({
          provisionId: "conmed-2025:amend-c-2b",
          packageId: "conmed-2025",
          documentId: "conmed-doc-c-second-amendment-2022",
          sourcePath: amendPath,
          sourceSectionRef: "SECTION 2(b)",
          covenantFamily: "FINANCIAL_COVENANTS",
          charStart: m,
          charEnd: m + sourceText.length,
          sourceText,
          documentRole: "AMENDMENT",
          agreementType: "AMENDMENT",
          issuerId: "conmed",
          amendsProvisionId: target,
          tags: ["leverage ratio", "step schedule amendment"],
          reviewStatus: "SOURCE_ONLY",
          financialDefinitionTerms: [],
          sourceVersionHash: sha256(sourceText),
          evalIsolation: "NONE",
        }),
      );
    }
  }

  // Hand spans for short amendments / joinders that lack Article-style headers.
  function addHandSpan(opts: {
    provisionId: string;
    packageId: string;
    documentId: string;
    sourcePath: string;
    sourceSectionRef: string;
    covenantFamily: Family;
    issuerId: string;
    agreementType: SourceSpec["agreementType"];
    documentRole: SourceSpec["documentRole"];
    needle: RegExp;
    tags: string[];
    amendsProvisionId?: string | null;
    window?: number;
  }): void {
    const abs = join(root, opts.sourcePath);
    if (!existsSync(abs) || byId.has(opts.provisionId)) return;
    const text = readFileSync(abs, "utf8");
    const m = text.search(opts.needle);
    if (m < 0) return;
    const sourceText = clean(text.slice(m, m + (opts.window ?? 1800)));
    if (sourceText.length < 80) return;
    byId.set(
      opts.provisionId,
      finalizeProvision({
        provisionId: opts.provisionId,
        packageId: opts.packageId,
        documentId: opts.documentId,
        sourcePath: opts.sourcePath,
        sourceSectionRef: opts.sourceSectionRef,
        covenantFamily: opts.covenantFamily,
        charStart: m,
        charEnd: m + sourceText.length,
        sourceText,
        documentRole: opts.documentRole,
        agreementType: opts.agreementType,
        issuerId: opts.issuerId,
        amendsProvisionId: opts.amendsProvisionId ?? null,
        tags: opts.tags,
        reviewStatus: "SOURCE_ONLY",
        financialDefinitionTerms: [],
        sourceVersionHash: sha256(sourceText),
        evalIsolation: "NONE",
      }),
    );
  }

  addHandSpan({
    provisionId: "superior-2025:amend-2b-prepay",
    packageId: "superior-2025",
    documentId: "superior-doc-c-2025-first-amendment",
    sourcePath: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-c-2025-03-31-first-amendment.txt",
    sourceSectionRef: "SECTION 2(b)",
    covenantFamily: "MANDATORY_PREPAYMENTS",
    issuerId: "superior",
    agreementType: "AMENDMENT",
    documentRole: "AMENDMENT",
    needle: /Section 2\.05\(2\)\(c\) of the Credit Agreement is hereby/,
    tags: ["mandatory prepayment", "maintenance liquidity", "amendment restatement"],
    amendsProvisionId: [...byId.keys()].find((id) => id.startsWith("superior-2024:") && id.includes("2.05")) ?? null,
  });
  addHandSpan({
    provisionId: "superior-2025:def-maintenance-liquidity",
    packageId: "superior-2025",
    documentId: "superior-doc-c-2025-first-amendment",
    sourcePath: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-c-2025-03-31-first-amendment.txt",
    sourceSectionRef: "Maintenance Liquidity",
    covenantFamily: "DEFINITIONS_CALCULATION_RULES",
    issuerId: "superior",
    agreementType: "DEFINITIONS_EXCERPT",
    documentRole: "DEFINITION",
    needle: /“Maintenance Liquidity”/,
    tags: ["financial definition", "amendment-added definition"],
  });
  addHandSpan({
    provisionId: "conmed-2025:omnibus-incremental",
    packageId: "conmed-2025",
    documentId: "conmed-doc-d-first-omnibus-amendment-2026",
    sourcePath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/first-omnibus-amendment-2026-curated.txt",
    sourceSectionRef: "Incremental Term Loans",
    covenantFamily: "INDEBTEDNESS",
    issuerId: "conmed",
    agreementType: "AMENDMENT",
    documentRole: "AMENDMENT",
    needle: /Incremental Term Loans|Increased Facility|Section\s+2\.28/i,
    tags: ["incremental facility", "omnibus amendment"],
  });
  addHandSpan({
    provisionId: "dsgr-2025c:fourth-amendment-effect",
    packageId: "dsgr-2025c",
    documentId: "dsgr-doc-c-2025-fourth-amendment",
    sourcePath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-c-2025-fourth-amendment.txt",
    sourceSectionRef: "SECTION 4",
    covenantFamily: "QUALITATIVE_NEGATIVE_COVENANTS",
    issuerId: "dsgr",
    agreementType: "AMENDMENT",
    documentRole: "AMENDMENT",
    needle: /Reference to and Effect on the Credit Agreement/i,
    tags: ["amendment reaffirmation", "no novation"],
  });
  addHandSpan({
    provisionId: "lsb-2023:intercreditor-joinder-1",
    packageId: "lsb-2023",
    documentId: "lsb-doc-b-intercreditor-joinder",
    sourcePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/intercreditor-joinder.txt",
    sourceSectionRef: "SECTION 1",
    covenantFamily: "LIENS",
    issuerId: "lsb",
    agreementType: "GUARANTEE_SECURITY",
    documentRole: "ORIGINAL",
    needle: /SECTION 1\.\s*\(A\)\s*In accordance with Section 5\.3\(a\)/i,
    tags: ["intercreditor", "abl agent succession", "lien priority"],
  });

  // Ingest CKF provision records when a published export is mounted (never download).
  if (kf.availability === "AVAILABLE" && kf.data) {
    let ingested = 0;
    for (const rec of kf.data.records) {
      if (!rec.sourceText || rec.sourceText.length < 80) continue;
      const provisionId = `ckf:${rec.recordId ?? sha256(rec.sourceText).slice(0, 16)}`;
      if (byId.has(provisionId)) continue;
      const sourceText = clean(rec.sourceText).slice(0, 2400);
      const family = (rec.covenantFamily as Family | undefined) ?? "QUALITATIVE_NEGATIVE_COVENANTS";
      byId.set(
        provisionId,
        finalizeProvision({
          provisionId,
          packageId: `ckf-${rec.issuerId ?? "unknown"}`,
          documentId: rec.documentId ?? `ckf-doc-${rec.recordId ?? provisionId}`,
          sourcePath: `peer://ws-ckf/${rec.recordId ?? provisionId}`,
          sourceSectionRef: rec.sourceSectionRef ?? "unknown",
          covenantFamily: family,
          charStart: 0,
          charEnd: sourceText.length,
          sourceText,
          documentRole: /amend/i.test(rec.agreementType ?? "") ? "AMENDMENT" : "ORIGINAL",
          agreementType: (rec.agreementType as SourceSpec["agreementType"] | undefined) ?? "CREDIT_AGREEMENT",
          issuerId: rec.issuerId ?? "ckf-unknown",
          amendsProvisionId: null,
          tags: ["ckf-export"],
          reviewStatus: "SOURCE_ONLY",
          financialDefinitionTerms: [],
          sourceVersionHash: sha256(sourceText),
          evalIsolation: "NONE",
        }),
      );
      ingested += 1;
    }
    console.log("CKF ingested records:", ingested);
  }

  const provisions = [...byId.values()].map(finalizeProvision).sort((a, b) => a.provisionId.localeCompare(b.provisionId));
  const issuers = new Set(provisions.map((p) => p.issuerId));
  const agreements = new Set(provisions.map((p) => p.documentId));
  const outPath = join(root, "lib/precedent-comparison/corpus/public-credit-provisions.json");
  const payload = {
    schemaVersion: "precedent-comparison-corpus.v2",
    generatedAt: new Date().toISOString(),
    generator: "scripts/precedent-comparison/expand-corpus.ts",
    stats: {
      provisionCount: provisions.length,
      distinctIssuers: issuers.size,
      distinctAgreements: agreements.size,
      targets: { agreements: 100, issuers: 50, provisions: 500 },
      targetsMet: {
        agreements: agreements.size >= 100,
        issuers: issuers.size >= 50,
        provisions: provisions.length >= 500,
      },
      peerCoordination: {
        edgarBackfill: ehb.availability,
        knowledgeFactory: kf.availability,
        edgarNote: ehb.note,
        knowledgeFactoryNote: kf.note,
      },
      samplingBiasNotes: [
        "Expanded from local authentic Headroom fixtures only; no live EDGAR download in PCI.",
        "Includes Superior Industries, CONMED omnibus amendment, DSGR fourth amendment, LSB intercreditor when present on disk.",
        "Superior and Gibraltar rows are tagged HELD_OUT_CKG (eval-isolated) — excluded from pattern stats and default retrieval.",
        "100-agreement / 50-issuer targets require WS-EHB queue + WS-CKF acquisition delivery.",
        "Corpus frequency ≠ market prevalence.",
      ],
    },
    provisions,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log("Wrote", provisions.length, "provisions;", agreements.size, "agreements;", issuers.size, "issuers ->", outPath);
}

main();
