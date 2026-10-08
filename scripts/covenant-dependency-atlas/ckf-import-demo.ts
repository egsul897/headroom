/**
 * Durable CKF import demonstration (offline, local store).
 * Proves: idempotent import, unresolved preservation, source-version identity,
 * duplicate handling, no unsupported promotion to legal truth.
 *
 * Large payloads stay under .local-dependency-atlas/ (gitignored).
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { KnowledgeFactoryExport } from "./schema";

const ROOT = resolve(__dirname, "../..");
const LOCAL = join(ROOT, ".local-dependency-atlas");
const STORE = join(LOCAL, "ckf-demo-store");

export interface CkfImportResult {
  status: "OK" | "FAILED";
  importPass: number;
  sourceVersionId: string;
  nodesUpserted: number;
  edgesUpserted: number;
  unresolvedPreserved: number;
  duplicatesSkipped: number;
  promotedToLegalTruth: number;
  idempotent: boolean | null;
  notes: string[];
}

function sourceVersionId(kf: KnowledgeFactoryExport): string {
  const material = JSON.stringify({
    schemaVersion: kf.schemaVersion,
    atlasSchemaVersion: kf.atlasSchemaVersion,
    generatedAt: kf.generatedAt,
    edgeIds: kf.edges.map((e) => e.edgeId).sort(),
    nodeIds: kf.nodes.map((n) => n.nodeId).sort(),
  });
  return `srcver:${createHash("sha256").update(material).digest("hex").slice(0, 24)}`;
}

interface StoreShape {
  sourceVersionId: string;
  nodes: Record<string, unknown>;
  edges: Record<string, unknown>;
  unresolvedEdgeIds: string[];
  importCount: number;
  lastImportedAt: string;
  legalTruthPromotions: never[];
}

function loadStore(): StoreShape | null {
  const path = join(STORE, "store.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as StoreShape;
}

function saveStore(store: StoreShape): void {
  mkdirSync(STORE, { recursive: true });
  writeFileSync(join(STORE, "store.json"), `${JSON.stringify(store, null, 2)}\n`);
}

export function importKnowledgeFactoryDataset(kf: KnowledgeFactoryExport, pass: number): CkfImportResult {
  const notes: string[] = [];
  const version = sourceVersionId(kf);
  const prior = loadStore();

  // Never promote unresolved/ambiguous to legal truth.
  const promotedToLegalTruth = 0;
  notes.push("No unsupported promotion to legal truth — RESOLVED edges remain candidates; UNRESOLVED/AMBIGUOUS preserved as-is.");

  const nodes: Record<string, unknown> = prior && prior.sourceVersionId === version ? { ...prior.nodes } : {};
  const edges: Record<string, unknown> = prior && prior.sourceVersionId === version ? { ...prior.edges } : {};
  let duplicatesSkipped = 0;
  let nodesUpserted = 0;
  let edgesUpserted = 0;

  for (const n of kf.nodes) {
    if (nodes[n.nodeId]) {
      duplicatesSkipped += 1;
      continue;
    }
    nodes[n.nodeId] = { ...n, canonicalIdentity: n.nodeId, sourceVersionId: version };
    nodesUpserted += 1;
  }
  for (const e of kf.edges) {
    if (edges[e.edgeId]) {
      duplicatesSkipped += 1;
      continue;
    }
    // Preserve resolution exactly — never coerce.
    edges[e.edgeId] = {
      ...e,
      sourceVersionId: version,
      legalTruth: false,
      resolution: e.resolution,
    };
    edgesUpserted += 1;
  }

  const unresolvedEdgeIds = kf.edges.filter((e) => e.resolution === "UNRESOLVED" || e.resolution === "AMBIGUOUS").map((e) => e.edgeId);

  const store: StoreShape = {
    sourceVersionId: version,
    nodes,
    edges,
    unresolvedEdgeIds,
    importCount: (prior?.sourceVersionId === version ? prior.importCount : 0) + 1,
    lastImportedAt: new Date().toISOString(),
    legalTruthPromotions: [],
  };
  saveStore(store);

  const idempotent =
    pass >= 2 && prior != null
      ? prior.sourceVersionId === version &&
        Object.keys(prior.nodes).length === Object.keys(store.nodes).length &&
        Object.keys(prior.edges).length === Object.keys(store.edges).length &&
        nodesUpserted === 0 &&
        edgesUpserted === 0
      : null;

  if (idempotent === true) notes.push("Second import against same source-version identity was idempotent (no new upserts).");
  if (prior && prior.sourceVersionId !== version) notes.push("Source-version identity changed — store replaced for new version.");

  writeFileSync(
    join(STORE, `import-pass-${pass}.json`),
    `${JSON.stringify(
      {
        pass,
        sourceVersionId: version,
        nodesUpserted,
        edgesUpserted,
        duplicatesSkipped,
        unresolvedPreserved: unresolvedEdgeIds.length,
        promotedToLegalTruth,
        idempotent,
      },
      null,
      2,
    )}\n`,
  );

  return {
    status: "OK",
    importPass: pass,
    sourceVersionId: version,
    nodesUpserted,
    edgesUpserted,
    unresolvedPreserved: unresolvedEdgeIds.length,
    duplicatesSkipped,
    promotedToLegalTruth,
    idempotent,
    notes,
  };
}

export function runCkfImportDemo(kfPath: string): { pass1: CkfImportResult; pass2: CkfImportResult; storePath: string } {
  if (!existsSync(kfPath)) {
    throw new Error(`KF export missing at ${kfPath}; run build-phase2/phase3 first`);
  }
  // Reset demo store for deterministic demo
  rmSync(STORE, { recursive: true, force: true });
  mkdirSync(STORE, { recursive: true });

  const kf = JSON.parse(readFileSync(kfPath, "utf-8")) as KnowledgeFactoryExport;
  const pass1 = importKnowledgeFactoryDataset(kf, 1);
  const pass2 = importKnowledgeFactoryDataset(kf, 2);
  return { pass1, pass2, storePath: join(STORE, "store.json") };
}
