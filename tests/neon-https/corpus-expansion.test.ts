import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { summarizeCorpusPlan } from "../../lib/neon-https/corpus-catalog";
import { importCorpusExpansion } from "../../lib/neon-https/corpus-import";
import { listPrismaMigrations } from "../../lib/neon-https/migrate-all";
import { AUTHORITY_STATUS } from "../../lib/neon-https/constants";
import type { NeonHttpsExecutor } from "../../lib/covenant-learning-factory/store/neon-transport";

const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "corpus-exp-"));
  dirs.push(dir);
  return dir;
}

function sha(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

function write(repo: string, rel: string, body: string | Buffer): void {
  const abs = path.join(repo, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}

function fakeExecutor() {
  const statements: { sql: string; params?: unknown[] }[] = [];
  const executor: NeonHttpsExecutor = {
    async execute(sql, params) {
      statements.push({ sql, params });
      return [];
    },
  };
  return { executor, statements };
}

describe("corpus expansion catalog", () => {
  it("dedupes by sha256 and accession and skips hash mismatches and Knife River", () => {
    const repo = tempRepo();
    const body = Buffer.from("<html>credit agreement bytes</html>");
    const hash = sha(body);
    const other = Buffer.from("<html>different agreement</html>");
    const otherHash = sha(other);
    write(repo, "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/a/source.html", body);
    write(repo, "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/b/source.html", body);
    write(repo, "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/c/source.html", other);
    write(repo, "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/bad/source.html", other);
    write(repo, "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/knf/source.html", Buffer.from("knife"));
    write(
      repo,
      "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/acquisition-manifest.json",
      JSON.stringify({
        documents: [
          {
            docId: "a",
            ticker: "ACME",
            issuer: "Acme",
            cik: "0000000001",
            accession: "0000000001-24-000001",
            filename: "ex10.htm",
            sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/000000000124000001/ex10.htm",
            relativeDir: "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/a",
            bodySha256: hash,
            filingDate: "2024-01-02",
            form: "8-K",
          },
          {
            docId: "b",
            ticker: "ACME",
            issuer: "Acme copy",
            cik: "0000000001",
            accession: "0000000001-24-000002",
            filename: "ex10b.htm",
            sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/000000000124000002/ex10b.htm",
            relativeDir: "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/b",
            bodySha256: hash,
          },
          {
            docId: "c",
            ticker: "BETA",
            issuer: "Beta",
            cik: "0000000002",
            accession: "0000000001-24-000001",
            filename: "ex10.htm",
            sourceUrl: "https://www.sec.gov/Archives/edgar/data/2/000000000124000001/ex10.htm",
            relativeDir: "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/c",
            bodySha256: otherHash,
          },
          {
            docId: "bad",
            ticker: "GAMMA",
            issuer: "Gamma",
            cik: "0000000003",
            accession: "0000000003-24-000003",
            filename: "bad.htm",
            sourceUrl: "https://www.sec.gov/Archives/edgar/data/3/000000000324000003/bad.htm",
            relativeDir: "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/bad",
            bodySha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
          {
            docId: "knf",
            ticker: "KNF",
            issuer: "Knife River Corporation",
            cik: "0001955520",
            accession: "0001955520-24-000001",
            filename: "knf-ex10.htm",
            sourceUrl: "https://www.sec.gov/Archives/edgar/data/1955520/000195552024000001/knf-ex10.htm",
            relativeDir: "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions/knf",
            bodySha256: sha(Buffer.from("knife")),
          },
        ],
      }),
    );
    write(
      repo,
      "docs/covenant-basket-capacity-formula-library/phase-4/export/phase4-import-records.jsonl",
      `${JSON.stringify({ stableId: "formula-1", contentHash: "b".repeat(64), instrumentId: "acme" })}\n${JSON.stringify({ stableId: "formula-1", contentHash: "b".repeat(64), instrumentId: "acme" })}\n`,
    );

    const plan = summarizeCorpusPlan(repo);
    const edgar = plan.byCorpus["basket-phase2-edgar"]!;
    expect(edgar.wouldInsert).toBe(1);
    expect(edgar.dedupedSha256).toBe(1);
    expect(edgar.hashConflicts).toBeGreaterThanOrEqual(2);
    expect(edgar.excludedBlind).toBe(1);
    expect(plan.byCorpus["basket-phase4-export"]!.wouldInsert).toBe(1);
    expect(plan.byCorpus["basket-phase4-export"]!.dedupedContentHash).toBe(1);
    expect(plan.knowledgeSourcesWouldAdd).toBe(1);
  });

  it("live import upserts COMPUTED_NOT_CERTIFIED rows and does not touch ContractRule", async () => {
    const repo = tempRepo();
    const body = Buffer.from("bytes-for-neon");
    const hash = sha(body);
    write(repo, "docs/financial-definitions-precedent/source.txt", body);
    write(
      repo,
      "docs/financial-definitions-precedent/17-source-document-registry.json",
      JSON.stringify({
        documents: [
          {
            sourceDocId: "ACME-CA",
            path: "docs/financial-definitions-precedent/source.txt",
            fileSha256: hash,
          },
        ],
      }),
    );
    write(
      repo,
      "docs/financial-definitions-precedent/10-dataset-export.json",
      JSON.stringify({ records: [{ id: "def-1", termLabel: "EBITDA", sourceId: "ACME-CA" }] }),
    );
    write(
      repo,
      "docs/amendment-chain-research/knowledge-factory-export/amendment-chains-export.json",
      JSON.stringify({
        documents: [],
        parentChildAuthorityLinks: [
          {
            sourceId: "edgar:0000000001-24-000001:child.htm",
            targetId: "edgar:0000000001-24-000001:parent.htm",
            kind: "AGREEMENT_AMENDMENT",
            evidenceStatus: "DISCOVERED",
          },
        ],
      }),
    );

    const { executor, statements } = fakeExecutor();
    const counts: Record<string, number> = {};
    const errors: Array<{ stage: string; id: string; error: string }> = [];
    const prev = process.env.KF_MASS_PRECEDENT_LIVE_WRITE;
    process.env.KF_MASS_PRECEDENT_LIVE_WRITE = "I_AUTHORIZE_NEON_BULK_WRITE";
    try {
      await importCorpusExpansion(executor, { repoRoot: repo, live: true, counts, errors });
    } finally {
      if (prev === undefined) delete process.env.KF_MASS_PRECEDENT_LIVE_WRITE;
      else process.env.KF_MASS_PRECEDENT_LIVE_WRITE = prev;
    }
    expect(errors).toEqual([]);
    expect(counts["corpus:fdp-sources:insert"]).toBe(1);
    expect(counts["corpus:fdp-records:insert"]).toBeGreaterThanOrEqual(1);
    expect(counts["corpus:amendment-chain-relationships:insert"]).toBe(1);
    const blob = JSON.stringify(statements);
    expect(blob).toContain("COMPUTED_NOT_CERTIFIED");
    expect(blob).not.toMatch(/ContractRule/i);
    expect(AUTHORITY_STATUS).toBe("COMPUTED_NOT_CERTIFIED");
    const byteInsert = statements.find((s) => /document_byte_objects/i.test(s.sql) && /INSERT/i.test(s.sql));
    expect(byteInsert?.params?.[1]).toBe(hash);
  });

  it("registers the additive corpus-records migration", () => {
    const migrations = listPrismaMigrations();
    const hit = migrations.find((m) => m.name === "20261014010000_kf_precedent_corpus_records");
    expect(hit).toBeTruthy();
    expect(hit!.sql).toMatch(/kf_precedent_corpus_records/);
    expect(hit!.sql).not.toMatch(/^\s*DELETE\b/im);
  });
});

describe("real in-repo corpus plan", () => {
  it("counts unloaded corpora without a database", { timeout: 120_000 }, () => {
    const plan = summarizeCorpusPlan(process.cwd());
    const edgar = plan.byCorpus["basket-phase2-edgar"];
    expect(edgar?.wouldInsert).toBeGreaterThanOrEqual(10);
    expect(edgar?.excludedBlind ?? 0).toBe(0);
    expect(plan.byCorpus["basket-phase4-export"]?.wouldInsert).toBeGreaterThanOrEqual(1500);
    expect(plan.byCorpus["basket-phase3-export"]?.wouldInsert).toBeGreaterThanOrEqual(1000);
    expect(plan.byCorpus["fdp-sources"]?.wouldInsert).toBeGreaterThanOrEqual(8);
    expect((plan.byCorpus["amendment-chain-documents"]?.wouldInsert ?? 0) + (plan.byCorpus["amendment-chain-documents"]?.metadataOnly ?? 0)).toBeGreaterThan(10);
    expect(plan.byCorpus["amendment-chain-relationships"]?.relationships).toBeGreaterThan(10);
    expect(plan.byCorpus["precedent-comparison"]?.wouldInsert).toBeGreaterThan(0);
    expect(plan.byCorpus["neon-flywheel"]?.wouldInsert).toBeGreaterThan(0);
    expect(plan.knowledgeSourcesWouldAdd).toBeGreaterThanOrEqual(20);
    expect(plan.corpusRecordsWouldAdd).toBeGreaterThan(4000);
    const blind = Object.values(plan.byCorpus).reduce((n, b) => n + b.excludedBlind, 0);
    expect(blind).toBe(0);
  });
});
