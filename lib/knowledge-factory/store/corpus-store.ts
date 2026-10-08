/**
 * File-backed corpus store for bulk knowledge-factory artifacts.
 * Bulk bytes stay under .local-knowledge-corpus/ (gitignored).
 * Manifests can be copied to docs/knowledge-factory/manifests for git-safe stats.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";
import type {
  CostLedgerEntry,
  CovenantCandidateRecord,
  CrossReferenceRecord,
  DefinitionRecord,
  KnowledgeRelationshipRecord,
  KnowledgeSourceRecord,
  StructuralNodeRecord,
} from "../types";

export interface CorpusStorePaths {
  root: string;
  bytes: string;
  manifests: string;
  checkpoints: string;
  cache: string;
}

export function defaultCorpusPaths(root = path.resolve(".local-knowledge-corpus")): CorpusStorePaths {
  return {
    root,
    bytes: path.join(root, "bytes"),
    manifests: path.join(root, "manifests"),
    checkpoints: path.join(root, "checkpoints"),
    cache: path.join(root, "cache"),
  };
}

export class CorpusStore {
  readonly paths: CorpusStorePaths;

  constructor(paths: CorpusStorePaths = defaultCorpusPaths()) {
    this.paths = paths;
    for (const p of [paths.root, paths.bytes, paths.manifests, paths.checkpoints, paths.cache]) {
      mkdirSync(p, { recursive: true });
    }
  }

  sourcePath(sourceId: string): string {
    return path.join(this.paths.manifests, "sources", sanitize(sourceId) + ".json");
  }

  bytesPath(contentHash: string): string {
    return path.join(this.paths.bytes, contentHash.slice(0, 2), contentHash);
  }

  upsertSource(record: KnowledgeSourceRecord): void {
    const p = this.sourcePath(record.sourceId);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(record, null, 2));
  }

  getSource(sourceId: string): KnowledgeSourceRecord | null {
    const p = this.sourcePath(sourceId);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as KnowledgeSourceRecord;
  }

  listSources(): KnowledgeSourceRecord[] {
    const dir = path.join(this.paths.manifests, "sources");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as KnowledgeSourceRecord);
  }

  writeBytes(contentHash: string, bytes: Buffer): string {
    const p = this.bytesPath(contentHash);
    if (existsSync(p)) return p;
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, bytes);
    return p;
  }

  readBytes(contentHash: string): Buffer | null {
    const p = this.bytesPath(contentHash);
    if (!existsSync(p)) return null;
    return readFileSync(p);
  }

  hasBytes(contentHash: string): boolean {
    return existsSync(this.bytesPath(contentHash));
  }

  writeJson(relPath: string, data: unknown): void {
    const p = path.join(this.paths.manifests, relPath);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(data, null, 2));
  }

  readJson<T>(relPath: string): T | null {
    const p = path.join(this.paths.manifests, relPath);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as T;
  }

  saveCheckpoint(name: string, data: unknown): void {
    const p = path.join(this.paths.checkpoints, `${sanitize(name)}.json`);
    writeFileSync(p, JSON.stringify(data, null, 2));
  }

  loadCheckpoint<T>(name: string): T | null {
    const p = path.join(this.paths.checkpoints, `${sanitize(name)}.json`);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as T;
  }

  appendCost(entry: CostLedgerEntry): void {
    const p = path.join(this.paths.manifests, "cost-ledger.jsonl");
    writeFileSync(p, `${JSON.stringify(entry)}\n`, { flag: "a" });
  }

  readCostLedger(): CostLedgerEntry[] {
    const p = path.join(this.paths.manifests, "cost-ledger.jsonl");
    if (!existsSync(p)) return [];
    return readFileSync(p, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CostLedgerEntry);
  }

  saveStructuralNodes(sourceId: string, nodes: StructuralNodeRecord[]): void {
    this.writeJson(`structural/${sanitize(sourceId)}.json`, nodes);
  }

  loadStructuralNodes(sourceId: string): StructuralNodeRecord[] {
    return this.readJson<StructuralNodeRecord[]>(`structural/${sanitize(sourceId)}.json`) ?? [];
  }

  saveCandidates(sourceId: string, candidates: CovenantCandidateRecord[]): void {
    this.writeJson(`candidates/${sanitize(sourceId)}.json`, candidates);
  }

  loadCandidates(sourceId: string): CovenantCandidateRecord[] {
    return this.readJson<CovenantCandidateRecord[]>(`candidates/${sanitize(sourceId)}.json`) ?? [];
  }

  saveDefinitions(sourceId: string, defs: DefinitionRecord[]): void {
    this.writeJson(`definitions/${sanitize(sourceId)}.json`, defs);
  }

  loadDefinitions(sourceId: string): DefinitionRecord[] {
    return this.readJson<DefinitionRecord[]>(`definitions/${sanitize(sourceId)}.json`) ?? [];
  }

  saveCrossReferences(sourceId: string, refs: CrossReferenceRecord[]): void {
    this.writeJson(`cross-refs/${sanitize(sourceId)}.json`, refs);
  }

  loadCrossReferences(sourceId: string): CrossReferenceRecord[] {
    return this.readJson<CrossReferenceRecord[]>(`cross-refs/${sanitize(sourceId)}.json`) ?? [];
  }

  saveRelationships(rels: KnowledgeRelationshipRecord[]): void {
    this.writeJson("relationships.json", rels);
  }

  loadRelationships(): KnowledgeRelationshipRecord[] {
    return this.readJson<KnowledgeRelationshipRecord[]>("relationships.json") ?? [];
  }
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._:-]+/g, "_");
}
