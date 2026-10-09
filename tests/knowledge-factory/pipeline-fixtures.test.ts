import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CorpusStore } from "../../lib/knowledge-factory/store/corpus-store";
import { ingestFixtureDocument, finalizeCorpusIndex } from "../../lib/knowledge-factory/pipeline/run";
import { searchKnowledge, runExampleQueries, traverseKnowledgeGraph } from "../../lib/knowledge-factory/search/query";
import { auditCorpusQuality } from "../../lib/knowledge-factory/audit/corpus-quality";
import { buildReviewerDataset } from "../../lib/knowledge-factory/corpus/reviewer-dataset";
import { runIntegrityChecks, assertIdempotentSourceUpsert } from "../../lib/knowledge-factory/integrity/checks";
import { modelCorpusEconomics, summarizeCosts } from "../../lib/knowledge-factory/cost/ledger";
import { retrievePrecedentInterpretations } from "../../lib/knowledge-factory/reuse/precedent";
import { parseIndexExhibitRows, validateSourceUrl } from "../../lib/knowledge-factory/edgar/client";
import { RateLimiter } from "../../lib/knowledge-factory/edgar/rate-limit";

const FIXTURE_ROOT = path.resolve("tests/fixtures/unseen-packages");

function loadArticle(pkg: string, file: string): string {
  const p = path.join(FIXTURE_ROOT, pkg, file);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

describe("knowledge factory pipeline (fixtures)", () => {
  let store: CorpusStore;

  beforeEach(() => {
    const root = mkdtempSync(path.join(tmpdir(), "kf-corpus-"));
    store = new CorpusStore({
      root,
      bytes: path.join(root, "bytes"),
      manifests: path.join(root, "manifests"),
      checkpoints: path.join(root, "checkpoints"),
      cache: path.join(root, "cache"),
    });
  });

  it("ingests diversified fixture packages through deterministic pipeline", async () => {
    const packages: { sourceId: string; pkg: string; file: string; ticker: string; cik: string; title: string; maxChars?: number }[] = [
      { sourceId: "fixture:fwrg", pkg: "fwrg-2021-credit-agreement", file: "article-6-negative-covenants.txt", ticker: "FWRG", cik: "0001789940", title: "Credit Agreement — Negative Covenants" },
      { sourceId: "fixture:lsb", pkg: "lsb-2023-abl-credit-agreement", file: "article-6-negative-covenants.txt", ticker: "LXU", cik: "0000609371", title: "ABL Credit Agreement — Negative Covenants" },
      { sourceId: "fixture:chwy", pkg: "chwy-2026-credit-agreement", file: "extracted-text/doc-a-2026-06-23-credit-agreement.txt", ticker: "CHWY", cik: "0001766502", title: "Credit Agreement", maxChars: 180_000 },
      { sourceId: "fixture:gibraltar", pkg: "gibraltar-2026-credit-agreement", file: "extracted-text/credit-agreement.txt", ticker: "ROCK", cik: "0000920230", title: "Credit Agreement", maxChars: 180_000 },
      { sourceId: "fixture:conmed", pkg: "conmed-2025-credit-facility", file: "curated/base-credit-agreement-article-vii-negative-covenants.txt", ticker: "CNMD", cik: "0000816956", title: "Credit Agreement — Negative Covenants" },
      { sourceId: "fixture:conmed-amendment", pkg: "conmed-2025-credit-facility", file: "curated/first-omnibus-amendment-2026-curated.txt", ticker: "CNMD", cik: "0000816956", title: "First Omnibus Amendment" },
      { sourceId: "fixture:lsb-intercreditor", pkg: "lsb-2023-abl-credit-agreement", file: "intercreditor-joinder.txt", ticker: "LXU", cik: "0000609371", title: "Intercreditor Joinder" },
    ];

    let ingested = 0;
    for (const p of packages) {
      let text = loadArticle(p.pkg, p.file);
      if (!text) continue;
      if (p.maxChars) text = text.slice(0, p.maxChars);
      await ingestFixtureDocument(store, {
        sourceId: p.sourceId,
        issuerCik: p.cik,
        issuerTicker: p.ticker,
        title: p.title,
        text,
      });
      ingested += 1;
    }

    expect(ingested).toBeGreaterThanOrEqual(2);

    const stats = finalizeCorpusIndex(store);
    expect(stats.issuersDiscovered).toBeGreaterThanOrEqual(2);
    expect(stats.documentsDownloaded).toBe(ingested);
    expect(stats.structuralNodes).toBeGreaterThan(0);
    expect(stats.covenantCandidates).toBeGreaterThan(0);
    expect(stats.actualPaidSpendUsd).toBe(0);

    const sources = store.listSources();
    expect(sources.every((s) => s.representationLevel !== "CERTIFIED")).toBe(true);
    expect(sources.every((s) => s.representationLevel !== "REVIEWER_VERIFIED")).toBe(true);

    const hits = searchKnowledge(store, { covenantFamily: "INDEBTEDNESS", limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.note).toMatch(/not a generalized legal conclusion/i);

    const examples = runExampleQueries(store);
    expect(Object.keys(examples).length).toBeGreaterThanOrEqual(5);

    const audit = auditCorpusQuality(store);
    expect(audit.sourceCoverage.documents).toBe(ingested);
    expect(audit.missingOperativeAuthority).toBeGreaterThan(0);

    const reviewer = buildReviewerDataset(store, 10);
    expect(reviewer.length).toBeGreaterThan(0);
    expect(reviewer[0]!.reviewerDecisionFields.decision).toBeNull();
    expect(reviewer[0]!.proposedInterpretation).toBeNull();

    const integrity = runIntegrityChecks(store);
    expect(integrity.every((f) => f.check !== "deterministic_replay" || f.ok)).toBe(true);
    expect(assertIdempotentSourceUpsert(store, sources[0]!.sourceId)).toBe(true);

    const costs = summarizeCosts(store.readCostLedger());
    expect(costs.actualPaidUsd).toBe(0);

    const economics = modelCorpusEconomics({
      storageBytes: 500_000,
      parseMs: costs.parsingMs / Math.max(1, ingested),
      estimatedModelTokensIfUsed: 2000,
      estimatedModelUsdPer1kTokens: 0.003,
      reviewerMinutes: 15,
      reviewerUsdPerHour: 250,
    });
    expect(economics["1000"]!.documents).toBe(1000);

    const candidates = sources.flatMap((s) => store.loadCandidates(s.sourceId));
    if (candidates.length >= 2) {
      const precedents = retrievePrecedentInterpretations(candidates[0]!, candidates.slice(1));
      for (const p of precedents) {
        expect(p.replacesVerification).toBe(false);
      }
    }

    if (candidates[0]) {
      const graph = traverseKnowledgeGraph(store, candidates[0]!.candidateId);
      expect(graph.candidate?.candidateId).toBe(candidates[0]!.candidateId);
      expect(Array.isArray(graph.missingEdges)).toBe(true);
    }
  }, 120000);
});

describe("edgar helpers", () => {
  it("parses exhibit index tables", () => {
    const html = `
      <table class="tableFile">
        <tr><td>1</td><td>Credit Agreement</td><td><a href="/Archives/edgar/data/1/a/ex101.htm">ex101.htm</a></td><td>EX-10.1</td><td>1234</td></tr>
        <tr><td>2</td><td>Employment Agreement</td><td><a href="/Archives/edgar/data/1/a/ex102.htm">ex102.htm</a></td><td>EX-10.2</td><td>100</td></tr>
      </table>
    `;
    const rows = parseIndexExhibitRows(html);
    expect(rows.length).toBe(2);
    expect(rows[0]!.description).toMatch(/Credit Agreement/);
  });

  it("validates SEC source URLs only", () => {
    expect(validateSourceUrl("https://www.sec.gov/Archives/edgar/data/1/x.htm")).toBe(true);
    expect(validateSourceUrl("https://evil.example/x.htm")).toBe(false);
  });

  it("rate limiter spaces requests", async () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000, minIntervalMs: 20 });
    const t0 = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(15);
  });
});
