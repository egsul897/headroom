/**
 * Authentic-agreement corpus registry for Phase 2 unseen extraction.
 *
 * Development vs evaluation splits are fixed here. Gibraltar is held out
 * (CKG benchmark coordination). Large bytes stay on disk under
 * `.local-dependency-atlas/` — only manifests/checksums are git-committed.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "../..");

export type CorpusSplit = "development" | "evaluation";

export interface CorpusEntry {
  documentId: string;
  packageId: string;
  issuer: string;
  sourcePath: string;
  split: CorpusSplit;
  /** true when Phase-3F ground truth exists — structural extraction still must not use it. */
  hasGroundTruth: boolean;
  bytes: number | null;
  sha256: string | null;
  available: boolean;
}

function hashFile(path: string): { bytes: number; sha256: string } {
  const buf = readFileSync(path);
  return { bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

function entry(
  documentId: string,
  packageId: string,
  issuer: string,
  relPath: string,
  split: CorpusSplit,
  hasGroundTruth: boolean,
): CorpusEntry {
  const sourcePath = join(ROOT, relPath);
  const available = existsSync(sourcePath);
  const h = available ? hashFile(sourcePath) : null;
  return {
    documentId,
    packageId,
    issuer,
    sourcePath: relPath,
    split,
    hasGroundTruth,
    bytes: h?.bytes ?? null,
    sha256: h?.sha256 ?? null,
    available,
  };
}

/** Fixed registry of authentic fixture agreements (paths relative to repo root). */
export function buildFixtureCorpusRegistry(): CorpusEntry[] {
  const entries: CorpusEntry[] = [
    // DSGR — development (GT exists but structural path must not read it)
    entry("dsgr-doc-a", "dsgr-2022-2025", "DSGR", "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt", "development", true),
    entry("dsgr-doc-b", "dsgr-2022-2025", "DSGR", "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt", "development", true),
    entry("dsgr-doc-c", "dsgr-2022-2025", "DSGR", "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-c-2025-fourth-amendment.txt", "development", true),
    entry("dsgr-doc-d", "dsgr-2022-2025", "DSGR", "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt", "development", true),
    // Chewy
    entry("chwy-doc-a", "chwy-2026", "CHWY", "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt", "development", false),
    // Riot
    entry("riot-doc-a", "riot-2025-2026", "RIOT", "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-a-2025-04-22-credit-agreement.txt", "development", false),
    entry("riot-doc-b", "riot-2025-2026", "RIOT", "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-b-2025-05-19-amended-restated-credit-agreement.txt", "development", false),
    entry("riot-doc-c", "riot-2025-2026", "RIOT", "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt", "development", false),
    // Superior (final-lightweight-unseen-sup)
    entry("sup-doc-a", "superior-2022-2025", "SXI", "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt", "development", false),
    entry("sup-doc-b", "superior-2022-2025", "SXI", "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt", "development", false),
    entry("sup-doc-c", "superior-2022-2025", "SXI", "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-c-2025-03-31-first-amendment.txt", "development", false),
    // CONMED curated / raw
    entry("cnmd-base-neg", "conmed-2025", "CNMD", "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt", "development", false),
    entry("cnmd-defs", "conmed-2025", "CNMD", "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-definitions-excerpt.txt", "development", false),
    entry("cnmd-omnibus", "conmed-2025", "CNMD", "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/first-omnibus-amendment-2026-curated.txt", "development", false),
    entry("cnmd-gca", "conmed-2025", "CNMD", "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/guarantee-and-collateral-agreement-full.txt", "development", false),
    entry("cnmd-htm-base", "conmed-2025", "CNMD", "tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-1-eighth-ar-credit-agreement-2025-06-16.htm", "development", false),
    entry("cnmd-htm-omnibus", "conmed-2025", "CNMD", "tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-1-first-omnibus-amendment-2026-06-01.htm", "development", false),
    entry("cnmd-htm-gca", "conmed-2025", "CNMD", "tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-2-ar-guarantee-and-collateral-agreement-2025-06-16.htm", "development", false),
    // Sealed evaluation corpus: CONMED second amendment HTML — extract for measurement only.
    entry("cnmd-htm-amd2", "conmed-2025", "CNMD", "tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-2-second-amendment-2022-08-02.htm", "evaluation", false),
    // FWRG / LSB excerpts
    entry("fwrg-art6", "fwrg-2021", "FWRG", "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", "development", false),
    entry("fwrg-defs", "fwrg-2021", "FWRG", "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt", "development", false),
    entry("lsb-art6", "lsb-2023", "LSB", "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt", "development", false),
    entry("lsb-defs", "lsb-2023", "LSB", "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt", "development", false),
    entry("lsb-intercreditor", "lsb-2023", "LSB", "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/intercreditor-joinder.txt", "development", false),
    // Gibraltar — DEVELOPMENT per Arch+Cert (docs/p3-lane-c-gibraltar-dev-edgar-1acdff3.md).
    // Phase 2 incorrectly labeled this evaluation; Phase 3 corrects the split.
    // Knife River remains BLIND (body never opened / not registered here).
    entry("gibraltar-ca", "gibraltar-2026", "ROCK", "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt", "development", false),
  ];

  // Expand with any additional .txt under .local-dependency-atlas/corpus/ (EDGAR/CKF drops).
  const localCorpus = join(ROOT, ".local-dependency-atlas/corpus");
  if (existsSync(localCorpus)) {
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (/\.(txt|htm|html)$/i.test(name)) {
          const rel = relative(ROOT, full);
          const documentId = `local-${createHash("sha256").update(rel).digest("hex").slice(0, 12)}`;
          if (!entries.some((e) => e.sourcePath === rel)) {
            entries.push(entry(documentId, "local-edgar-corpus", "UNKNOWN", rel, "development", false));
          }
        }
      }
    };
    walk(localCorpus);
  }

  return entries;
}

export function corpusSummary(entries: CorpusEntry[]) {
  const available = entries.filter((e) => e.available);
  const issuers = [...new Set(available.map((e) => e.issuer))].sort();
  return {
    registered: entries.length,
    available: available.length,
    developmentAvailable: available.filter((e) => e.split === "development").length,
    evaluationAvailable: available.filter((e) => e.split === "evaluation").length,
    issuers,
    targetRange: { min: 25, max: 50 },
    targetMet: available.length >= 25,
    holdoutIntegrity: {
      gibraltarSplit: available.find((e) => e.documentId === "gibraltar-ca")?.split ?? "missing",
      gibraltarDesignation: "DEVELOPMENT — Arch+Cert 2026-10-07; Phase 2 evaluation label corrected",
      knifeRiverBlind: "PRESERVED_UNREAD — no body registered; no inspection this mission",
      evaluationPackage: available.find((e) => e.split === "evaluation")?.documentId ?? null,
      evaluationPackagePolicy: "Extract for measurement only; do not tune Atlas connectives against evaluation docs",
    },
    note:
      available.length < 25
        ? `Only ${available.length} authentic local texts available; additional agreements require EDGAR Backfill acquisition-queue + CKF download into .local-dependency-atlas/corpus/ (gitignored).`
        : "Local+acquired corpus meets the 25–50 authentic-agreement target window.",
  };
}
