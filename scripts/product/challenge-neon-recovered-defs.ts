/**
 * Challenge product covenant intelligence against Neon-backed authentic
 * agreements whose definitions were recovered by the entity-aware scanner.
 * Deterministic only — no paid inference. DISCOVERED ≠ VERIFIED.
 *
 *   npx tsx scripts/product/challenge-neon-recovered-defs.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { loadDurableSourceBytes } from "../../lib/knowledge-factory/preservation/durable-store";
import { extractTextAsync } from "../../lib/knowledge-factory/pipeline/text";
import {
  extractStructure,
  discoverDefinitions,
  discoverCrossReferences,
} from "../../lib/knowledge-factory/pipeline/structural";
import { discoverCovenantCandidates } from "../../lib/knowledge-factory/pipeline/candidates";
import { extractConditionsAndExceptions } from "../../lib/knowledge-factory/pipeline/conditions";
import { buildDocumentCovenantSummary } from "../../lib/product/covenant-intelligence/summarize";
import { answerFromSummaryItems } from "../../lib/product/covenant-intelligence/ask-retrieve";

interface Target {
  sourceId: string;
  label: string;
  questions: string[];
  expectedDefTerms: string[];
}

const TARGETS: Target[] = [
  {
    sourceId: "research:cbcfl:alks-unknown-alks-ex10_1",
    label: "Alkermes Amendment No. 1 to Credit Agreement",
    expectedDefTerms: [
      "Consolidated EBITDA",
      "Administrative Agent",
      "Restricted Payment",
      "Lien",
      "Permitted Refinancing Indebtedness",
    ],
    questions: [
      "What constitutes Consolidated EBITDA?",
      "What restrictions govern additional indebtedness?",
      "What debt baskets are available?",
      "What restricted payments are permitted?",
      "How do debt and lien permissions interact?",
      "What conditions or exceptions apply to refinancing indebtedness?",
    ],
  },
  {
    sourceId: "research:cbcfl:aeo2-unknown-aeo-ex10_1",
    label: "American Eagle Outfitters credit agreement exhibit",
    expectedDefTerms: [
      "Adjusted Consolidated EBITDA",
      "Administrative Agent",
      "Acquired EBITDA",
      "Material Indebtedness",
      "Permitted Refinancing Indebtedness",
    ],
    questions: [
      "What constitutes Consolidated EBITDA?",
      "What is Adjusted Consolidated EBITDA?",
      "What restrictions govern additional indebtedness?",
      "What investments are permitted?",
      "What restricted-payment baskets are available?",
      "How do debt and lien permissions interact?",
    ],
  },
  {
    sourceId: "fixture:dsgr-2022-2025-credit-facility:doc-b-2024-third-amendment.htm",
    label: "DSGR Third Amendment to A&R Credit Agreement",
    expectedDefTerms: [
      "Account Debtor",
      "Acquired EBITDA",
      "Acquisition",
      "Administrative Agent",
      "EBITDA",
    ],
    questions: [
      "What is Acquired EBITDA?",
      "What restrictions govern additional indebtedness?",
      "What debt baskets are available?",
      "What asset-sale restrictions apply?",
      "What conditions apply to acquisitions?",
      "How do amendment changes affect debt capacity?",
    ],
  },
  // Diverse follow-on (also entity-quote recovered)
  {
    sourceId: "research:cbcfl:gddy-unknown-ex101-73126",
    label: "GoDaddy Joinder and Thirteenth Amendment",
    expectedDefTerms: [
      "Administrative Agent",
      "Acquisition Agreement",
      "Acquisition",
    ],
    questions: [
      "What restrictions govern additional indebtedness?",
      "What is Acquisition Agreement?",
      "What debt baskets are available?",
      "How do amendment changes affect debt capacity?",
    ],
  },
  {
    sourceId: "research:cbcfl:mck-unknown-mck_ex101termloanagreement",
    label: "McKesson Term Loan Agreement",
    expectedDefTerms: ["Consolidated EBITDA", "Administrative Agent", "Lien"],
    questions: [
      "What constitutes Consolidated EBITDA?",
      "What restrictions apply to additional secured debt?",
      "What restrictions govern additional indebtedness?",
      "What incremental facility capacity paths are available?",
      "How do debt and lien permissions interact?",
    ],
  },
  {
    sourceId: "research:cbcfl:pton-unknown-tm2618568d1_ex10-1",
    label: "Peloton Interactive credit agreement exhibit",
    expectedDefTerms: ["Consolidated EBITDA", "Administrative Agent", "Restricted Payment"],
    questions: [
      "What constitutes Consolidated EBITDA?",
      "What restrictions apply to additional secured debt?",
      "What restricted-payment / dividend baskets are available?",
      "Which baskets share capacity or use an Available Amount builder?",
      "What investments or acquisitions are permitted?",
    ],
  },
  {
    sourceId: "research:cbcfl:chef-unknown-ex_975043",
    label: "The Chefs Warehouse credit agreement exhibit",
    expectedDefTerms: ["Consolidated EBITDA", "Administrative Agent", "Lien"],
    questions: [
      "What constitutes Consolidated EBITDA?",
      "What restrictions apply to additional secured debt?",
      "What restrictions govern additional indebtedness?",
      "What asset-sale restrictions apply?",
      "Can debt be refinanced or replaced?",
    ],
  },
  {
    sourceId: "edgar:0000092380-26-000077:exhibit102-01southwestai.htm",
    label: "Southwest Airlines Increase Joinder / First Amendment",
    expectedDefTerms: ["Administrative Agent", "Commitment"],
    questions: [
      "What restrictions govern additional indebtedness?",
      "What restrictions apply to additional secured debt?",
      "How do amendment changes affect debt capacity?",
      "Can debt be refinanced or replaced?",
    ],
  },
  {
    sourceId: "research:cbcfl:mrvi-unknown-newcreditagreement",
    label: "Maravai LifeSciences Credit Agreement",
    expectedDefTerms: ["Consolidated EBITDA", "Administrative Agent", "Lien", "Restricted Payment"],
    questions: [
      "What constitutes Consolidated EBITDA?",
      "What restrictions apply to additional secured debt?",
      "What restricted-payment / dividend baskets are available?",
      "What incremental facility capacity paths are available?",
      "Which baskets share capacity or use an Available Amount builder?",
      "How do debt and lien permissions interact?",
    ],
  },
  {
    sourceId: "research:cbcfl:chwy_alt-unknown-d43042dex101",
    label: "Chewy alternate credit agreement exhibit",
    expectedDefTerms: ["Consolidated EBITDA", "Available Amount", "Not Otherwise Applied"],
    questions: [
      "What constitutes Consolidated EBITDA?",
      "What restrictions apply to additional secured debt?",
      "What incremental facility capacity paths are available?",
      "Which baskets share capacity or use an Available Amount builder?",
      "What investments or acquisitions are permitted?",
    ],
  },
  {
    sourceId: "research:cbcfl:suja-unknown-suja-arcreditagreement20",
    label: "Suja Life A&R Credit Agreement",
    expectedDefTerms: ["Administrative Agent", "Lien"],
    questions: [
      "What restrictions apply to additional secured debt?",
      "What restrictions govern additional indebtedness?",
      "What investments or acquisitions are permitted?",
      "Can debt be refinanced or replaced?",
    ],
  },
  {
    sourceId: "edgar:0000018230-22-000199:ex104-thirdamendmendandres.htm",
    label: "Caterpillar Third A&R Credit Agreement (3Y)",
    expectedDefTerms: ["Consolidated EBITDA", "Administrative Agent", "Lien"],
    questions: [
      "What constitutes Consolidated EBITDA?",
      "What restrictions apply to additional secured debt?",
      "What restrictions govern additional indebtedness?",
      "Can debt be refinanced or replaced?",
      "How do debt and lien permissions interact?",
    ],
  },
];

function termPresent(defs: Array<{ term: string }>, want: string): boolean {
  const wantNorm = want.toLowerCase().replace(/\s+/g, " ").trim();
  return defs.some((d) => {
    const t = d.term.toLowerCase().replace(/\s+/g, " ").trim();
    return t === wantNorm || t.startsWith(wantNorm + " ") || wantNorm.startsWith(t + " ");
  });
}

async function analyzeTarget(t: Target) {
  const row = await prisma.knowledgeSource.findUnique({ where: { sourceId: t.sourceId } });
  if (!row?.storageRef) {
    return { sourceId: t.sourceId, label: t.label, error: "MISSING_NEON_BYTES" };
  }
  const { bytes } = await loadDurableSourceBytes({ sourceId: t.sourceId });
  const { text } = await extractTextAsync(bytes, row.exhibitFilename || "ex.htm");
  const structural = extractStructure(t.sourceId, text);
  const scan = structural.normalizedText;
  const definitions = discoverDefinitions(t.sourceId, scan, structural.nodes);
  const xrefs = discoverCrossReferences(t.sourceId, scan);
  const candidates = discoverCovenantCandidates(t.sourceId, scan, structural.nodes);
  const conditions = extractConditionsAndExceptions(t.sourceId, scan, structural.nodes);

  const summary = buildDocumentCovenantSummary({
    sourceId: t.sourceId,
    documentTitle: row.documentTitle || t.label,
    issuerName: row.issuerName ?? undefined,
    issuerCik: row.issuerCik,
    documentClass: row.documentClass,
    candidates,
    definitions,
    structuralNodes: structural.nodes,
    crossReferences: xrefs,
  });

  const itemsWithResolvedDefs = summary.items.filter((i) =>
    (i.applicableDefinitions ?? []).some((d) => d.resolved),
  ).length;
  const itemsWithUnresolvedDefs = summary.items.filter((i) =>
    (i.applicableDefinitions ?? []).some((d) => d.resolved === false),
  ).length;
  const itemsWithExceptions = summary.items.filter((i) => (i.exceptions?.length ?? 0) > 0).length;
  const itemsWithConditions = summary.items.filter((i) => (i.conditions?.length ?? 0) > 0).length;
  const itemsWithXrefs = summary.items.filter((i) => (i.crossReferences?.length ?? 0) > 0).length;
  const itemsWithBaskets = summary.items.filter(
    (i) => (i.materialBasketsThresholds?.length ?? 0) > 0,
  ).length;

  const expectedHits = t.expectedDefTerms.map((term) => ({
    term,
    present: termPresent(definitions, term),
  }));

  const answers = t.questions.map((question) => {
    const answer = answerFromSummaryItems({
      question,
      items: summary.items.map((i) => ({ ...i, sourceId: t.sourceId })),
      definedTerms: definitions.map((d) => ({
        term: d.term,
        excerpt: (d.excerpt ?? "").slice(0, 400),
      })),
      researchOnly: true,
      limit: 5,
    });
    const defHitsInAnswer = (answer.detail.match(/definition|EBITDA|Indebtedness|means/gi) || [])
      .length;
    const leadsWithDefinition = /^The agreement defines/i.test(answer.detail.trim()) ||
      answer.citations.some((c) => /^Definition:/i.test(c.sectionRef));
    return {
      question,
      kind: answer.kind,
      citationCount: answer.citations.length,
      detailPreview: answer.detail.slice(0, 500),
      hasUnresolved: /Unresolved:/i.test(answer.detail),
      hasPermissions: /Available permissions/i.test(answer.detail),
      hasRestrictions: /Contractual restrictions identified:/i.test(answer.detail),
      leadsWithDefinition,
      defLanguageHits: defHitsInAnswer,
      citedSections: answer.citations.map((c) => c.sectionRef).slice(0, 6),
      limitations: answer.limitations.slice(0, 4),
    };
  });

  // Spot-check: EBITDA / Indebtedness definition excerpts for agent verification
  const ebitda = definitions.find((d) => /consolidated\s+ebitda|^ebitda$/i.test(d.term));
  const indebtedness = definitions.find((d) => /^indebtedness$/i.test(d.term));
  const acquiredEbitda = definitions.find((d) => /acquired\s+ebitda/i.test(d.term));

  return {
    sourceId: t.sourceId,
    label: t.label,
    issuer: row.issuerName,
    textLen: text.length,
    structuralNodes: structural.nodes.length,
    definitions: definitions.length,
    candidates: candidates.length,
    conditionsExceptions: conditions.length,
    crossReferences: xrefs.length,
    summaryItems: summary.items.length,
    categories: [...new Set(summary.items.map((i) => i.category))],
    linkage: {
      itemsWithResolvedDefs,
      itemsWithUnresolvedDefs,
      itemsWithExceptions,
      itemsWithConditions,
      itemsWithXrefs,
      itemsWithBaskets,
    },
    expectedDefHits: expectedHits,
    expectedDefHitRate:
      expectedHits.filter((h) => h.present).length / Math.max(1, expectedHits.length),
    definitionSpots: {
      ebitda: ebitda
        ? { term: ebitda.term, excerpt: ebitda.excerpt.slice(0, 280) }
        : null,
      indebtedness: indebtedness
        ? { term: indebtedness.term, excerpt: indebtedness.excerpt.slice(0, 280) }
        : null,
      acquiredEbitda: acquiredEbitda
        ? { term: acquiredEbitda.term, excerpt: acquiredEbitda.excerpt.slice(0, 280) }
        : null,
    },
    answers,
    verificationStatus: "AGENT_REVIEWED_PROVISIONAL",
    promotedToLegalTruth: 0,
    // Persist-ready summary (caller may write to Neon)
    _summary: summary,
    _definitionCount: definitions.length,
    _candidateCount: candidates.length,
    _xrefCount: xrefs.length,
    _conditionCount: conditions.length,
    _structuralNodeCount: structural.nodes.length,
  };
}

async function main() {
  const results = [];
  for (const t of TARGETS) {
    console.log(`\n=== analyzing ${t.label} ===`);
    const r = await analyzeTarget(t);
    results.push(r);
    if ("error" in r && r.error) {
      console.log(`ERROR ${r.error}`);
      continue;
    }
    const ok = r as Awaited<ReturnType<typeof analyzeTarget>> & {
      definitions: number;
      linkage: Record<string, number>;
      expectedDefHitRate: number;
      answers: Array<{ question: string; kind: string; citationCount: number }>;
    };
    console.log(
      `defs=${ok.definitions} cands=${(ok as { candidates?: number }).candidates} cond=${(ok as { conditionsExceptions?: number }).conditionsExceptions} hitRate=${ok.expectedDefHitRate}`,
    );
    console.log(`linkage=${JSON.stringify(ok.linkage)}`);
    for (const a of ok.answers) {
      console.log(`  Q: ${a.question}`);
      console.log(`    ${a.kind} citations=${a.citationCount}`);
    }
  }

  // Strip heavy summary objects from JSON artifact (keep metrics)
  const serializable = results.map((r) => {
    const { _summary, ...rest } = r as Record<string, unknown>;
    void _summary;
    return rest;
  });

  const outDir = path.resolve("docs/product/covenant-intelligence-loop");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = {
    generatedAt: new Date().toISOString(),
    verificationStatus: "AGENT_REVIEWED_PROVISIONAL",
    paidInferenceCalls: 0,
    promotedToLegalTruth: 0,
    results: serializable,
  };
  writeFileSync(
    path.join(outDir, `neon-recovered-defs-challenge-${stamp}.json`),
    JSON.stringify(payload, null, 2),
  );
  writeFileSync(
    path.join(outDir, "latest-neon-recovered-defs-challenge.json"),
    JSON.stringify(payload, null, 2),
  );

  // Persist corrected summaries back to Neon for the three targets only
  let persisted = 0;
  for (const r of results) {
    if (!(r as { _summary?: unknown })._summary) continue;
    const full = r as {
      sourceId: string;
      _summary: unknown;
      _definitionCount: number;
      _candidateCount: number;
      _xrefCount: number;
      _conditionCount: number;
      _structuralNodeCount: number;
    };
    const row = await prisma.knowledgeSource.findUnique({ where: { sourceId: full.sourceId } });
    if (!row) continue;
    const prev =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    await prisma.knowledgeSource.update({
      where: { sourceId: full.sourceId },
      data: {
        metadata: JSON.parse(
          JSON.stringify({
            ...prev,
            analysis: {
              structuralNodes: full._structuralNodeCount,
              definitions: full._definitionCount,
              covenantCandidates: full._candidateCount,
              crossReferences: full._xrefCount,
              conditionsExceptions: full._conditionCount,
            },
            covenantSummary: full._summary,
            definitionRefresh: {
              scanner: "definition-scan.v2-entities",
              defs: full._definitionCount,
              candidates: full._candidateCount,
              at: new Date().toISOString(),
              paidInferenceCalls: 0,
              challenge: "neon-recovered-defs",
            },
            promotedToLegalTruth: 0,
          }),
        ),
      },
    });
    persisted += 1;
    console.log(`PERSISTED ${full.sourceId}`);
  }

  console.log(JSON.stringify({ targets: TARGETS.length, persisted, paidInferenceCalls: 0 }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
