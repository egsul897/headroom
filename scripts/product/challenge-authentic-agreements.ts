/**
 * Exercise the product covenant-intelligence path against authentic curated
 * financing text. DISCOVERED ≠ VERIFIED. Agent-reviewed only.
 *
 * Usage: npx tsx scripts/product/challenge-authentic-agreements.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { extractStructure, discoverDefinitions, discoverCrossReferences } from "../../lib/knowledge-factory/pipeline/structural";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { answerFromSummaryItems } from "../../lib/product/covenant-intelligence/ask-retrieve";

interface Case {
  id: string;
  path: string;
  title: string;
  issuer: string;
  cik: string;
  documentClass: "CREDIT_AGREEMENT" | "AMENDMENT";
  questions: string[];
}

const CASES: Case[] = [
  {
    id: "conmed-article-vii",
    path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
    title: "CONMED Eighth A&R Credit Agreement (Article VII curated)",
    issuer: "CONMED Corporation",
    cik: "0000816956",
    documentClass: "CREDIT_AGREEMENT",
    questions: [
      "What restrictions govern additional indebtedness?",
      "What debt baskets are available?",
      "What restrictions apply to secured debt?",
      "How do debt and lien permissions interact?",
      "What restricted payments are permitted?",
      "What investments are permitted?",
      "Can debt be refinanced?",
      "Which restrictions apply to subsidiaries and guarantors?",
    ],
  },
  {
    id: "gibraltar-credit-agreement",
    path: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
    title: "Gibraltar Industries Credit Agreement",
    issuer: "Gibraltar Industries, Inc.",
    cik: "0000912562",
    documentClass: "CREDIT_AGREEMENT",
    questions: [
      "What restrictions govern additional indebtedness?",
      "What constitutes Consolidated EBITDA?",
      "How is Total Net Leverage Ratio calculated?",
      "What asset-sale restrictions apply?",
      "What restricted-payment baskets are available?",
    ],
  },
  {
    id: "chewy-credit-agreement",
    path: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
    title: "Chewy Credit Agreement (2026-06-23)",
    issuer: "Chewy, Inc.",
    cik: "0001766502",
    documentClass: "CREDIT_AGREEMENT",
    questions: [
      "What restrictions govern additional indebtedness?",
      "What debt baskets are available?",
      "How do debt and lien permissions interact?",
      "What investments are permitted?",
      "Which baskets share capacity?",
    ],
  },
];

function analyze(c: Case) {
  const text = readFileSync(resolve(c.path), "utf8");
  const sourceId = `fixture:${c.id}`;
  const structural = extractStructure(sourceId, text);
  const definitions = discoverDefinitions(sourceId, text, structural.nodes);
  const xrefs = discoverCrossReferences(sourceId, text);
  const candidates = discoverCovenantCandidates(sourceId, text, structural.nodes);
  const summary = buildDocumentCovenantSummary({
    sourceId,
    documentTitle: c.title,
    issuerName: c.issuer,
    issuerCik: c.cik,
    documentClass: c.documentClass,
    candidates,
    definitions,
    structuralNodes: structural.nodes,
    crossReferences: xrefs,
  });
  const answers = c.questions.map((question) => {
    const answer = answerFromSummaryItems({
      question,
      items: summary.items.map((i) => ({ ...i, sourceId })),
      definedTerms: definitions.map((d) => ({
        term: d.term,
        excerpt: (d.excerpt ?? "").slice(0, 400),
      })),
      researchOnly: true,
      limit: 5,
    });
    return {
      question,
      kind: answer.kind,
      citationCount: answer.citations.length,
      detailPreview: answer.detail.slice(0, 280),
      hasUnresolved: /Unresolved:/i.test(answer.detail),
      hasPermissions: /Available permissions/i.test(answer.detail),
      hasRestrictions: /Contractual restrictions identified:/i.test(answer.detail),
    };
  });
  return {
    id: c.id,
    title: c.title,
    bytes: text.length,
    structuralNodes: structural.nodes.length,
    definitions: definitions.length,
    candidates: candidates.length,
    summaryItems: summary.items.length,
    categories: [...new Set(summary.items.map((i) => i.category))],
    basketSurfaces: summary.items.filter((i) => (i.materialBasketsThresholds?.length ?? 0) > 0).length,
    answers,
    verificationStatus: "AGENT_REVIEWED_PROVISIONAL",
  };
}

const results = CASES.map(analyze);
const outDir = resolve("docs/product/covenant-intelligence-loop");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = resolve(outDir, `authentic-challenge-${stamp}.json`);
writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), verificationStatus: "AGENT_REVIEWED_PROVISIONAL", results }, null, 2));
writeFileSync(resolve(outDir, "latest-authentic-challenge.json"), JSON.stringify({ generatedAt: new Date().toISOString(), verificationStatus: "AGENT_REVIEWED_PROVISIONAL", results }, null, 2));

for (const r of results) {
  console.log(`\n=== ${r.id} ===`);
  console.log(`nodes=${r.structuralNodes} defs=${r.definitions} candidates=${r.candidates} summaryItems=${r.summaryItems} basketSurfaces=${r.basketSurfaces}`);
  console.log(`categories=${r.categories.join(",")}`);
  for (const a of r.answers) {
    console.log(`  Q: ${a.question}`);
    console.log(`    ${a.kind} citations=${a.citationCount} restrictions=${a.hasRestrictions} permissions=${a.hasPermissions} unresolved=${a.hasUnresolved}`);
  }
}
console.log(`\nwrote ${outPath}`);
