/**
 * One-shot independent ground-truth authoring from source text spans.
 * Does NOT import extractFromStructural — searches source for known legal patterns only.
 *
 * Usage: npx tsx scripts/covenant-dependency-atlas/author-independent-gt.ts
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");

type Split = "development" | "evaluation" | "blind";

interface AuthoredEdge {
  edgeId: string;
  documentId: string;
  issuer: string;
  packageId: string;
  split: Split;
  kind: string;
  fromLabel: string;
  toLabel: string;
  connective: string;
  termName?: string;
  sourceSpan: {
    sourceFile: string;
    charStart: number;
    charEnd: number;
    excerpt: string;
  };
  notes: string;
  authoredFrom: "SOURCE_TEXT_SPAN";
}

function load(path: string): string {
  const raw = readFileSync(join(ROOT, path), "utf-8");
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

function eid(parts: string[]): string {
  return `gt:${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 20)}`;
}

function findAll(text: string, re: RegExp, limit = 20): { index: number; match: string }[] {
  const out: { index: number; match: string }[] = [];
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null && out.length < limit) {
    out.push({ index: m.index, match: m[0]! });
    if (m[0]!.length === 0) r.lastIndex++;
  }
  return out;
}

function excerptAt(text: string, index: number, len: number): string {
  return text
    .slice(Math.max(0, index - 40), index + len + 60)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

interface Recipe {
  kind: string;
  pattern: RegExp;
  fromLabel: string;
  toLabel: string;
  connective: string;
  termName?: string;
  max?: number;
  notes: string;
}

interface DocSpec {
  documentId: string;
  issuer: string;
  packageId: string;
  sourceFile: string;
  split: Split;
  recipes: Recipe[];
}

const DOCS: DocSpec[] = [
  {
    documentId: "chwy-doc-a",
    issuer: "CHWY",
    packageId: "chwy-2026",
    sourceFile: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
    split: "development",
    recipes: [
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bIndebtedness\b/, fromLabel: "negative-covenant-region", toLabel: "Indebtedness", connective: "defined-term occurrence", termName: "Indebtedness", max: 3, notes: "CHWY Indebtedness defined term in operative text" },
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bConsolidated EBITDA\b/, fromLabel: "financial/covenant region", toLabel: "Consolidated EBITDA", connective: "defined-term occurrence", termName: "Consolidated EBITDA", max: 2, notes: "CHWY Consolidated EBITDA" },
      { kind: "RATIO_CALCULATION", pattern: /Total Leverage Ratio[\s\S]{0,180}Consolidated EBITDA/, fromLabel: "Total Leverage Ratio", toLabel: "Consolidated EBITDA", connective: "ratio definition compositional reference", termName: "Consolidated EBITDA", max: 1, notes: "Total Leverage Ratio → Consolidated EBITDA" },
      { kind: "RATIO_CALCULATION", pattern: /First Lien Leverage Ratio[\s\S]{0,180}Consolidated EBITDA/, fromLabel: "First Lien Leverage Ratio", toLabel: "Consolidated EBITDA", connective: "ratio definition compositional reference", termName: "Consolidated EBITDA", max: 1, notes: "First Lien Leverage Ratio compositional" },
      { kind: "ENTITY_SCOPE", pattern: /\bRestricted Subsidiar(?:y|ies)\b/, fromLabel: "covenant scope", toLabel: "Restricted Subsidiary", connective: "Restricted Subsidiary entity-scope", max: 2, notes: "Entity scope" },
      { kind: "COVENANT_TO_CONDITION", pattern: /\bsubject to\b/i, fromLabel: "operative clause", toLabel: "condition target", connective: "subject to", max: 3, notes: "Remote/condition connective" },
      { kind: "COVENANT_TO_EXCEPTION", pattern: /\bexcept as (?:provided|set forth|permitted)\b/i, fromLabel: "operative clause", toLabel: "exception", connective: "except as provided", max: 2, notes: "Exception connective" },
      { kind: "RECLASSIFICATION", pattern: /\breclassif(?:y|ication|iable)\b/i, fromLabel: "debt basket", toLabel: "reclassification target", connective: "reclassification", max: 1, notes: "Reclassification mechanic" },
      { kind: "FINANCIAL_INPUT", pattern: /\bNet Income\b/, fromLabel: "EBITDA/income definition", toLabel: "NET_INCOME", connective: "compositional Net Income", termName: "NET_INCOME", max: 2, notes: "Financial input" },
      { kind: "COVENANT_TO_SHARED_BASKET", pattern: /\bAvailable Amount\b/, fromLabel: "builder/RP", toLabel: "Available Amount", connective: "Available Amount shared basket", termName: "Available Amount", max: 2, notes: "Shared capacity" },
      { kind: "COVENANT_TO_CROSS_DOCUMENT", pattern: /\bIntercreditor Agreement\b/, fromLabel: "lien/priority", toLabel: "Intercreditor Agreement", connective: "Intercreditor Agreement", max: 1, notes: "Cross-document" },
      { kind: "COVENANT_TO_AMENDMENT", pattern: /\bas amended\b/i, fromLabel: "amendment authority", toLabel: "amended instrument", connective: "as amended", max: 2, notes: "Amendment authority" },
    ],
  },
  {
    documentId: "riot-doc-a",
    issuer: "RIOT",
    packageId: "riot-2025-2026",
    sourceFile: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-a-2025-04-22-credit-agreement.txt",
    split: "development",
    recipes: [
      { kind: "RATIO_CALCULATION", pattern: /Actual LTV Ratio[\s\S]{0,200}Prevailing Market Value/, fromLabel: "Actual LTV Ratio", toLabel: "Prevailing Market Value", connective: "LTV ratio compositional reference", termName: "Prevailing Market Value", max: 1, notes: "RIOT LTV ratio — not traditional leverage" },
      { kind: "RATIO_CALCULATION", pattern: /Actual LTV Ratio[\s\S]{0,120}Loan/, fromLabel: "Actual LTV Ratio", toLabel: "Loan", connective: "LTV ratio numerator Loan", termName: "Loan", max: 1, notes: "Actual LTV Ratio principal amount of Loan" },
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bCollateral\b/, fromLabel: "covenant/affirmative", toLabel: "Collateral", connective: "defined-term occurrence", termName: "Collateral", max: 3, notes: "RIOT Collateral defined term" },
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bLoan\b/, fromLabel: "operative", toLabel: "Loan", connective: "defined-term occurrence", termName: "Loan", max: 2, notes: "RIOT Loan defined term" },
      { kind: "COVENANT_TO_CROSS_DOCUMENT", pattern: /\bCollateral Documents?\b/, fromLabel: "security package", toLabel: "Collateral Documents", connective: "Collateral Documents", max: 2, notes: "Cross-document — not Security Agreement" },
      { kind: "COVENANT_TO_CROSS_DOCUMENT", pattern: /\bCustody Agreement\b/, fromLabel: "custody", toLabel: "Custody Agreement", connective: "Custody Agreement", max: 1, notes: "Custody Agreement instrument" },
      { kind: "COVENANT_TO_CONDITION", pattern: /\bsubject to\b/i, fromLabel: "operative", toLabel: "condition", connective: "subject to", max: 2, notes: "Condition connective" },
      { kind: "ENTITY_SCOPE", pattern: /\bRestricted Party\b/, fromLabel: "sanctions/scope", toLabel: "Restricted Party", connective: "Restricted Party", max: 1, notes: "RIOT uses Restricted Party not Restricted Subsidiary" },
      { kind: "FINANCIAL_INPUT", pattern: /\bPrevailing Market Value\b/, fromLabel: "LTV inputs", toLabel: "PREVAILING_MARKET_VALUE", connective: "market value input", termName: "PREVAILING_MARKET_VALUE", max: 1, notes: "LTV financial input" },
    ],
  },
  {
    documentId: "dsgr-doc-a",
    issuer: "DSGR",
    packageId: "dsgr-2022-2025",
    sourceFile: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt",
    split: "evaluation",
    recipes: [
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bIndebtedness\b/, fromLabel: "Art VI", toLabel: "Indebtedness", connective: "defined-term", termName: "Indebtedness", max: 3, notes: "eval DSGR" },
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bEBITDA\b/, fromLabel: "financial", toLabel: "EBITDA", connective: "defined-term", termName: "EBITDA", max: 2, notes: "eval DSGR EBITDA" },
      { kind: "RATIO_CALCULATION", pattern: /Leverage Ratio[\s\S]{0,160}EBITDA/, fromLabel: "Leverage Ratio", toLabel: "EBITDA", connective: "ratio compositional", termName: "EBITDA", max: 2, notes: "eval ratio" },
      { kind: "COVENANT_TO_CONDITION", pattern: /\bsubject to\b/i, fromLabel: "covenant", toLabel: "condition", connective: "subject to", max: 3, notes: "eval condition" },
      { kind: "COVENANT_TO_EXCEPTION", pattern: /\bexcept as (?:provided|set forth|permitted)\b/i, fromLabel: "covenant", toLabel: "exception", connective: "except as", max: 2, notes: "eval exception" },
      { kind: "COVENANT_TO_SHARED_BASKET", pattern: /\bAvailable Amount\b/, fromLabel: "builder", toLabel: "Available Amount", connective: "Available Amount", termName: "Available Amount", max: 2, notes: "eval shared basket" },
      { kind: "ENTITY_SCOPE", pattern: /\bRestricted Subsidiar/, fromLabel: "scope", toLabel: "Restricted Subsidiary", connective: "Restricted Subsidiary", max: 2, notes: "eval entity" },
      { kind: "COVENANT_TO_CROSS_DOCUMENT", pattern: /\bSecurity Agreement\b/, fromLabel: "collateral", toLabel: "Security Agreement", connective: "Security Agreement", max: 1, notes: "eval xd" },
      { kind: "FINANCIAL_INPUT", pattern: /\bNet Income\b/, fromLabel: "EBITDA", toLabel: "NET_INCOME", connective: "Net Income", termName: "NET_INCOME", max: 1, notes: "eval FI" },
      { kind: "COVENANT_TO_AMENDMENT", pattern: /\bas amended\b/i, fromLabel: "amd", toLabel: "amended", connective: "as amended", max: 2, notes: "eval amd" },
    ],
  },
  {
    documentId: "lsb-art6",
    issuer: "LSB",
    packageId: "lsb-2023",
    sourceFile: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
    split: "evaluation",
    recipes: [
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bIndebtedness\b/, fromLabel: "Art 6", toLabel: "Indebtedness", connective: "defined-term", termName: "Indebtedness", max: 3, notes: "LSB art6" },
      { kind: "COVENANT_TO_CONDITION", pattern: /\bsubject to\b/i, fromLabel: "Art 6", toLabel: "condition", connective: "subject to", max: 2, notes: "LSB condition" },
      { kind: "RECLASSIFICATION", pattern: /\breclassif/i, fromLabel: "Art 6", toLabel: "reclass", connective: "reclassification", max: 1, notes: "LSB reclass" },
      { kind: "ENTITY_SCOPE", pattern: /\bRestricted Subsidiar/, fromLabel: "Art 6", toLabel: "Restricted Subsidiary", connective: "Restricted Subsidiary", max: 2, notes: "LSB entity" },
    ],
  },
  {
    documentId: "lsb-defs",
    issuer: "LSB",
    packageId: "lsb-2023",
    sourceFile: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt",
    split: "evaluation",
    recipes: [
      { kind: "DEFINITION_TO_DEFINITION", pattern: /Indebtedness[\s\S]{0,80}means/, fromLabel: "Indebtedness", toLabel: "definition body", connective: "means", termName: "Indebtedness", max: 1, notes: "LSB def" },
      { kind: "RATIO_CALCULATION", pattern: /EBITDA/, fromLabel: "EBITDA family", toLabel: "EBITDA", connective: "EBITDA component", termName: "EBITDA", max: 2, notes: "LSB EBITDA" },
      { kind: "COVENANT_TO_CROSS_DOCUMENT", pattern: /\bIntercreditor Agreement\b/, fromLabel: "defs", toLabel: "Intercreditor Agreement", connective: "Intercreditor Agreement", max: 1, notes: "LSB intercreditor mention" },
    ],
  },
  {
    documentId: "fwrg-art6",
    issuer: "FWRG",
    packageId: "fwrg-2021",
    sourceFile: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
    split: "blind",
    recipes: [
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bIndebtedness\b/, fromLabel: "Art 6", toLabel: "Indebtedness", connective: "defined-term", termName: "Indebtedness", max: 3, notes: "blind FWRG — authored in one pass, not used to tune adapter" },
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bEBITDA\b/, fromLabel: "Art 6", toLabel: "EBITDA", connective: "defined-term", termName: "EBITDA", max: 2, notes: "blind FWRG EBITDA" },
      { kind: "COVENANT_TO_SHARED_BASKET", pattern: /\bAvailable Amount\b/, fromLabel: "Art 6", toLabel: "Available Amount", connective: "Available Amount", termName: "Available Amount", max: 2, notes: "blind shared" },
      { kind: "COVENANT_TO_CONDITION", pattern: /\bsubject to\b/i, fromLabel: "Art 6", toLabel: "condition", connective: "subject to", max: 2, notes: "blind condition" },
      { kind: "COVENANT_TO_EXCEPTION", pattern: /\bexcept as (?:provided|set forth|permitted)\b/i, fromLabel: "Art 6", toLabel: "exception", connective: "except as", max: 2, notes: "blind exception" },
      { kind: "ENTITY_SCOPE", pattern: /\bRestricted Subsidiar/, fromLabel: "Art 6", toLabel: "Restricted Subsidiary", connective: "Restricted Subsidiary", max: 2, notes: "blind entity" },
      { kind: "COVENANT_TO_CROSS_DOCUMENT", pattern: /\bIntercreditor Agreement\b/, fromLabel: "Art 6", toLabel: "Intercreditor Agreement", connective: "Intercreditor Agreement", max: 1, notes: "blind xd" },
      { kind: "RATIO_CALCULATION", pattern: /\bLeverage Ratio\b/, fromLabel: "ratio ref", toLabel: "Leverage Ratio", connective: "Leverage Ratio reference", max: 2, notes: "blind ratio ref" },
      { kind: "ENTITY_SCOPE", pattern: /\bGuarantor/, fromLabel: "Art 6", toLabel: "Guarantor", connective: "Guarantor", max: 1, notes: "blind guarantor" },
    ],
  },
  {
    documentId: "fwrg-defs",
    issuer: "FWRG",
    packageId: "fwrg-2021",
    sourceFile: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt",
    split: "blind",
    recipes: [
      { kind: "FINANCIAL_INPUT", pattern: /\bNet Income\b/, fromLabel: "defs", toLabel: "NET_INCOME", connective: "Net Income", termName: "NET_INCOME", max: 1, notes: "blind FI" },
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bIndebtedness\b/, fromLabel: "defs", toLabel: "Indebtedness", connective: "defined-term", termName: "Indebtedness", max: 2, notes: "blind defs Indebtedness" },
      { kind: "RATIO_CALCULATION", pattern: /\bLeverage Ratio\b/, fromLabel: "defs", toLabel: "Leverage Ratio", connective: "Leverage Ratio", max: 1, notes: "blind defs ratio" },
      { kind: "COVENANT_TO_SHARED_BASKET", pattern: /\bAvailable Amount\b/, fromLabel: "defs", toLabel: "Available Amount", connective: "Available Amount", termName: "Available Amount", max: 1, notes: "blind defs basket" },
    ],
  },
  {
    documentId: "cnmd-base-neg",
    issuer: "CNMD",
    packageId: "conmed-2025",
    sourceFile: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
    split: "evaluation",
    recipes: [
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bIndebtedness\b/, fromLabel: "Art VII", toLabel: "Indebtedness", connective: "defined-term", termName: "Indebtedness", max: 3, notes: "CNMD neg" },
      { kind: "RECLASSIFICATION", pattern: /\breclassif/i, fromLabel: "Art VII", toLabel: "reclass", connective: "reclassification", max: 1, notes: "CNMD reclass" },
      { kind: "RATIO_CALCULATION", pattern: /\bLeverage Ratio\b/, fromLabel: "Art VII", toLabel: "Leverage Ratio", connective: "Leverage Ratio", max: 2, notes: "CNMD ratio" },
      { kind: "ENTITY_SCOPE", pattern: /\bGuarantor/, fromLabel: "Art VII", toLabel: "Guarantor", connective: "Guarantor", max: 2, notes: "CNMD guarantor" },
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bEBITDA\b/, fromLabel: "Art VII", toLabel: "EBITDA", connective: "defined-term", termName: "EBITDA", max: 2, notes: "CNMD EBITDA" },
    ],
  },
  {
    documentId: "cnmd-defs",
    issuer: "CNMD",
    packageId: "conmed-2025",
    sourceFile: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-definitions-excerpt.txt",
    split: "evaluation",
    recipes: [
      { kind: "FINANCIAL_INPUT", pattern: /\bNet Income\b/, fromLabel: "defs", toLabel: "NET_INCOME", connective: "Net Income", termName: "NET_INCOME", max: 1, notes: "CNMD FI" },
      { kind: "RATIO_CALCULATION", pattern: /\bLeverage Ratio\b/, fromLabel: "defs", toLabel: "Leverage Ratio", connective: "Leverage Ratio", max: 2, notes: "CNMD defs ratio" },
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bIndebtedness\b/, fromLabel: "defs", toLabel: "Indebtedness", connective: "defined-term", termName: "Indebtedness", max: 2, notes: "CNMD defs" },
      { kind: "COVENANT_TO_CONDITION", pattern: /\bsubject to\b/i, fromLabel: "defs", toLabel: "condition", connective: "subject to", max: 1, notes: "CNMD subject" },
      { kind: "COVENANT_TO_AMENDMENT", pattern: /\bas amended\b/i, fromLabel: "defs", toLabel: "amended", connective: "as amended", max: 1, notes: "CNMD amd" },
    ],
  },
  {
    documentId: "sup-doc-a",
    issuer: "SXI",
    packageId: "superior-2022-2025",
    sourceFile: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt",
    split: "blind",
    recipes: [
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bIndebtedness\b/, fromLabel: "covenant", toLabel: "Indebtedness", connective: "defined-term", termName: "Indebtedness", max: 3, notes: "blind SXI" },
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bEBITDA\b/, fromLabel: "covenant", toLabel: "EBITDA", connective: "defined-term", termName: "EBITDA", max: 2, notes: "blind SXI EBITDA" },
      { kind: "RECLASSIFICATION", pattern: /\breclassif/i, fromLabel: "covenant", toLabel: "reclass", connective: "reclassification", max: 1, notes: "blind SXI reclass" },
      { kind: "ENTITY_SCOPE", pattern: /\bRestricted Subsidiar/, fromLabel: "scope", toLabel: "Restricted Subsidiary", connective: "Restricted Subsidiary", max: 2, notes: "blind SXI entity" },
      { kind: "COVENANT_TO_CROSS_DOCUMENT", pattern: /\bSecurity Agreement\b/, fromLabel: "collateral", toLabel: "Security Agreement", connective: "Security Agreement", max: 1, notes: "blind SXI xd" },
      { kind: "COVENANT_TO_CROSS_DOCUMENT", pattern: /\bIntercreditor Agreement\b/, fromLabel: "lien", toLabel: "Intercreditor Agreement", connective: "Intercreditor Agreement", max: 1, notes: "blind SXI intercreditor" },
      { kind: "COVENANT_TO_CONDITION", pattern: /\bsubject to\b/i, fromLabel: "covenant", toLabel: "condition", connective: "subject to", max: 3, notes: "blind SXI condition" },
      { kind: "COVENANT_TO_EXCEPTION", pattern: /\bexcept as (?:provided|set forth|permitted)\b/i, fromLabel: "covenant", toLabel: "exception", connective: "except as", max: 2, notes: "blind SXI exception" },
      { kind: "RATIO_CALCULATION", pattern: /\bLeverage Ratio\b/, fromLabel: "ratio", toLabel: "Leverage Ratio", connective: "Leverage Ratio", max: 2, notes: "blind SXI ratio" },
      { kind: "FINANCIAL_INPUT", pattern: /\bNet Income\b/, fromLabel: "income", toLabel: "NET_INCOME", connective: "Net Income", termName: "NET_INCOME", max: 1, notes: "blind SXI FI" },
      { kind: "COVENANT_TO_AMENDMENT", pattern: /\bas amended\b/i, fromLabel: "amd", toLabel: "amended", connective: "as amended", max: 2, notes: "blind SXI amd" },
      { kind: "ENTITY_SCOPE", pattern: /\bGuarantor/, fromLabel: "scope", toLabel: "Guarantor", connective: "Guarantor", max: 1, notes: "blind SXI guarantor" },
    ],
  },
  {
    documentId: "gibraltar-ca",
    issuer: "ROCK",
    packageId: "gibraltar-2026",
    sourceFile: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
    split: "development",
    recipes: [
      { kind: "COVENANT_TO_DEFINITION", pattern: /\bIndebtedness\b/, fromLabel: "7.01", toLabel: "Indebtedness", connective: "defined-term", termName: "Indebtedness", max: 2, notes: "Gibraltar DEVELOPMENT per Arch+Cert — not evaluation" },
      { kind: "RECLASSIFICATION", pattern: /\breclassif/i, fromLabel: "7.01", toLabel: "reclass", connective: "reclassification", max: 1, notes: "Gibraltar reclass development evidence" },
      { kind: "COVENANT_TO_SHARED_BASKET", pattern: /\bAvailable Amount\b/, fromLabel: "7.05", toLabel: "Available Amount", connective: "Available Amount", termName: "Available Amount", max: 2, notes: "Gibraltar builder/shared" },
      { kind: "RATIO_CALCULATION", pattern: /\bConsolidated Total Net Leverage Ratio\b|\bLeverage Ratio\b/, fromLabel: "7.08", toLabel: "Leverage Ratio", connective: "financial covenant ratio", max: 2, notes: "Gibraltar financial covenant ratios" },
      { kind: "ENTITY_SCOPE", pattern: /\bRestricted Subsidiar/, fromLabel: "scope", toLabel: "Restricted Subsidiary", connective: "Restricted Subsidiary", max: 2, notes: "Gibraltar entity" },
      { kind: "COVENANT_TO_CROSS_DOCUMENT", pattern: /\bSecurity Agreement\b/, fromLabel: "collateral", toLabel: "Security Agreement", connective: "Security Agreement", max: 1, notes: "Gibraltar xd" },
    ],
  },
];

export function authorIndependentGroundTruth(): {
  totals: { edges: number; bySplit: Record<Split, number>; byIssuer: Record<string, number>; byKind: Record<string, number> };
  path: string;
} {
  const edges: AuthoredEdge[] = [];
  for (const doc of DOCS) {
    const text = load(doc.sourceFile);
    for (const recipe of doc.recipes) {
      const hits = findAll(text, recipe.pattern, recipe.max ?? 1);
      for (const hit of hits) {
        edges.push({
          edgeId: eid([doc.documentId, recipe.kind, recipe.toLabel, String(hit.index), hit.match.slice(0, 40)]),
          documentId: doc.documentId,
          issuer: doc.issuer,
          packageId: doc.packageId,
          split: doc.split,
          kind: recipe.kind,
          fromLabel: recipe.fromLabel,
          toLabel: recipe.toLabel,
          connective: recipe.connective,
          termName: recipe.termName,
          sourceSpan: {
            sourceFile: doc.sourceFile,
            charStart: hit.index,
            charEnd: hit.index + hit.match.length,
            excerpt: excerptAt(text, hit.index, hit.match.length),
          },
          notes: recipe.notes,
          authoredFrom: "SOURCE_TEXT_SPAN",
        });
      }
    }
  }

  const bySplit: Record<Split, number> = {
    development: edges.filter((e) => e.split === "development").length,
    evaluation: edges.filter((e) => e.split === "evaluation").length,
    blind: edges.filter((e) => e.split === "blind").length,
  };
  const byIssuer = Object.fromEntries([...new Set(edges.map((e) => e.issuer))].map((i) => [i, edges.filter((e) => e.issuer === i).length]));
  const byKind = Object.fromEntries([...new Set(edges.map((e) => e.kind))].map((k) => [k, edges.filter((e) => e.kind === k).length]));

  const outDir = join(ROOT, "tests/fixtures/covenant-dependency-atlas/authored-edges");
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "independent-ground-truth-phase3.json");
  const payload = {
    schemaVersion: "covenant-dependency-atlas.independent-gt.v1",
    authoredAt: new Date().toISOString(),
    method: "SOURCE_TEXT_SPAN — independently authored from authentic document text; not derived from extractor output",
    knifeRiverBlind: "PRESERVED_UNREAD — no Knife River body opened; no KNF/MDU filing ingested",
    gibraltarNote:
      "Gibraltar is DEVELOPMENT per Arch+Cert (docs/p3-lane-c-gibraltar-dev-edgar-1acdff3.md); Phase 2 evaluation label corrected in Phase 3",
    totals: { edges: edges.length, bySplit, byIssuer, byKind },
    edges,
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
  return { totals: payload.totals, path };
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("author-independent-gt.ts") || process.argv[1].endsWith("author-independent-gt.js"));

if (isDirectRun) {
  const result = authorIndependentGroundTruth();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}
