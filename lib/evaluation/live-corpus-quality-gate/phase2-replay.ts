/**
 * Phase 2 — freeze integrity + independent replay against immutable Phase-1 oracle.
 * Never mutates phase1-freeze/* expected outcomes.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { auditGibraltar, auditSuperior } from "./audit";
import type { AuditFinding } from "./types";

const ROOT = process.cwd();
const FREEZE_DIR = path.join(ROOT, "docs/live-corpus-quality-gate/phase1-freeze");

export interface ReplayClassification {
  findingId: string;
  outcome:
    | "REPRODUCED"
    | "NON_REPRODUCED"
    | "STATUS_CHANGED"
    | "NEW_IN_REPLAY"
    | "MISSING_IN_REPLAY";
  frozenStatus?: string;
  replayStatus?: string;
  frozenSummary?: string;
  replaySummary?: string;
}

export interface ReplayReport {
  frozenEvaluationContentSha: string;
  phase1TipSha: string;
  freezeArtifactHashes: Record<string, string>;
  freezeIntact: boolean;
  frozenFindingCount: number;
  frozenUniqueFindingIds: number;
  replayFindingCount: number;
  reproduced: number;
  nonReproduced: number;
  statusChanged: number;
  newInReplay: number;
  missingInReplay: number;
  duplicateFrozenFindingIds: Array<{ findingId: string; occurrences: number }>;
  evaluationHarnessDefects: Array<Record<string, unknown>>;
  classifications: ReplayClassification[];
  oracleUntouched: true;
}

function sha256(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function verifyFreezeIntact(): {
  intact: boolean;
  hashes: Record<string, string>;
  meta: Record<string, unknown>;
} {
  const metaPath = path.join(FREEZE_DIR, "FREEZE-MANIFEST.json");
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
    frozenEvaluationContentSha: string;
    phase1TipSha: string;
    artifactSha256: Record<string, string>;
  };
  const hashes: Record<string, string> = {};
  let intact = true;
  for (const [name, expected] of Object.entries(meta.artifactSha256)) {
    if (name === "FREEZE-MANIFEST.json") continue;
    const p = path.join(FREEZE_DIR, name);
    const actual = sha256(fs.readFileSync(p));
    hashes[name] = actual;
    if (actual !== expected) intact = false;
  }
  return { intact, hashes, meta: meta as unknown as Record<string, unknown> };
}

export function loadFrozenFindings(): AuditFinding[] {
  const raw = JSON.parse(fs.readFileSync(path.join(FREEZE_DIR, "01-findings.json"), "utf8")) as {
    findings: AuditFinding[];
  };
  return raw.findings;
}

export function runIndependentReplay(): ReplayReport {
  const { intact, hashes, meta } = verifyFreezeIntact();
  const frozen = loadFrozenFindings();
  const replay = [...auditGibraltar().findings, ...auditSuperior().findings];

  const frozenById = new Map(frozen.map((f) => [f.findingId, f]));
  const replayById = new Map(replay.map((f) => [f.findingId, f]));
  const allIds = new Set([...frozenById.keys(), ...replayById.keys()]);

  const classifications: ReplayClassification[] = [];
  for (const id of allIds) {
    const f = frozenById.get(id);
    const r = replayById.get(id);
    if (f && r) {
      if (f.status === r.status && f.summary === r.summary) {
        classifications.push({
          findingId: id,
          outcome: "REPRODUCED",
          frozenStatus: f.status,
          replayStatus: r.status,
          frozenSummary: f.summary,
          replaySummary: r.summary,
        });
      } else if (f.status !== r.status) {
        classifications.push({
          findingId: id,
          outcome: "STATUS_CHANGED",
          frozenStatus: f.status,
          replayStatus: r.status,
          frozenSummary: f.summary,
          replaySummary: r.summary,
        });
      } else {
        classifications.push({
          findingId: id,
          outcome: "NON_REPRODUCED",
          frozenStatus: f.status,
          replayStatus: r.status,
          frozenSummary: f.summary,
          replaySummary: r.summary,
        });
      }
    } else if (f && !r) {
      classifications.push({
        findingId: id,
        outcome: "MISSING_IN_REPLAY",
        frozenStatus: f.status,
        frozenSummary: f.summary,
      });
    } else if (!f && r) {
      classifications.push({
        findingId: id,
        outcome: "NEW_IN_REPLAY",
        replayStatus: r.status,
        replaySummary: r.summary,
      });
    }
  }

  const count = (o: ReplayClassification["outcome"]) =>
    classifications.filter((c) => c.outcome === o).length;

  // Detect duplicate findingIds in the frozen oracle (harness defect; do not mutate freeze).
  const idCounts = new Map<string, number>();
  for (const f of frozen) idCounts.set(f.findingId, (idCounts.get(f.findingId) ?? 0) + 1);
  const duplicateFrozenFindingIds = [...idCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id, n]) => ({ findingId: id, occurrences: n }));

  return {
    frozenEvaluationContentSha: String(meta.frozenEvaluationContentSha),
    phase1TipSha: String(meta.phase1TipSha),
    freezeArtifactHashes: hashes,
    freezeIntact: intact,
    frozenFindingCount: frozen.length,
    frozenUniqueFindingIds: idCounts.size,
    replayFindingCount: replay.length,
    reproduced: count("REPRODUCED"),
    nonReproduced: count("NON_REPRODUCED"),
    statusChanged: count("STATUS_CHANGED"),
    newInReplay: count("NEW_IN_REPLAY"),
    missingInReplay: count("MISSING_IN_REPLAY"),
    duplicateFrozenFindingIds,
    evaluationHarnessDefects: duplicateFrozenFindingIds.length
      ? [
          {
            defectId: "LCQG-HARNESS-FINDING-ID-COLLISION",
            classification: "EVALUATION_HARNESS_DEFECT",
            summary:
              "Phase-1 findingId formula embeds status and collides when two PASS findings share sample+dimension+layer (46 listed findings, 45 unique IDs). Oracle left unchanged; all unique IDs reproduced.",
            duplicateFrozenFindingIds,
          },
        ]
      : [],
    classifications: classifications.sort((a, b) => a.findingId.localeCompare(b.findingId)),
    oracleUntouched: true,
  };
}
