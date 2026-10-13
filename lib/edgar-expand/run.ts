/**
 * EDGAR corpus expansion.
 *
 * Discovers with lib/edgar-historical-backfill (free SEC EDGAR, identifying
 * User-Agent, <=10 req/s), fetches exhibit bytes, and writes them under
 * .local-knowledge-corpus/edgar-expand. The HTTPS precedent loader imports
 * manifest.jsonl. Failed fetches are UNRESOLVED with a reason — never a
 * fabricated body. Knife River stays excluded.
 *
 * `sp1500` means up to 1500 distinct registrants from SEC company_tickers.json
 * (free EDGAR universe). It is not a licensed S&P 1500 constituent list.
 * Exhibit filter for that universe: EX-4 / EX-10 credit agreements and indentures.
 *
 * Historical pilot-100-v2 (ephemeral, not in git) found 868 distinct agreements
 * and queued 149 fetchable. This command re-discovers and attempts every
 * distinct non-UNKNOWN agreement, not only that ranked queue.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { SecAccessCoordinator } from "../edgar-historical-backfill/sec-access";
import { runHistoricalDiscovery } from "../edgar-historical-backfill/engine";
import { selectIssuerUniverse } from "../edgar-historical-backfill/submissions";
import type { ExhibitRef, IssuerManifest, IssuerRef } from "../edgar-historical-backfill/types";
import { isReservedBlindIssuer } from "./blind";
import { buildExpandTargets, type ExpandTarget, type ExpandUniverse } from "./targets";

export const EDGAR_EXPAND_MAX_RPS = 10;
export const HISTORICAL_PILOT_DISTINCT_AGREEMENTS = 868;
export const HISTORICAL_PILOT_QUEUED_FETCHABLE = 149;

export type EdgarExpandCheckpoint = {
  version: 1;
  universe: ExpandUniverse;
  updatedAt: string;
  discoveryComplete: boolean;
  completedTargetIds: string[];
  fetched: Array<{
    targetId: string;
    sourceId: string;
    sha256: string;
    byteSize: number;
    localPath: string;
    accessionNumber: string;
    exhibitFilename: string;
    issuerCik: string;
    issuerTicker: string | null;
    issuerName: string | null;
    sourceUrl: string;
    filingDate: string;
    formType: string;
    documentTitle: string;
    documentClass: string;
    agreementIdentityKey: string;
  }>;
  unresolved: Array<{
    targetId: string;
    reason: string;
    accessionNumber: string;
    filename: string;
    url: string | null;
    cik: string;
    ticker?: string;
  }>;
};

export type EdgarExpandResult = {
  ok: boolean;
  universe: ExpandUniverse;
  universeNote: string;
  historicalPilot: { distinctAgreements: number; queuedFetchable: number; note: string };
  outDir: string;
  distinctTargets: number;
  fetchAttempts: number;
  fetched: number;
  unresolved: number;
  excludedBlind: number;
  resumedSkipped: number;
  secRequests: number;
  maxRequestsPerSecond: number;
  import: "deferred" | "ran" | "skipped";
  countsByReason: Record<string, number>;
};

function emptyCheckpoint(universe: ExpandUniverse): EdgarExpandCheckpoint {
  return {
    version: 1,
    universe,
    updatedAt: new Date().toISOString(),
    discoveryComplete: false,
    completedTargetIds: [],
    fetched: [],
    unresolved: [],
  };
}

function readCheckpoint(file: string, universe: ExpandUniverse): EdgarExpandCheckpoint {
  if (!existsSync(file)) return emptyCheckpoint(universe);
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as EdgarExpandCheckpoint;
    if (parsed.version !== 1 || parsed.universe !== universe) return emptyCheckpoint(universe);
    return parsed;
  } catch {
    return emptyCheckpoint(universe);
  }
}

function writeCheckpoint(file: string, cp: EdgarExpandCheckpoint): void {
  cp.updatedAt = new Date().toISOString();
  writeFileSync(file, `${JSON.stringify(cp, null, 2)}\n`);
}

function rewriteSidecars(outDir: string, cp: EdgarExpandCheckpoint): void {
  const manifest = cp.fetched
    .map((row) => JSON.stringify(row))
    .join("\n");
  writeFileSync(join(outDir, "manifest.jsonl"), manifest.length ? `${manifest}\n` : "");
  const unresolved = cp.unresolved.map((row) => JSON.stringify({ status: "UNRESOLVED", ...row })).join("\n");
  writeFileSync(join(outDir, "unresolved.jsonl"), unresolved.length ? `${unresolved}\n` : "");
}

function safeSeg(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+/, "").slice(0, 160) || "file";
}

function looksLikeSecBlock(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 800)).toString("utf8");
  return /Undeclared Automated Tool|request rate threshold exceeded/i.test(head);
}

export function isTransientFetchFailure(reason: string): boolean {
  return reason === "NETWORK_ERROR" || reason === "SEC_BLOCKED" || /^HTTP_429$/.test(reason) || /^HTTP_5\d\d$/.test(reason);
}

export type LoadExhibits = () => Promise<{ exhibits: ExhibitRef[]; issuers: IssuerRef[] }>;

export async function runEdgarExpand(opts: {
  repoRoot?: string;
  universe?: ExpandUniverse;
  resume?: boolean;
  maxIssuers?: number;
  maxIndexesPerIssuer?: number;
  maxIbrIndexFetches?: number;
  /** Cap on exhibit-body downloads this invocation. Unresolved-without-URL do not count. */
  maxFetches?: number;
  maxRequestsPerSecond?: number;
  outDir?: string;
  sec?: SecAccessCoordinator;
  loadExhibits?: LoadExhibits;
  env?: Record<string, string | undefined>;
}): Promise<EdgarExpandResult> {
  const repoRoot = opts.repoRoot ?? process.cwd();
  const universe = opts.universe ?? "pilot-100";
  const requestedRps = opts.maxRequestsPerSecond ?? 8;
  if (requestedRps > EDGAR_EXPAND_MAX_RPS) {
    throw new Error(`kf:edgar-expand refuses maxRequestsPerSecond=${requestedRps}. SEC fair-access cap is ${EDGAR_EXPAND_MAX_RPS}.`);
  }
  const outDir = opts.outDir ?? join(repoRoot, ".local-knowledge-corpus/edgar-expand");
  mkdirSync(outDir, { recursive: true });
  const cpFile = join(outDir, "checkpoint.json");
  const checkpoint = opts.resume ? readCheckpoint(cpFile, universe) : emptyCheckpoint(universe);
  const done = new Set(checkpoint.completedTargetIds);

  const sec =
    opts.sec ??
    new SecAccessCoordinator({
      role: "WS-CKF",
      maxRequestsPerSecond: requestedRps,
      maxConcurrency: 2,
      cacheDir: join(outDir, ".sec-cache"),
      env: opts.env ?? process.env,
    });

  let exhibits: ExhibitRef[] = [];
  let issuers: IssuerRef[] = [];
  if (opts.loadExhibits) {
    const loaded = await opts.loadExhibits();
    exhibits = loaded.exhibits;
    issuers = loaded.issuers.filter((i) => !isReservedBlindIssuer(i));
  } else {
    const count = universe === "sp1500" ? (opts.maxIssuers ?? 1500) : (opts.maxIssuers ?? 100);
    const selected = await selectIssuerUniverse(sec, count + 15);
    issuers = selected.filter((i) => !isReservedBlindIssuer(i)).slice(0, count);
    const discoveryDir = join(outDir, "discovery");
    await runHistoricalDiscovery({
      runDir: discoveryDir,
      scale: universe === "sp1500" ? "broad" : "pilot-100",
      issuers,
      maxIndexesPerIssuer: opts.maxIndexesPerIssuer ?? (universe === "sp1500" ? 6 : 12),
      resolveIbrIndexes: true,
      maxIbrIndexFetches: opts.maxIbrIndexFetches ?? 60,
      resume: Boolean(opts.resume),
      sec,
      onProgress: (msg) => {
        process.stdout.write(`${msg}\n`);
      },
    });
    const loaded = readManifestExhibits(discoveryDir);
    exhibits = loaded.exhibits;
    if (loaded.issuers.length) issuers = loaded.issuers.filter((i) => !isReservedBlindIssuer(i));
    checkpoint.discoveryComplete = true;
  }

  const targets = buildExpandTargets({ exhibits, issuers, universe });
  let fetchAttempts = 0;
  let resumedSkipped = 0;
  const maxFetches = opts.maxFetches;

  for (const target of targets) {
    if (done.has(target.targetId)) {
      resumedSkipped += 1;
      continue;
    }
    const budgetSpent = typeof maxFetches === "number" && fetchAttempts >= maxFetches;
    if (target.disposition === "FETCH" && target.url && budgetSpent) {
      // Leave the body for a later resume. Still record non-fetch targets below.
    } else if (target.disposition !== "FETCH" || !target.url) {
      rememberUnresolved(checkpoint, target, target.reason);
      done.add(target.targetId);
    } else {
      fetchAttempts += 1;
      try {
        const res = await sec.getBytes(target.url);
        if (res.status === 200 && looksLikeSecBlock(res.bytes)) {
          rememberUnresolved(checkpoint, target, "SEC_BLOCKED");
        } else if (res.status !== 200) {
          const reason = `HTTP_${res.status}`;
          rememberUnresolved(checkpoint, target, reason);
          if (!isTransientFetchFailure(reason)) done.add(target.targetId);
        } else if (res.bytes.byteLength === 0) {
          rememberUnresolved(checkpoint, target, "EMPTY_BODY");
          done.add(target.targetId);
        } else {
          const sha256 = createHash("sha256").update(res.bytes).digest("hex");
          const relDir = join("bytes", safeSeg(target.cik), safeSeg(target.accessionNumber));
          const filename = safeSeg(target.filename);
          const absDir = join(outDir, relDir);
          mkdirSync(absDir, { recursive: true });
          const abs = join(absDir, filename);
          writeFileSync(abs, res.bytes);
          const localPath = relative(repoRoot, abs).split("\\").join("/");
          const sourceId = `edgar:${target.accessionNumber}:${target.filename}`;
          checkpoint.fetched = checkpoint.fetched.filter((row) => row.targetId !== target.targetId);
          checkpoint.fetched.push({
            targetId: target.targetId,
            sourceId,
            sha256,
            byteSize: res.bytes.byteLength,
            localPath,
            accessionNumber: target.accessionNumber,
            exhibitFilename: target.filename,
            issuerCik: target.cik,
            issuerTicker: target.ticker ?? null,
            issuerName: target.issuerName ?? null,
            sourceUrl: target.url,
            filingDate: target.filingDate,
            formType: target.form,
            documentTitle: target.description || target.filename,
            documentClass: target.documentKind,
            agreementIdentityKey: target.agreementIdentityKey,
          });
          checkpoint.unresolved = checkpoint.unresolved.filter((row) => row.targetId !== target.targetId);
          done.add(target.targetId);
        }
      } catch (err) {
        const message = (err instanceof Error ? err.message : String(err)).slice(0, 180);
        rememberUnresolved(checkpoint, target, `NETWORK_ERROR: ${message}`);
      }
    }
    checkpoint.completedTargetIds = [...done];
    writeCheckpoint(cpFile, checkpoint);
    rewriteSidecars(outDir, checkpoint);
  }

  checkpoint.completedTargetIds = [...done];
  checkpoint.discoveryComplete = true;
  writeCheckpoint(cpFile, checkpoint);
  rewriteSidecars(outDir, checkpoint);

  const countsByReason: Record<string, number> = {};
  for (const row of checkpoint.unresolved) {
    const key = row.reason.split(":")[0] ?? row.reason;
    countsByReason[key] = (countsByReason[key] ?? 0) + 1;
  }
  const excludedBlind = checkpoint.unresolved.filter((r) => r.reason === "KNIFE_RIVER_RESERVED_BLIND").length;

  const result: EdgarExpandResult = {
    ok: true,
    universe,
    universeNote:
      universe === "sp1500"
        ? "Up to 1500 distinct SEC registrants from company_tickers.json (free EDGAR). Not a licensed S&P 1500 constituent list. EX-4/EX-10 credit agreement and indenture exhibits only."
        : "pilot-100 re-discovers the 100-issuer historical universe and attempts every distinct non-UNKNOWN agreement, including those the ranked queue left unfetched.",
    historicalPilot: {
      distinctAgreements: HISTORICAL_PILOT_DISTINCT_AGREEMENTS,
      queuedFetchable: HISTORICAL_PILOT_QUEUED_FETCHABLE,
      note: "pilot-100-v2 artifacts lived under data/edgar-historical-backfill (gitignored). This command re-discovers; it does not replay a missing queue file.",
    },
    outDir,
    distinctTargets: targets.length,
    fetchAttempts,
    fetched: checkpoint.fetched.length,
    unresolved: checkpoint.unresolved.length,
    excludedBlind,
    resumedSkipped,
    secRequests: sec.getRequestCount(),
    maxRequestsPerSecond: requestedRps,
    import: "deferred",
    countsByReason,
  };
  writeFileSync(join(outDir, "expand-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

function rememberUnresolved(cp: EdgarExpandCheckpoint, target: ExpandTarget, reason: string): void {
  cp.unresolved = cp.unresolved.filter((r) => r.targetId !== target.targetId);
  cp.unresolved.push({
    targetId: target.targetId,
    reason,
    accessionNumber: target.accessionNumber,
    filename: target.filename,
    url: target.url,
    cik: target.cik,
    ticker: target.ticker,
  });
}

export function readManifestExhibits(runDir: string): { exhibits: ExhibitRef[]; issuers: IssuerRef[] } {
  const dir = join(runDir, "manifests");
  if (!existsSync(dir)) return { exhibits: [], issuers: [] };
  const exhibits: ExhibitRef[] = [];
  const issuers: IssuerRef[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name.endsWith(".duplicates.json")) continue;
    const manifest = JSON.parse(readFileSync(join(dir, name), "utf8")) as IssuerManifest;
    if (manifest.issuer) issuers.push(manifest.issuer);
    if (Array.isArray(manifest.exhibits)) exhibits.push(...manifest.exhibits);
  }
  return { exhibits, issuers };
}
