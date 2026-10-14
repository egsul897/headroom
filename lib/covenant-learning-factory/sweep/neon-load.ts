/**
 * HTTPS Neon readers for clf:sweep. Batched, cursor-resumable.
 * Never writes ContractRule / certification.
 */

import type { NeonHttpsExecutor } from "../store/neon-transport";
import type { CandidateRow, PrecedentSourceRow } from "./build-package";
import type { PrecedentCandidate, PrecedentCondition, PrecedentDefinition } from "./self-check";

export type SweepPhase = "sources" | "proposals" | "finalize";

/** Durable sweep checkpoint — survives mid-epoch kills. */
export interface SweepCursor {
  afterSourceId: string;
  epoch: number;
  updatedAt: string;
  phase: SweepPhase;
  /** True once every knowledge_source for this epoch has been processed. */
  sourcesComplete: boolean;
  /** Next candidate index to evaluate in the proposals phase. */
  candidateIndex: number;
  candidatesTotal: number;
  acceptedCount: number;
  rejectedCount: number;
  /** Ruleset version being built via vN.partial.jsonl. */
  nextRulesetVersion: number;
  epochRunId: string;
  status: string;
}

const BATCH_KEY = "clf-sweep";
const STAGE = "sources";

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asPhase(v: unknown): SweepPhase {
  if (v === "proposals" || v === "finalize" || v === "sources") return v;
  return "sources";
}

function defaultCursor(partial?: Partial<SweepCursor>): SweepCursor {
  return {
    afterSourceId: "",
    epoch: 1,
    updatedAt: new Date().toISOString(),
    phase: "sources",
    sourcesComplete: false,
    candidateIndex: 0,
    candidatesTotal: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    nextRulesetVersion: 1,
    epochRunId: "",
    status: "IN_PROGRESS",
    ...partial,
  };
}

function familyFromJson(familiesJson: unknown): string | null {
  if (Array.isArray(familiesJson) && typeof familiesJson[0] === "string") return familiesJson[0];
  if (typeof familiesJson === "string") {
    try {
      const parsed = JSON.parse(familiesJson) as unknown;
      return familyFromJson(parsed);
    } catch {
      return familiesJson;
    }
  }
  if (familiesJson && typeof familiesJson === "object") {
    const o = familiesJson as Record<string, unknown>;
    if (typeof o.primary === "string") return o.primary;
    if (Array.isArray(o.families) && typeof o.families[0] === "string") return o.families[0];
  }
  return null;
}

export async function loadSweepCursor(executor: NeonHttpsExecutor): Promise<SweepCursor | null> {
  try {
    const rows = await executor.execute(
      `SELECT cursor, status, "countsJson", "updatedAt"
       FROM kf_precedent_import_checkpoints
       WHERE "batchKey" = $1 AND stage = $2
       LIMIT 1`,
      [BATCH_KEY, STAGE],
    );
    const row = rows[0];
    if (!row) return null;
    const counts = (row.countsJson ?? row.countsjson) as Record<string, unknown> | null;
    const status = asString(row.status) || "IN_PROGRESS";
    const afterSourceId = asString(row.cursor ?? counts?.afterSourceId ?? "");
    const epoch = asNumber(counts?.epoch, 1);
    // Legacy checkpoints (pre-phase field): a non-empty cursor with EPOCH_COMPLETE,
    // or cursor past the last source, must not strand resume at "0 sources".
    let phase = asPhase(counts?.phase);
    let sourcesComplete = Boolean(counts?.sourcesComplete);
    if (status === "EPOCH_COMPLETE") {
      phase = "finalize";
      sourcesComplete = true;
    } else if (status === "PROPOSALS" || counts?.phase === "proposals") {
      phase = "proposals";
      sourcesComplete = true;
    } else if (!counts?.phase && afterSourceId && !sourcesComplete) {
      // Ambiguous legacy: keep sources; runner promotes to proposals if fetch returns 0.
      phase = "sources";
    }
    return defaultCursor({
      afterSourceId,
      epoch: epoch > 0 ? epoch : 1,
      updatedAt: asString(row.updatedAt ?? row.updatedat) || new Date().toISOString(),
      phase,
      sourcesComplete,
      candidateIndex: asNumber(counts?.candidateIndex, 0),
      candidatesTotal: asNumber(counts?.candidatesTotal, 0),
      acceptedCount: asNumber(counts?.acceptedCount, 0),
      rejectedCount: asNumber(counts?.rejectedCount, 0),
      nextRulesetVersion: asNumber(counts?.nextRulesetVersion, epoch > 0 ? epoch : 1),
      epochRunId: asString(counts?.epochRunId),
      status,
    });
  } catch {
    return null;
  }
}

export async function saveSweepCursor(executor: NeonHttpsExecutor, cursor: SweepCursor): Promise<void> {
  const now = new Date().toISOString();
  const status =
    cursor.status ||
    (cursor.phase === "finalize"
      ? "EPOCH_COMPLETE"
      : cursor.phase === "proposals"
        ? "PROPOSALS"
        : "IN_PROGRESS");
  const payload: SweepCursor = { ...cursor, updatedAt: now, status };
  await executor.execute(
    `INSERT INTO kf_precedent_import_checkpoints
       ("batchKey", stage, cursor, status, "countsJson", "updatedAt")
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT ("batchKey", stage) DO UPDATE SET
       cursor = EXCLUDED.cursor,
       status = EXCLUDED.status,
       "countsJson" = EXCLUDED."countsJson",
       "updatedAt" = EXCLUDED."updatedAt"`,
    [BATCH_KEY, STAGE, payload.afterSourceId, status, JSON.stringify(payload), new Date(now)],
  );
}

export async function markSweepEpochComplete(
  executor: NeonHttpsExecutor,
  epoch: number,
  extras?: Partial<SweepCursor>,
): Promise<void> {
  await saveSweepCursor(executor, defaultCursor({
    afterSourceId: "",
    epoch,
    phase: "finalize",
    sourcesComplete: true,
    candidateIndex: 0,
    status: "EPOCH_COMPLETE",
    ...extras,
  }));
}

/** Build a fresh in-memory cursor (also used by tests). */
export function makeSweepCursor(partial?: Partial<SweepCursor>): SweepCursor {
  return defaultCursor(partial);
}

export async function fetchKnowledgeSources(
  executor: NeonHttpsExecutor,
  args: { afterSourceId: string; limit: number },
): Promise<PrecedentSourceRow[]> {
  const rows = await executor.execute(
    `SELECT "sourceId", "companyId", "issuerCik", "issuerTicker", "documentTitle",
            "storageRef", "originalBytesHash"
     FROM knowledge_sources
     WHERE "sourceId" > $1
     ORDER BY "sourceId" ASC
     LIMIT $2`,
    [args.afterSourceId, args.limit],
  );
  return rows
    .map((r) => ({
      sourceId: asString(r.sourceId ?? r.sourceid),
      companyId: (r.companyId ?? r.companyid) as string | null,
      issuerCik: (r.issuerCik ?? r.issuercik) as string | null,
      ticker: (r.issuerTicker ?? r.issuerticker) as string | null,
      title: (r.documentTitle ?? r.documenttitle) as string | null,
      storageRef: (r.storageRef ?? r.storageref) as string | null,
      contentSha256: (r.originalBytesHash ?? r.originalbyteshash) as string | null,
    }))
    .filter((r) => r.sourceId);
}

/** Load document bytes by contentHash (= knowledge_sources.originalBytesHash). */
export async function fetchDocumentText(
  executor: NeonHttpsExecutor,
  source: PrecedentSourceRow,
): Promise<string | null> {
  if (!source.contentSha256) return null;
  // Absent row → null (bytes genuinely not stored). A Neon / decode error is NOT absence:
  // it propagates (redacted) so a run can never silently score a source as text-less.
  let rows: Record<string, unknown>[];
  try {
    rows = await executor.execute(
      `SELECT convert_from(bytes, 'UTF8') AS text
       FROM document_byte_objects
       WHERE "contentHash" = $1
       LIMIT 1`,
      [source.contentSha256],
    );
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).replace(/postgres(ql)?:\/\/[^ "]+/g, "[URL]");
    throw new Error(`fetchDocumentText(${source.sourceId}) failed: ${msg}`);
  }
  const t = rows[0]?.text;
  if (typeof t === "string" && t.length > 0) return t;
  return null;
}

export async function fetchCandidates(
  executor: NeonHttpsExecutor,
  sourceId: string,
): Promise<PrecedentCandidate[]> {
  try {
    const rows = await executor.execute(
      `SELECT "candidateId", "sourceId", "familiesJson", excerpt, "payloadJson"
       FROM kf_precedent_covenant_candidates WHERE "sourceId" = $1`,
      [sourceId],
    );
    return rows.map((r) => {
      const payload = (r.payloadJson ?? r.payloadjson) as Record<string, unknown> | null;
      const sectionRef =
        payload && typeof payload.sectionRef === "string" ? payload.sectionRef : null;
      const formulaHint =
        payload && typeof payload.formulaHint === "string" ? payload.formulaHint : null;
      return {
        candidateId: asString(r.candidateId ?? r.candidateid),
        sourceId: asString(r.sourceId ?? r.sourceid) || sourceId,
        family: familyFromJson(r.familiesJson ?? r.familiesjson),
        sectionRef,
        excerpt: (r.excerpt as string) ?? null,
        formulaHint,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchDefinitions(
  executor: NeonHttpsExecutor,
  sourceId: string,
): Promise<PrecedentDefinition[]> {
  try {
    const rows = await executor.execute(
      `SELECT id, "sourceId", term, excerpt
       FROM kf_precedent_definitions WHERE "sourceId" = $1`,
      [sourceId],
    );
    return rows.map((r) => ({
      definitionId: asString(r.id),
      sourceId: asString(r.sourceId ?? r.sourceid) || sourceId,
      term: (r.term as string) ?? null,
      body: (r.excerpt as string) ?? null,
    }));
  } catch {
    return [];
  }
}

export async function fetchConditions(
  executor: NeonHttpsExecutor,
  sourceId: string,
): Promise<PrecedentCondition[]> {
  try {
    const rows = await executor.execute(
      `SELECT id, "sourceId", kind, excerpt
       FROM kf_precedent_conditions_exceptions WHERE "sourceId" = $1 LIMIT 200`,
      [sourceId],
    );
    return rows.map((r) => ({
      conditionId: asString(r.id),
      sourceId: asString(r.sourceId ?? r.sourceid) || sourceId,
      kind: (r.kind as string) ?? null,
      excerpt: (r.excerpt as string) ?? null,
    }));
  } catch {
    return [];
  }
}

export function candidatesAsRows(cands: PrecedentCandidate[]): CandidateRow[] {
  return cands.map((c) => ({
    candidateId: c.candidateId,
    sourceId: c.sourceId,
    family: c.family,
    sectionRef: c.sectionRef,
    excerpt: c.excerpt,
  }));
}
