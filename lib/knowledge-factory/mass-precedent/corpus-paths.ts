import path from "node:path";
import { CorpusStore, defaultCorpusPaths } from "../store/corpus-store";

/** Persistent file-backed corpus for mass-precedent analysis (gitignored). */
export function massPrecedentCorpusRoot(repoRoot = process.cwd()): string {
  return path.join(repoRoot, ".local-knowledge-corpus", "mass-precedent");
}

export function openMassPrecedentCorpus(repoRoot = process.cwd()): CorpusStore {
  return new CorpusStore(defaultCorpusPaths(massPrecedentCorpusRoot(repoRoot)));
}
