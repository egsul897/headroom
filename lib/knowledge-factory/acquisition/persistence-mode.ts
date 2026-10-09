/**
 * Explicit acquisition → persistence modes for EHB/CKF pipelines.
 *
 * LOCAL     — file-backed corpus only; no Neon mutation
 * NEON      — durable Neon BYTEA + KnowledgeSource (gated)
 * REPROCESS — reanalyze bytes already on disk or in Neon; no SEC fetch
 *
 * Unified local root: `.local-knowledge-corpus/` (not a separate mass-precedent island).
 * Mass-precedent subdirectory remains compatible for older scripts.
 */

import path from "node:path";
import { CorpusStore, defaultCorpusPaths } from "../store/corpus-store";
import { openMassPrecedentCorpus, massPrecedentCorpusRoot } from "../mass-precedent/corpus-paths";

export type AcquisitionPersistenceMode = "LOCAL" | "NEON" | "REPROCESS";

export const MASS_LIVE_ENV = "KF_MASS_PRECEDENT_LIVE_WRITE";
export const MASS_LIVE_TOKEN = "I_AUTHORIZE_NEON_BULK_WRITE";

export interface ResolvedPersistence {
  mode: AcquisitionPersistenceMode;
  /** True when KnowledgeSource / document_byte_objects may be written. */
  persistNeon: boolean;
  /** True when SEC HTTP fetch is allowed. */
  allowSecFetch: boolean;
  /** Canonical local store for bytes + analysis (unified root). */
  local: CorpusStore;
  /**
   * Analysis store — same as `local` under unified mode so sources are not
   * stranded in `.local-knowledge-corpus/mass-precedent/` only.
   */
  analysis: CorpusStore;
  /** Observability: which roots are in play. */
  roots: { unified: string; massPrecedentLegacy: string; analysisRoot: string };
}

export function parsePersistenceMode(raw: string | undefined, persistNeonFlag: boolean): AcquisitionPersistenceMode {
  const m = (raw ?? "").trim().toUpperCase();
  if (m === "LOCAL" || m === "NEON" || m === "REPROCESS") return m;
  // Backward compatible: --persist-neon implies NEON; else LOCAL.
  return persistNeonFlag ? "NEON" : "LOCAL";
}

export function assertNeonWriteAuthorized(env: NodeJS.ProcessEnv = process.env): void {
  if (env[MASS_LIVE_ENV] !== MASS_LIVE_TOKEN) {
    throw new Error(`Refusing Neon persist without ${MASS_LIVE_ENV}=${MASS_LIVE_TOKEN}`);
  }
}

/**
 * Open the shared local corpus used by acquisition.
 * Analysis artifacts are written to the unified root so browse/search see them.
 * Legacy mass-precedent root path is reported for observability only.
 */
export function resolveAcquisitionPersistence(opts: {
  mode: AcquisitionPersistenceMode;
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
}): ResolvedPersistence {
  const env = opts.env ?? process.env;
  const repoRoot = opts.repoRoot ?? process.cwd();
  const unifiedRoot = path.join(repoRoot, ".local-knowledge-corpus");
  const massLegacy = massPrecedentCorpusRoot(repoRoot);
  const local = new CorpusStore(defaultCorpusPaths(unifiedRoot));
  // Unified: analysis lives on the same root as acquired bytes/sources.
  const analysis = local;
  // Touch legacy mass-precedent store construction so older paths remain creatable
  // without becoming the write target for new EHB consumes.
  void openMassPrecedentCorpus(repoRoot);

  if (opts.mode === "NEON") {
    assertNeonWriteAuthorized(env);
  }

  return {
    mode: opts.mode,
    persistNeon: opts.mode === "NEON",
    allowSecFetch: opts.mode !== "REPROCESS",
    local,
    analysis,
    roots: {
      unified: unifiedRoot,
      massPrecedentLegacy: massLegacy,
      analysisRoot: analysis.paths.root,
    },
  };
}
