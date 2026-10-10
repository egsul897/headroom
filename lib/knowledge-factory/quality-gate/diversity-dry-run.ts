/**
 * Diversity discovery dry-run for ABL / intercreditor / guarantee coverage.
 * May hit SEC (read-only discovery) but performs **no Neon writes**.
 */

import path from "node:path";
import { prisma } from "../../prisma";
import { EdgarKnowledgeClient } from "../edgar/client";
import { CorpusStore, defaultCorpusPaths } from "../store/corpus-store";
import { classifyDebtDocument } from "../classify/debt-document";
import { scoreExhibitForTargets } from "../continuous/target-issuers";

const DIVERSITY_TICKERS: Array<{
  ticker: string;
  priorityClasses: string[];
  rationale: string;
}> = [
  { ticker: "GPK", priorityClasses: ["ABL_AGREEMENT", "CREDIT_AGREEMENT"], rationale: "packaging ABL" },
  { ticker: "AEO", priorityClasses: ["ABL_AGREEMENT", "CREDIT_AGREEMENT"], rationale: "retail ABL" },
  { ticker: "CHEF", priorityClasses: ["ABL_AGREEMENT", "CREDIT_AGREEMENT"], rationale: "foodservice ABL-adjacent" },
  { ticker: "CAR", priorityClasses: ["ABL_AGREEMENT", "CREDIT_AGREEMENT"], rationale: "fleet ABS/ABL-style" },
  { ticker: "HTZ", priorityClasses: ["ABL_AGREEMENT", "CREDIT_AGREEMENT", "INDENTURE"], rationale: "rental ABL/notes" },
  { ticker: "MGM", priorityClasses: ["INTERCREDITOR_AGREEMENT", "CREDIT_AGREEMENT"], rationale: "gaming intercreditor" },
  { ticker: "CZR", priorityClasses: ["INTERCREDITOR_AGREEMENT", "CREDIT_AGREEMENT"], rationale: "gaming secured package" },
  { ticker: "WYNN", priorityClasses: ["INTERCREDITOR_AGREEMENT", "INDENTURE"], rationale: "gaming lien priority" },
  { ticker: "BALL", priorityClasses: ["INTERCREDITOR_AGREEMENT", "CREDIT_AGREEMENT", "GUARANTEE_AGREEMENT"], rationale: "HY package" },
  { ticker: "URI", priorityClasses: ["GUARANTEE_AGREEMENT", "SECURITY_AGREEMENT", "CREDIT_AGREEMENT"], rationale: "guarantee/collateral exhibits" },
  { ticker: "TDG", priorityClasses: ["GUARANTEE_AGREEMENT", "INTERCREDITOR_AGREEMENT", "CREDIT_AGREEMENT"], rationale: "aerospace secured" },
  { ticker: "GT", priorityClasses: ["INTERCREDITOR_AGREEMENT", "CREDIT_AGREEMENT"], rationale: "second-lien package" },
];

export interface DiversityCandidate {
  ticker: string;
  sourceId: string;
  title: string;
  exhibitType: string;
  predictedClass: string;
  sizeBytes: number | null;
  score: number;
  alreadyInNeon: boolean;
  rationale: string;
}

export async function runDiversityDryRun(params?: {
  filingLimit?: number;
  maxPerIssuer?: number;
  network?: boolean;
}): Promise<{
  schema: "kf-diversity-dry-run.v1";
  generatedAt: string;
  neonWrites: false;
  network: boolean;
  baselineSparse: Record<string, number>;
  candidates: DiversityCandidate[];
  summary: {
    discoveredPromising: number;
    notYetInNeon: number;
    byPredictedClass: Record<string, number>;
  };
  note: string;
}> {
  const sparseClasses = [
    "ABL_AGREEMENT",
    "INTERCREDITOR_AGREEMENT",
    "GUARANTEE_AGREEMENT",
    "SECURITY_AGREEMENT",
    "REVOLVING_CREDIT_AGREEMENT",
  ] as const;
  const baselineSparse: Record<string, number> = {};
  for (const c of sparseClasses) {
    baselineSparse[c] = await prisma.knowledgeSource.count({
      where: { documentClass: c as never, usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" },
    });
  }

  const existing = new Set(
    (
      await prisma.knowledgeSource.findMany({
        select: { sourceId: true },
      })
    ).map((r) => r.sourceId),
  );

  const candidates: DiversityCandidate[] = [];
  const network = params?.network ?? true;

  if (network) {
    process.env.HEADROOM_SEC_FETCH_OWNER = process.env.HEADROOM_SEC_FETCH_OWNER || "WS-CKF";
    const store = new CorpusStore(defaultCorpusPaths());
    const client = new EdgarKnowledgeClient({
      cacheDir: path.join(store.paths.cache, "sec"),
      logDir: path.join(store.paths.root, "logs"),
      requireDebtSignal: false,
    });

    for (const t of DIVERSITY_TICKERS) {
      try {
        const issuer = await client.resolveCikForTicker(t.ticker);
        const docs = await client.discoverForCik(issuer.cik, {
          filingLimit: params?.filingLimit ?? 120,
        });
        const ranked = docs
          .map((d) => {
            const title = d.exhibit.description || d.exhibit.filename;
            const pre = classifyDebtDocument({
              title,
              description: d.exhibit.description,
              exhibitType: d.exhibit.exhibitType,
              filename: d.exhibit.filename,
            });
            let score = scoreExhibitForTargets(title, d.exhibit.filename, t.priorityClasses);
            const typ = (d.exhibit.exhibitType || "").toUpperCase();
            if (/intercreditor/i.test(title)) score += 15;
            if (/\b(?:guarantee|guaranty)\b/i.test(title)) score += 12;
            if (/\b(?:asset[- ]based|abl|borrowing base)\b/i.test(title)) score += 15;
            if (/\bsecurity agreement\b/i.test(title)) score += 10;
            if (/^EX-99/i.test(typ) && score < 12) score = -1;
            return { d, title, pre, score };
          })
          .filter((x) => x.score >= 8)
          .sort((a, b) => b.score - a.score)
          .slice(0, params?.maxPerIssuer ?? 4);

        for (const x of ranked) {
          candidates.push({
            ticker: t.ticker,
            sourceId: x.d.sourceId,
            title: x.title.slice(0, 160),
            exhibitType: x.d.exhibit.exhibitType,
            predictedClass: x.pre.documentClass,
            sizeBytes: x.d.exhibit.sizeBytes ?? null,
            score: x.score,
            alreadyInNeon: existing.has(x.d.sourceId),
            rationale: t.rationale,
          });
        }
      } catch (e) {
        candidates.push({
          ticker: t.ticker,
          sourceId: `ERROR:${t.ticker}`,
          title: e instanceof Error ? e.message : String(e),
          exhibitType: "",
          predictedClass: "UNKNOWN",
          sizeBytes: null,
          score: -1,
          alreadyInNeon: false,
          rationale: `discovery_error:${t.rationale}`,
        });
      }
    }
  }

  const promising = candidates.filter((c) => c.score >= 8);
  const byPredictedClass: Record<string, number> = {};
  for (const c of promising) {
    byPredictedClass[c.predictedClass] = (byPredictedClass[c.predictedClass] ?? 0) + 1;
  }

  return {
    schema: "kf-diversity-dry-run.v1",
    generatedAt: new Date().toISOString(),
    neonWrites: false,
    network,
    baselineSparse,
    candidates,
    summary: {
      discoveredPromising: promising.length,
      notYetInNeon: promising.filter((c) => !c.alreadyInNeon).length,
      byPredictedClass,
    },
    note: "Dry-run only — no BYTEA/KnowledgeSource writes. Next live batch requires explicit KF_MASS_PRECEDENT_LIVE_WRITE authorization.",
  };
}
