/**
 * System-level covenant challenge: families, quantitative mechanics,
 * relationships, and realistic transaction questions.
 * Deterministic only. DISCOVERED ≠ VERIFIED.
 *
 *   npx tsx scripts/product/challenge-system-covenants.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

type Target =
  | { kind: "fixture"; id: string; path: string; title: string; issuer: string; cik: string; class: string; persistSourceId?: string }
  | { kind: "neon"; id: string; sourceId: string; title: string };

const TARGETS: Target[] = [
  {
    kind: "fixture",
    id: "gibraltar",
    path: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
    title: "Gibraltar Industries Credit Agreement",
    issuer: "Gibraltar Industries, Inc.",
    cik: "0000912562",
    class: "CREDIT_AGREEMENT",
  },
  {
    kind: "fixture",
    id: "chewy",
    path: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
    title: "Chewy Credit Agreement",
    issuer: "Chewy, Inc.",
    cik: "0001766502",
    class: "CREDIT_AGREEMENT",
  },
  {
    kind: "fixture",
    id: "conmed-vii",
    path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
    title: "CONMED Article VII (curated)",
    issuer: "CONMED Corporation",
    cik: "0000816956",
    class: "CREDIT_AGREEMENT",
  },
  {
    kind: "neon",
    id: "brightview",
    sourceId: "research:cbcfl:bv-unknown-bv-ex10_1",
    title: "BrightView Holdings Credit Agreement",
  },
  {
    kind: "neon",
    id: "livenation",
    sourceId: "edgar:0001335258-26-000009:lyv-20251231xex1019amended.htm",
    title: "Live Nation Amended Credit Agreement",
  },
];

const QUESTIONS = [
  "Can the borrower incur additional unsecured indebtedness?",
  "What restrictions apply to additional secured debt?",
  "What restricted-payment / dividend baskets are available?",
  "What investments or acquisitions are permitted?",
  "What asset-sale restrictions apply?",
  "Can debt be refinanced or replaced?",
  "What guarantee capacity exists for subsidiaries?",
  "How do debt and lien permissions interact?",
  "Which baskets share capacity or use an Available Amount builder?",
  "What incremental facility capacity paths are available?",
  "What constitutes Consolidated EBITDA?",
];

async function loadText(t: Target): Promise<{
  sourceId: string;
  text: string;
  title: string;
  issuer?: string;
  cik: string;
  documentClass: string;
  row?: Awaited<ReturnType<typeof prisma.knowledgeSource.findUnique>>;
}> {
  if (t.kind === "fixture") {
    return {
      sourceId: `fixture:${t.id}`,
      text: readFileSync(path.resolve(t.path), "utf8"),
      title: t.title,
      issuer: t.issuer,
      cik: t.cik,
      documentClass: t.class,
    };
  }
  const row = await prisma.knowledgeSource.findUnique({ where: { sourceId: t.sourceId } });
  if (!row?.storageRef) throw new Error(`missing neon bytes ${t.sourceId}`);
  const { bytes } = await loadDurableSourceBytes({ sourceId: t.sourceId });
  const { text } = await extractTextAsync(bytes, row.exhibitFilename || "ex.htm");
  return {
    sourceId: t.sourceId,
    text,
    title: row.documentTitle || t.title,
    issuer: row.issuerName ?? undefined,
    cik: row.issuerCik,
    documentClass: row.documentClass,
    row,
  };
}

function mechStats(items: ReturnType<typeof buildDocumentCovenantSummary>["items"]) {
  const allBaskets = items.flatMap((i) => i.materialBasketsThresholds ?? []);
  return {
    growerBaskets: allBaskets.filter((b) => /Greater-of|grower/i.test(b)).length,
    sharedCapacitySignals: allBaskets.filter((b) => /Shared|aggregated capacity/i.test(b)).length,
    builderSignals: allBaskets.filter((b) => /Available Amount|Builder/i.test(b)).length,
    noaSignals: allBaskets.filter((b) => /Not Otherwise Applied|NOA /i.test(b)).length,
    antiStackSignals: allBaskets.filter((b) => /Anti-stacking|without-duplication/i.test(b)).length,
    reclassSignals: allBaskets.filter((b) => /reclassif|Divide-and-classify/i.test(b)).length,
    incrementalPathSignals: allBaskets.filter((b) => /Incremental path|Incremental Amount is a multi-component/i.test(b))
      .length,
    incrementalElectionSignals: allBaskets.filter((b) =>
      /default utilization order|redesignation into ratio/i.test(b),
    ).length,
    ratioThresholds: allBaskets.filter((b) => /Ratio threshold|Pro forma leverage|Borrower election/i.test(b)).length,
    reallocationSignals: allBaskets.filter((b) => /reallocation|reclassification/i.test(b)).length,
    itemsWithDependencies: items.filter((i) => (i.dependencies?.length ?? 0) > 0).length,
    itemsWithConditions: items.filter((i) => (i.conditions?.length ?? 0) > 0).length,
    itemsWithExceptions: items.filter((i) => (i.exceptions?.length ?? 0) > 0).length,
    generalProhibitions: items.filter((i) => i.posture === "GENERAL_PROHIBITION").length,
    conditionalPermissions: items.filter((i) => i.posture === "CONDITIONAL_PERMISSION").length,
  };
}

async function analyzeOne(t: Target) {
  const loaded = await loadText(t);
  const { sourceId, text } = loaded;
  const structural = extractStructure(sourceId, text);
  const definitions = discoverDefinitions(sourceId, text, structural.nodes);
  const xrefs = discoverCrossReferences(sourceId, text);
  const candidates = discoverCovenantCandidates(sourceId, text, structural.nodes);
  const conditions = extractConditionsAndExceptions(sourceId, text, structural.nodes);
  const summary = buildDocumentCovenantSummary({
    sourceId,
    documentTitle: loaded.title,
    issuerName: loaded.issuer,
    issuerCik: loaded.cik,
    documentClass: loaded.documentClass,
    candidates,
    definitions,
    structuralNodes: structural.nodes,
    crossReferences: xrefs,
  });

  const families = Object.keys(summary.countsByCategory);
  const mech = mechStats(summary.items);

  // Text-level expected signals (verification against operative document)
  const textSignals = {
    greaterOf: (text.match(/\bgreater of\b/gi) || []).length,
    availableAmount: (text.match(/\bAvailable Amount\b/g) || []).length,
    takenTogether: (text.match(/\btaken together with\b/gi) || []).length,
    borrowerOption: (text.match(/\bat the Borrowers?'? option\b/gi) || []).length,
  };

  const answers = QUESTIONS.map((question) => {
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
    const basketMentions = (answer.detail.match(
      /Greater-of|grower|Available Amount|Shared|Ratio threshold|Incremental path|Not Otherwise Applied|Anti-stack|\$[\d,]+/gi,
    ) || []).length;
    const dualRegime =
      /secured debt/i.test(question) &&
      /\[LIENS REGIME\]/i.test(answer.detail) &&
      /\[INDEBTEDNESS REGIME\]/i.test(answer.detail);
    return {
      question,
      kind: answer.kind,
      sections: answer.citations.map((c) => c.sectionRef).slice(0, 5),
      defLead: answer.citations.some((c) => /^Definition:/i.test(c.sectionRef)),
      basketMentions,
      dualRegime: /secured debt/i.test(question) ? dualRegime : undefined,
      hasLiensRegime: /\[LIENS REGIME\]/i.test(answer.detail),
      hasDebtRegime: /\[INDEBTEDNESS REGIME\]/i.test(answer.detail),
      hasRestrictions: /Contractual restrictions identified:/i.test(answer.detail),
      preview: answer.detail.slice(0, 320).replace(/\s+/g, " "),
    };
  });

  // Persist Neon targets only
  let persisted = false;
  if (t.kind === "neon" && loaded.row) {
    const prev =
      loaded.row.metadata && typeof loaded.row.metadata === "object" && !Array.isArray(loaded.row.metadata)
        ? (loaded.row.metadata as Record<string, unknown>)
        : {};
    await prisma.knowledgeSource.update({
      where: { sourceId: t.sourceId },
      data: {
        metadata: JSON.parse(
          JSON.stringify({
            ...prev,
            analysis: {
              structuralNodes: structural.nodes.length,
              definitions: definitions.length,
              covenantCandidates: candidates.length,
              crossReferences: xrefs.length,
              conditionsExceptions: conditions.length,
            },
            covenantSummary: summary,
            definitionRefresh: {
              scanner: "definition-scan.v2-entities",
              defs: definitions.length,
              candidates: candidates.length,
              at: new Date().toISOString(),
              paidInferenceCalls: 0,
              challenge: "system-covenants",
            },
            promotedToLegalTruth: 0,
          }),
        ),
      },
    });
    persisted = true;
  }

  return {
    id: t.id,
    title: loaded.title,
    sourceId,
    defs: definitions.length,
    candidates: candidates.length,
    conditions: conditions.length,
    xrefs: xrefs.length,
    summaryItems: summary.items.length,
    families,
    mechanics: mech,
    textSignals,
    coverageGaps: {
      growerUnderExtracted:
        textSignals.greaterOf > 10 && mech.growerBaskets < Math.min(8, Math.floor(textSignals.greaterOf / 8)),
      missingBuilderWhileTextHasAA: textSignals.availableAmount > 0 && mech.builderSignals === 0,
      missingSharedWhileTextHasTT: textSignals.takenTogether > 3 && mech.sharedCapacitySignals === 0,
      missingIncrementalPaths:
        (text.match(/\b(?:Fixed Incremental Amount|Cash-Capped Incremental|Ratio-Based Incremental|Ratio Incremental Amount)\b/g) || [])
          .length > 0 &&
        mech.incrementalPathSignals === 0,
      missingNoaWhileTextHasNoa:
        (text.match(/\bNot Otherwise Applied\b/g) || []).length > 0 && mech.noaSignals === 0,
    },
    answers,
    persisted,
    promotedToLegalTruth: 0,
  };
}

async function main() {
  const results = [];
  for (const t of TARGETS) {
    console.log(`\n=== ${t.id} ===`);
    const r = await analyzeOne(t);
    results.push(r);
    console.log(
      `families=${r.families.length} growers=${r.mechanics.growerBaskets} shared=${r.mechanics.sharedCapacitySignals} builders=${r.mechanics.builderSignals} noa=${r.mechanics.noaSignals} antiStack=${r.mechanics.antiStackSignals} incr=${r.mechanics.incrementalPathSignals} reclass=${r.mechanics.reclassSignals}`,
    );
    console.log(`gaps=${JSON.stringify(r.coverageGaps)}`);
    for (const a of r.answers) {
      if (/secured debt|incremental facility|Available Amount|Consolidated EBITDA/i.test(a.question)) {
        console.log(`  Q: ${a.question}`);
        console.log(
          `    ${a.sections.slice(0, 3).join(", ")} baskets~${a.basketMentions}${
            a.dualRegime != null ? ` dualRegime=${a.dualRegime}` : ""
          }`,
        );
      }
    }
  }

  const outDir = path.resolve("docs/product/covenant-intelligence-loop");
  mkdirSync(outDir, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    paidInferenceCalls: 0,
    promotedToLegalTruth: 0,
    verificationStatus: "AGENT_REVIEWED_PROVISIONAL",
    results,
  };
  writeFileSync(path.join(outDir, "latest-system-covenant-challenge.json"), JSON.stringify(payload, null, 2));
  writeFileSync(
    path.join(outDir, `system-covenant-challenge-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
    JSON.stringify(payload, null, 2),
  );
  console.log(JSON.stringify({ n: results.length, persisted: results.filter((r) => r.persisted).length }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
