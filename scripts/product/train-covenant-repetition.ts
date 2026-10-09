/**
 * Continuous covenant training loop (deterministic, zero paid inference).
 * Analyze → verify against operative text → score L1/L2/L3 → report failures.
 *
 *   npx tsx scripts/product/train-covenant-repetition.ts
 *   npx tsx scripts/product/train-covenant-repetition.ts --persist-neon
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
import type { CovenantSummaryItem } from "../../lib/product/covenant-intelligence/summarize";

type Difficulty = "L1" | "L2" | "L3";

interface Probe {
  id: string;
  difficulty: Difficulty;
  family: "DEBT" | "LIENS" | "RP" | "INVESTMENTS" | "INCREMENTAL" | "AA" | "ASK";
  /** Operative text must contain these (case-insensitive). */
  mustFindInSource: RegExp[];
  /** Summary/answer must satisfy these checks. */
  expect: (ctx: ProbeCtx) => { ok: boolean; detail: string }[];
}

interface ProbeCtx {
  text: string;
  items: Array<CovenantSummaryItem & { sourceId: string }>;
  definitions: Array<{ term: string; excerpt: string }>;
  answers: Record<string, ReturnType<typeof answerFromSummaryItems>>;
}

interface Target {
  id: string;
  kind: "fixture" | "neon";
  path?: string;
  sourceId?: string;
  title: string;
  issuer: string;
  cik: string;
}

const TARGETS: Target[] = [
  {
    id: "gibraltar",
    kind: "fixture",
    path: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt",
    title: "Gibraltar Industries Credit Agreement",
    issuer: "Gibraltar Industries, Inc.",
    cik: "0000912562",
  },
  {
    id: "chewy",
    kind: "fixture",
    path: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
    title: "Chewy Credit Agreement",
    issuer: "Chewy, Inc.",
    cik: "0001766502",
  },
  {
    id: "conmed-vii",
    kind: "fixture",
    path: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt",
    title: "CONMED Article VII",
    issuer: "CONMED Corporation",
    cik: "0000816956",
  },
  {
    id: "riot-sar",
    kind: "fixture",
    path: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt",
    title: "Riot Platforms Second A&R",
    issuer: "Riot Platforms, Inc.",
    cik: "0001167419",
  },
  {
    id: "lsb-vi",
    kind: "fixture",
    path: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt",
    title: "LSB ABL Article VI",
    issuer: "LSB Industries, Inc.",
    cik: "0000060714",
  },
  {
    id: "fwrg-vi",
    kind: "fixture",
    path: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt",
    title: "FWRG Article VI",
    issuer: "First Watch Restaurant Group, Inc.",
    cik: "0001789940",
  },
  {
    id: "suja",
    kind: "neon",
    sourceId: "research:cbcfl:suja-unknown-suja-arcreditagreement20",
    title: "Suja Life A&R Credit Agreement",
    issuer: "Suja Life",
    cik: "0000000000",
  },
  {
    id: "maravai",
    kind: "neon",
    sourceId: "research:cbcfl:mrvi-unknown-newcreditagreement",
    title: "Maravai LifeSciences Credit Agreement",
    issuer: "Maravai LifeSciences",
    cik: "0000000000",
  },
  // Unseen Neon holdouts (not used to develop prior fixes)
  {
    id: "alkermes",
    kind: "neon",
    sourceId: "research:cbcfl:alks-unknown-alks-ex10_1",
    title: "Alkermes plc",
    issuer: "Alkermes plc",
    cik: "0000000000",
  },
  {
    id: "aeo",
    kind: "neon",
    sourceId: "research:cbcfl:aeo2-unknown-aeo-ex10_1",
    title: "American Eagle Outfitters",
    issuer: "American Eagle Outfitters",
    cik: "0000000000",
  },
  {
    id: "godaddy",
    kind: "neon",
    sourceId: "research:cbcfl:gddy-unknown-ex101-73126",
    title: "GoDaddy",
    issuer: "GoDaddy",
    cik: "0000000000",
  },
  {
    id: "peloton",
    kind: "neon",
    sourceId: "research:cbcfl:pton-unknown-tm2618568d1_ex10-1",
    title: "Peloton Interactive",
    issuer: "Peloton Interactive",
    cik: "0000000000",
  },
];

const ASK_Qs = {
  debt: "Can the borrower incur additional unsecured indebtedness?",
  secured: "What restrictions apply to additional secured debt?",
  rp: "What restricted-payment / dividend baskets are available?",
  invest: "What investments or acquisitions are permitted?",
  refinance: "Can debt be refinanced or replaced?",
  aa: "Which baskets share capacity or use an Available Amount builder?",
  incr: "What incremental facility capacity paths are available?",
  ebitda: "What constitutes Consolidated EBITDA?",
};

function itemHay(i: CovenantSummaryItem): string {
  return [
    i.heading,
    i.plainEnglish,
    i.restriction ?? "",
    ...(i.permissions ?? []),
    ...(i.materialBasketsThresholds ?? []),
    ...(i.conditions ?? []),
    ...(i.exceptions ?? []),
    i.operativeLanguageExcerpt ?? "",
  ].join("\n");
}

function findDebtGp(items: CovenantSummaryItem[]) {
  const scored = items
    .filter(
      (i) =>
        i.category === "DEBT_INCURRENCE" &&
        (i.posture === "GENERAL_PROHIBITION" ||
          /limitation on\s+(?:incurrence of\s+)?indebtedness/i.test(i.heading) ||
          /^indebtedness\b/i.test(i.heading)) &&
        !/\bincremental\b/i.test(i.heading) &&
        !/\b(?:mandatory prepayment|excess cash flow|repatriation)\b/i.test(
          `${i.heading} ${i.plainEnglish}`,
        ),
    )
    .map((i) => {
      let score = 0;
      if (/limitation on\s+(?:incurrence of\s+)?indebtedness/i.test(i.heading)) score += 20;
      if (/^indebtedness\b/i.test(i.heading)) score += 12;
      if (i.posture === "GENERAL_PROHIBITION") score += 6;
      if (/create,\s*incur|shall not.*Indebtedness|Disqualified Stock/i.test(i.restriction ?? "")) score += 8;
      if (/^Section\s+\d+\.\d+\(/i.test(i.heading)) score -= 15;
      if (/^[4567]\.\d+$/.test(i.sectionRef)) score += 4;
      return { i, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.i;
}
function findLienGp(items: CovenantSummaryItem[]) {
  return items.find(
    (i) =>
      i.category === "LIENS_SECURED_DEBT" &&
      (i.posture === "GENERAL_PROHIBITION" || /^(?:limitations?\s+on\s+)?liens?\b/i.test(i.heading)) &&
      !/ownership of propert/i.test(i.heading),
  );
}
function findRp(items: CovenantSummaryItem[]) {
  return items.find(
    (i) =>
      i.category === "RESTRICTED_PAYMENTS_INVESTMENTS" &&
      /\brestricted\s+payments?\b/i.test(i.heading + i.plainEnglish),
  );
}

const PROBES: Probe[] = [
  // —— Level 1 ——
  {
    id: "L1-debt-gp-posture",
    difficulty: "L1",
    family: "DEBT",
    mustFindInSource: [/\b(?:shall not|will not|not)\b.{0,40}\b(?:incur|create|assume).{0,40}\bIndebtedness\b/i],
    expect: (ctx) => {
      const d = findDebtGp(ctx.items);
      return [
        {
          ok: !!d,
          detail: d ? `debt GP @ ${d.sectionRef}` : "missing DEBT general prohibition item",
        },
        {
          ok: !!d && (d.posture === "GENERAL_PROHIBITION" || !!d.restriction),
          detail: d ? `posture=${d.posture} restriction=${!!d.restriction}` : "n/a",
        },
        {
          ok:
            !!d &&
            (/indebtedness|incur|create|Disqualified Stock|Preferred Stock/i.test(
              `${d.restriction ?? ""} ${d.plainEnglish} ${d.heading}`,
            ) ||
              /limitation on\s+(?:incurrence of\s+)?indebtedness/i.test(d.heading)),
          detail: d ? `restriction/heading cites debt-incurrence substance` : "n/a",
        },
      ];
    },
  },
  {
    id: "L1-liens-gp-posture",
    difficulty: "L1",
    family: "LIENS",
    mustFindInSource: [/\b(?:shall not|will not|not)\b.{0,60}\bLien/i],
    expect: (ctx) => {
      const d = findLienGp(ctx.items);
      return [
        { ok: !!d, detail: d ? `lien GP @ ${d.sectionRef}` : "missing LIENS general prohibition" },
        {
          ok: !!d && d.posture === "GENERAL_PROHIBITION",
          detail: d ? `posture=${d.posture}` : "n/a",
        },
      ];
    },
  },
  {
    id: "L1-fixed-dollar-basket",
    difficulty: "L1",
    family: "DEBT",
    mustFindInSource: [/\$\s?[\d,]+(?:\.\d+)?(?:\s*(?:million|billion))?/i],
    expect: (ctx) => {
      const hit = ctx.items.some((i) =>
        (i.materialBasketsThresholds ?? []).some((b) => /Amount\/threshold|\$[\d,]/i.test(b)),
      );
      return [{ ok: hit, detail: hit ? "fixed-dollar threshold surfaced" : "no Amount/threshold baskets" }];
    },
  },
  {
    id: "L1-no-default-condition",
    difficulty: "L1",
    family: "DEBT",
    mustFindInSource: [/\bno\s+(?:Default|Event of Default)\b/i],
    expect: (ctx) => {
      const hit = ctx.items.some(
        (i) =>
          (i.conditions ?? []).some((c) => /no_default|Default/i.test(c)) ||
          (i.dependencies ?? []).some((d) => /Default/i.test(d)) ||
          /no Default|Event of Default/i.test(itemHay(i)),
      );
      return [{ ok: hit, detail: hit ? "no-default condition captured" : "no-default present in source but missing from analysis" }];
    },
  },
  {
    id: "L1-ask-secured-dual-regime",
    difficulty: "L1",
    family: "ASK",
    mustFindInSource: [/\bLien/i, /\bIndebtedness\b/i],
    expect: (ctx) => {
      const a = ctx.answers.secured;
      const hasBoth =
        a?.kind === "answered" &&
        /\[LIENS REGIME\]/i.test(a.detail) &&
        /\[INDEBTEDNESS REGIME\]/i.test(a.detail);
      const hasLienItem = !!findLienGp(ctx.items);
      const hasDebtItem = !!findDebtGp(ctx.items);
      // Only require dual when both regimes exist in the package
      const ok = !(hasLienItem && hasDebtItem) || hasBoth;
      return [
        {
          ok,
          detail: hasBoth
            ? "dual regime present"
            : hasLienItem && hasDebtItem
              ? "BOTH regimes in summary but Ask missing dual labels"
              : "single-regime package (honest)",
        },
      ];
    },
  },
  {
    id: "L1-ask-no-invented-capacity",
    difficulty: "L1",
    family: "ASK",
    mustFindInSource: [],
    expect: (ctx) => {
      const a = ctx.answers.debt;
      const invents =
        a?.kind === "answered" &&
        /\b(?:available capacity is|the borrower may borrow up to|headroom is)\s*\$/i.test(a.detail);
      return [
        {
          ok: !invents,
          detail: invents ? "CRITICAL: invented numeric capacity" : "no invented capacity figure",
        },
        {
          ok: a?.kind === "answered" ? /DISCOVERED|not a legal|Unresolved|permissions listed are textual/i.test(a.detail) : true,
          detail: "epistemic limitation language present or unanswered",
        },
      ];
    },
  },

  // —— Level 2 ——
  {
    id: "L2-greater-of-grower",
    difficulty: "L2",
    family: "DEBT",
    mustFindInSource: [/\bgreater of\b/i],
    expect: (ctx) => {
      const hit = ctx.items.some((i) =>
        (i.materialBasketsThresholds ?? []).some((b) => /Greater-of|grower/i.test(b)),
      );
      return [{ ok: hit, detail: hit ? "grower extracted" : "greater-of in source but not extracted" }];
    },
  },
  {
    id: "L2-ratio-threshold",
    difficulty: "L2",
    family: "DEBT",
    mustFindInSource: [/\d+(?:\.\d+)?\s*(?:to|:)\s*1(?:\.00)?/],
    expect: (ctx) => {
      const hit = ctx.items.some((i) =>
        (i.materialBasketsThresholds ?? []).some((b) => /Ratio threshold|Pro forma leverage/i.test(b)),
      );
      return [{ ok: hit, detail: hit ? "ratio threshold extracted" : "ratio in source but not extracted" }];
    },
  },
  {
    id: "L2-available-amount",
    difficulty: "L2",
    family: "AA",
    mustFindInSource: [/\bAvailable Amount\b/],
    expect: (ctx) => {
      const hit = ctx.items.some((i) =>
        (i.materialBasketsThresholds ?? []).some((b) => /Available Amount|Builder/i.test(b)),
      );
      const limb = ctx.items.some((i) =>
        (i.materialBasketsThresholds ?? []).some((b) =>
          /Available Amount limb:|deductions|additive|builder defined at Section/i.test(b),
        ),
      );
      return [
        { ok: hit, detail: hit ? "AA builder referenced" : "Available Amount in source but not extracted" },
        { ok: !hit || limb, detail: limb ? "AA limb/deduction/pointer signal present" : "AA referenced without limb/deduction detail" },
      ];
    },
  },
  {
    id: "L2-ebitda-definition-lead",
    difficulty: "L2",
    family: "ASK",
    mustFindInSource: [/“\s*Consolidated EBITDA\s*”\s*means|Consolidated EBITDA[^.…]{0,20}means/i],
    expect: (ctx) => {
      const a = ctx.answers.ebitda;
      const defLead = a?.citations?.some((c) => /^Definition:\s*Consolidated EBITDA/i.test(c.sectionRef));
      const hasDef = ctx.definitions.some((d) => /^Consolidated EBITDA$/i.test(d.term));
      return [
        {
          ok: !hasDef || !!defLead,
          detail: defLead
            ? "definition-first EBITDA answer"
            : hasDef
              ? "Consolidated EBITDA def present but Ask did not lead with Definition:"
              : "no Consolidated EBITDA def in package",
        },
      ];
    },
  },
  {
    id: "L2-rp-baskets",
    difficulty: "L2",
    family: "RP",
    mustFindInSource: [/\bRestricted Payments?\b/i],
    expect: (ctx) => {
      const rp = findRp(ctx.items);
      const a = ctx.answers.rp;
      return [
        { ok: !!rp, detail: rp ? `RP item @ ${rp.sectionRef}` : "missing RP summary item" },
        {
          ok: a?.kind === "answered" && a.citations.length > 0,
          detail: a?.kind === "answered" ? `RP Ask citations=${a.citations.length}` : "RP Ask unanswered",
        },
      ];
    },
  },

  // —— Level 3 ——
  {
    id: "L3-shared-capacity",
    difficulty: "L3",
    family: "INVESTMENTS",
    mustFindInSource: [/\btaken together with\b/i],
    expect: (ctx) => {
      const hit = ctx.items.some((i) =>
        (i.materialBasketsThresholds ?? []).some((b) => /Shared|aggregated capacity/i.test(b)),
      );
      return [{ ok: hit, detail: hit ? "shared capacity signal" : "taken-together in source but not extracted" }];
    },
  },
  {
    id: "L3-anti-stack",
    difficulty: "L3",
    family: "INVESTMENTS",
    mustFindInSource: [/\bwithout duplication\s+for purposes of\s+Section\b/i],
    expect: (ctx) => {
      const hit = ctx.items.some((i) =>
        (i.materialBasketsThresholds ?? []).some((b) => /Anti-stacking/i.test(b)),
      );
      const scope = ctx.items.some((i) =>
        (i.materialBasketsThresholds ?? []).some((b) => /Anti-stacking scope:/i.test(b)),
      );
      return [
        { ok: hit, detail: hit ? "anti-stack signal" : "without-duplication-for-purposes in source, not extracted" },
        { ok: !hit || scope, detail: scope ? "anti-stack scope clip present" : "anti-stack without scope clip" },
      ];
    },
  },
  {
    id: "L3-reclassification",
    difficulty: "L3",
    family: "DEBT",
    mustFindInSource: [/\b(?:reclassify|divide(?:\s+and)?,?\s*classify)\b/i],
    expect: (ctx) => {
      const hit = ctx.items.some((i) =>
        (i.materialBasketsThresholds ?? []).some((b) => /reclassif|Divide-and-classify/i.test(b)),
      );
      return [{ ok: hit, detail: hit ? "reclass signal" : "reclassify/divide-and-classify in source, not extracted" }];
    },
  },
  {
    id: "L3-incremental-paths",
    difficulty: "L3",
    family: "INCREMENTAL",
    mustFindInSource: [
      /\b(?:Fixed Incremental Amount|Cash-Capped Incremental|Ratio Incremental Amount|Ratio-Based Incremental|Voluntary Prepayment Incremental|Prepayment-Based Incremental)\b/i,
    ],
    expect: (ctx) => {
      const hit = ctx.items.some((i) =>
        (i.materialBasketsThresholds ?? []).some((b) =>
          /Incremental path:|Incremental path construct referenced|multi-component/i.test(b),
        ),
      );
      const multi = ctx.items.some((i) =>
        (i.materialBasketsThresholds ?? []).some((b) =>
          /multi-component|Incremental limb:|election order|Incremental path: Fixed|Incremental path: Ratio|Incremental path: Voluntary|Incremental Prepayment|Prepayment Incremental/i.test(
            b,
          ),
        ),
      );
      const a = ctx.answers.incr;
      return [
        { ok: hit, detail: hit ? "incremental path extracted" : "incremental drafting in source, not extracted" },
        { ok: !hit || multi, detail: multi ? "incremental limb/order detail" : "path flag without limb/order detail" },
        {
          ok: a?.kind === "answered" && /Incremental capacity typically combines/i.test(a.detail ?? ""),
          detail: a?.kind === "answered" ? "incremental Ask lead OK" : "incremental Ask unanswered",
        },
      ];
    },
  },
  {
    id: "L3-noa",
    difficulty: "L3",
    family: "AA",
    mustFindInSource: [/\bNot Otherwise Applied\b/],
    expect: (ctx) => {
      const hit = ctx.items.some((i) =>
        (i.materialBasketsThresholds ?? []).some((b) => /Not Otherwise Applied|NOA /i.test(b)),
      );
      return [{ ok: hit, detail: hit ? "NOA extracted" : "Not Otherwise Applied in source, not extracted" }];
    },
  },
];

async function loadTarget(t: Target): Promise<{ sourceId: string; text: string; title: string; issuer: string; cik: string; class: string }> {
  if (t.kind === "fixture") {
    const p = path.resolve(t.path!);
    if (!existsSync(p)) throw new Error(`missing fixture ${p}`);
    return {
      sourceId: `fixture:train:${t.id}`,
      text: readFileSync(p, "utf8"),
      title: t.title,
      issuer: t.issuer,
      cik: t.cik,
      class: "CREDIT_AGREEMENT",
    };
  }
  const row = await prisma.knowledgeSource.findUnique({ where: { sourceId: t.sourceId! } });
  if (!row?.storageRef) throw new Error(`missing neon ${t.sourceId}`);
  const { bytes } = await loadDurableSourceBytes({ sourceId: t.sourceId! });
  const { text } = await extractTextAsync(bytes, row.exhibitFilename || "ex.htm");
  return {
    sourceId: t.sourceId!,
    text,
    title: row.documentTitle || t.title,
    issuer: row.issuerName || t.issuer,
    cik: row.issuerCik,
    class: row.documentClass,
  };
}

async function analyzeTarget(t: Target, persist: boolean) {
  const loaded = await loadTarget(t);
  const { sourceId, text } = loaded;
  const structural = extractStructure(sourceId, text);
  const scan = structural.normalizedText;
  const definitions = discoverDefinitions(sourceId, scan, structural.nodes);
  const xrefs = discoverCrossReferences(sourceId, scan);
  const candidates = discoverCovenantCandidates(sourceId, scan, structural.nodes);
  const conditions = extractConditionsAndExceptions(sourceId, scan, structural.nodes);
  const summary = buildDocumentCovenantSummary({
    sourceId,
    documentTitle: loaded.title,
    issuerName: loaded.issuer,
    issuerCik: loaded.cik,
    documentClass: loaded.class,
    candidates,
    definitions,
    structuralNodes: structural.nodes,
    crossReferences: xrefs,
  });
  const items = summary.items.map((i) => ({ ...i, sourceId }));
  const definedTerms = definitions.map((d) => ({ term: d.term, excerpt: (d.excerpt ?? "").slice(0, 400) }));
  const answers: ProbeCtx["answers"] = {};
  for (const [k, q] of Object.entries(ASK_Qs)) {
    answers[k] = answerFromSummaryItems({ question: q, items, definedTerms, researchOnly: true, limit: 5 });
  }

  const ctx: ProbeCtx = {
    text: scan,
    items,
    definitions: definedTerms,
    answers,
  };

  const results = [];
  for (const probe of PROBES) {
    const applicable = probe.mustFindInSource.length === 0 || probe.mustFindInSource.every((re) => re.test(scan));
    if (!applicable) {
      results.push({
        probeId: probe.id,
        difficulty: probe.difficulty,
        family: probe.family,
        status: "SKIPPED_SOURCE_ABSENT" as const,
        checks: [],
      });
      continue;
    }
    const checks = probe.expect(ctx);
    const ok = checks.every((c) => c.ok);
    results.push({
      probeId: probe.id,
      difficulty: probe.difficulty,
      family: probe.family,
      status: ok ? ("PASS" as const) : ("FAIL" as const),
      checks,
    });
  }

  if (persist && t.kind === "neon") {
    const row = await prisma.knowledgeSource.findUnique({ where: { sourceId: t.sourceId! } });
    if (row) {
      const prev =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      await prisma.knowledgeSource.update({
        where: { sourceId: t.sourceId! },
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
                challenge: "covenant-training-repetition",
              },
              promotedToLegalTruth: 0,
            }),
          ),
        },
      });
    }
  }

  const byDiff = { L1: { pass: 0, fail: 0, skip: 0 }, L2: { pass: 0, fail: 0, skip: 0 }, L3: { pass: 0, fail: 0, skip: 0 } };
  for (const r of results) {
    const b = byDiff[r.difficulty];
    if (r.status === "PASS") b.pass++;
    else if (r.status === "FAIL") b.fail++;
    else b.skip++;
  }

  return {
    id: t.id,
    title: loaded.title,
    sourceId,
    nodes: structural.nodes.length,
    defs: definitions.length,
    cands: candidates.length,
    items: summary.items.length,
    byDifficulty: byDiff,
    failures: results.filter((r) => r.status === "FAIL"),
    passes: results.filter((r) => r.status === "PASS").map((r) => r.probeId),
    skipped: results.filter((r) => r.status === "SKIPPED_SOURCE_ABSENT").map((r) => r.probeId),
    results,
    promotedToLegalTruth: 0,
  };
}

async function main() {
  const persist = process.argv.includes("--persist-neon");
  const out = [];
  for (const t of TARGETS) {
    console.log(`\n=== ${t.id} ===`);
    try {
      const r = await analyzeTarget(t, persist);
      out.push(r);
      console.log(
        `nodes=${r.nodes} defs=${r.defs} cands=${r.cands} items=${r.items}`,
      );
      console.log(
        `L1 ${r.byDifficulty.L1.pass}p/${r.byDifficulty.L1.fail}f/${r.byDifficulty.L1.skip}s | L2 ${r.byDifficulty.L2.pass}p/${r.byDifficulty.L2.fail}f/${r.byDifficulty.L2.skip}s | L3 ${r.byDifficulty.L3.pass}p/${r.byDifficulty.L3.fail}f/${r.byDifficulty.L3.skip}s`,
      );
      for (const f of r.failures) {
        console.log(`  FAIL ${f.probeId}: ${f.checks.filter((c) => !c.ok).map((c) => c.detail).join("; ")}`);
      }
    } catch (e) {
      console.log(`  ERROR ${e instanceof Error ? e.message : String(e)}`);
      out.push({ id: t.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const totals = { L1: { pass: 0, fail: 0 }, L2: { pass: 0, fail: 0 }, L3: { pass: 0, fail: 0 } };
  const failFreq: Record<string, number> = {};
  for (const r of out) {
    if (!("byDifficulty" in r) || !r.byDifficulty) continue;
    for (const d of ["L1", "L2", "L3"] as const) {
      totals[d].pass += r.byDifficulty[d].pass;
      totals[d].fail += r.byDifficulty[d].fail;
    }
    for (const f of r.failures ?? []) {
      failFreq[f.probeId] = (failFreq[f.probeId] || 0) + 1;
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    paidInferenceCalls: 0,
    promotedToLegalTruth: 0,
    verificationStatus: "AGENT_REVIEWED_PROVISIONAL",
    challenge: "covenant-training-repetition",
    totals,
    failFrequency: failFreq,
    results: out,
  };
  const outDir = path.resolve("docs/product/covenant-intelligence-loop");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "latest-covenant-training.json"), JSON.stringify(payload, null, 2));
  writeFileSync(
    path.join(outDir, `covenant-training-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
    JSON.stringify(payload, null, 2),
  );
  console.log("\nTOTALS", JSON.stringify(totals));
  console.log("FAIL_FREQ", JSON.stringify(failFreq));
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
