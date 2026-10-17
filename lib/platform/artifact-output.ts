/**
 * Where a generated artifact is written.
 *
 * Several scripts regenerate committed artifacts (results JSON, demo reports,
 * authored ground truth). When they run under a test runner they must never
 * rewrite the committed copy: a test run has to leave `git status --porcelain`
 * empty (enforced by the pr-gate dirty-tree step).
 *
 * Resolution, in order:
 *   1. HEADROOM_ARTIFACT_DIR set (non-empty)  → <that dir>/<repoRelative>
 *   2. running under a test runner (VITEST, VITEST_WORKER_ID, NODE_ENV=test)
 *                                             → <os.tmpdir()>/headroom-test-artifacts/<repoRelative>
 *   3. otherwise (an explicit, intentional regeneration run) → <repoRoot>/<repoRelative>
 *
 * Plain Node (no imports beyond node:*) so scripts run through tsx and child
 * processes spawned from tests resolve the same location (env is inherited).
 */
import os from "node:os";
import path from "node:path";

export type ArtifactEnv = Readonly<Record<string, string | undefined>>;

export const TEST_ARTIFACT_SUBDIR = "headroom-test-artifacts";

export function isTestRun(env: ArtifactEnv = process.env): boolean {
  return Boolean(env.VITEST) || Boolean(env.VITEST_WORKER_ID) || env.NODE_ENV === "test";
}

/** Root directory artifacts go to (see module comment). */
export function artifactRoot(repoRoot: string, env: ArtifactEnv = process.env): string {
  const explicit = env.HEADROOM_ARTIFACT_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  if (isTestRun(env)) return path.join(os.tmpdir(), TEST_ARTIFACT_SUBDIR);
  return path.resolve(repoRoot);
}

/** Absolute path for the artifact that is committed at `repoRelative` under `repoRoot`. */
export function artifactPath(repoRoot: string, repoRelative: string, env: ArtifactEnv = process.env): string {
  if (path.isAbsolute(repoRelative)) throw new Error("artifactPath: repoRelative must be relative to the repo root");
  const root = artifactRoot(repoRoot, env);
  const target = path.resolve(root, repoRelative);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("artifactPath: path escapes the artifact root");
  return target;
}
