/**
 * File-backed durable store for learning-factory artifacts.
 * Survives without Neon; Neon sync is optional and additive.
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
  BatchCheckpoint,
  DashboardReport,
  LearningErrorRecord,
  PackageAuditManifest,
} from "../types";

export interface LearningFileStorePaths {
  root: string;
  packages: string;
  checkpoints: string;
  errors: string;
  dashboard: string;
}

export function defaultLearningStorePaths(
  root = path.resolve(".local-knowledge-corpus/covenant-learning-factory"),
): LearningFileStorePaths {
  return {
    root,
    packages: path.join(root, "packages"),
    checkpoints: path.join(root, "checkpoints"),
    errors: path.join(root, "errors"),
    dashboard: path.join(root, "dashboard"),
  };
}

export class LearningFileStore {
  readonly paths: LearningFileStorePaths;

  constructor(paths: LearningFileStorePaths = defaultLearningStorePaths()) {
    this.paths = paths;
    for (const p of Object.values(paths)) mkdirSync(p, { recursive: true });
  }

  packageManifestPath(packageKey: string): string {
    return path.join(this.paths.packages, sanitize(packageKey), "audit-manifest.json");
  }

  writePackageManifest(manifest: PackageAuditManifest): void {
    const p = this.packageManifestPath(manifest.packageKey);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(manifest, null, 2) + "\n");
    // Append error ledger shards
    for (const err of manifest.errors) {
      const ep = path.join(this.paths.errors, `${err.errorId}.json`);
      writeFileSync(ep, JSON.stringify(err, null, 2) + "\n");
    }
  }

  readPackageManifest(packageKey: string): PackageAuditManifest | null {
    const p = this.packageManifestPath(packageKey);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as PackageAuditManifest;
  }

  listPackageManifests(): PackageAuditManifest[] {
    if (!existsSync(this.paths.packages)) return [];
    const out: PackageAuditManifest[] = [];
    for (const dir of readdirSync(this.paths.packages)) {
      const p = path.join(this.paths.packages, dir, "audit-manifest.json");
      if (!existsSync(p)) continue;
      out.push(JSON.parse(readFileSync(p, "utf8")) as PackageAuditManifest);
    }
    return out.sort((a, b) => a.packageKey.localeCompare(b.packageKey));
  }

  writeCheckpoint(cp: BatchCheckpoint): void {
    const p = path.join(this.paths.checkpoints, `${sanitize(cp.batchId)}.json`);
    writeFileSync(p, JSON.stringify(cp, null, 2) + "\n");
  }

  readCheckpoint(batchId: string): BatchCheckpoint | null {
    const p = path.join(this.paths.checkpoints, `${sanitize(batchId)}.json`);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8")) as BatchCheckpoint;
  }

  writeDashboard(report: DashboardReport, alsoDocsPath?: string): void {
    const p = path.join(this.paths.dashboard, "latest.json");
    writeFileSync(p, JSON.stringify(report, null, 2) + "\n");
    if (alsoDocsPath) {
      mkdirSync(path.dirname(alsoDocsPath), { recursive: true });
      writeFileSync(alsoDocsPath, JSON.stringify(report, null, 2) + "\n");
    }
  }

  listErrors(): LearningErrorRecord[] {
    if (!existsSync(this.paths.errors)) return [];
    return readdirSync(this.paths.errors)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(path.join(this.paths.errors, f), "utf8")) as LearningErrorRecord);
  }
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}
