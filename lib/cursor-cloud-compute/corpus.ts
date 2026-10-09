/**
 * Deterministic 100-document corpus for Cursor Cloud compute benchmarking.
 *
 * Seeds from in-repo unseen-package fixtures (real EDGAR-derived text/HTML),
 * then expands to N documents with deterministic, structure-preserving
 * transforms. Intentional duplicates are included so content-hash dedup is
 * exercised. Soft gate only. IMPLEMENTED ≠ CERTIFIED.
 */
import fs from "node:fs";
import path from "node:path";
import type { CorpusDocument } from "./types";

export const DEFAULT_CORPUS_SIZE = 100;

interface SeedSpec {
  seedId: string;
  relativePath: string;
  contentType: "text/plain" | "text/html";
}

const SEED_SPECS: SeedSpec[] = [
  { seedId: "chwy-ca", relativePath: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt", contentType: "text/plain" },
  { seedId: "gibraltar-ca", relativePath: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/extracted-text/credit-agreement.txt", contentType: "text/plain" },
  { seedId: "riot-a", relativePath: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-a-2025-04-22-credit-agreement.txt", contentType: "text/plain" },
  { seedId: "riot-b", relativePath: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-b-2025-05-19-amended-restated-credit-agreement.txt", contentType: "text/plain" },
  { seedId: "riot-c", relativePath: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt", contentType: "text/plain" },
  { seedId: "dsgr-a", relativePath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt", contentType: "text/plain" },
  { seedId: "dsgr-b", relativePath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-b-2024-third-amendment.txt", contentType: "text/plain" },
  { seedId: "dsgr-d", relativePath: "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt", contentType: "text/plain" },
  { seedId: "sup-a", relativePath: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-a-2022-12-15-term-loan-credit-agreement.txt", contentType: "text/plain" },
  { seedId: "sup-b", relativePath: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt", contentType: "text/plain" },
  { seedId: "sup-c", relativePath: "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text/doc-c-2025-03-31-first-amendment.txt", contentType: "text/plain" },
  { seedId: "fwrg-art6", relativePath: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/article-6-negative-covenants.txt", contentType: "text/plain" },
  { seedId: "fwrg-defs", relativePath: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/definitions-excerpt.txt", contentType: "text/plain" },
  { seedId: "lsb-art6", relativePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt", contentType: "text/plain" },
  { seedId: "lsb-defs", relativePath: "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt", contentType: "text/plain" },
  { seedId: "conmed-art7", relativePath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-article-vii-negative-covenants.txt", contentType: "text/plain" },
  { seedId: "conmed-defs", relativePath: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated/base-credit-agreement-definitions-excerpt.txt", contentType: "text/plain" },
  { seedId: "chwy-html", relativePath: "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/raw-html/doc-a-2026-06-23-credit-agreement.htm", contentType: "text/html" },
  { seedId: "gibraltar-html", relativePath: "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm", contentType: "text/html" },
  { seedId: "riot-a-html", relativePath: "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/raw-html/doc-a-2025-04-22-credit-agreement.htm", contentType: "text/html" },
];

function loadSeeds(repoRoot: string): Array<SeedSpec & { text: string }> {
  const loaded: Array<SeedSpec & { text: string }> = [];
  for (const spec of SEED_SPECS) {
    const abs = path.join(repoRoot, spec.relativePath);
    if (!fs.existsSync(abs)) continue;
    loaded.push({ ...spec, text: fs.readFileSync(abs, "utf-8") });
  }
  if (loaded.length === 0) {
    throw new Error("corpus: no seed fixtures found under tests/fixtures/unseen-packages");
  }
  return loaded;
}

/**
 * Structure-preserving deterministic transform: inject a unique preamble and
 * rename a few borrower tokens so content hashes diverge while ARTICLE/SECTION
 * markers remain intact for structural compilation.
 */
export function materializeVariant(seedText: string, variantIndex: number, seedId: string, contentType: "text/plain" | "text/html"): string {
  const borrower = `HEADROOM_BENCH_BORROWER_${String(variantIndex).padStart(3, "0")}`;
  const accession = `000${String(1000000000 + variantIndex)}-26-${String(100000 + variantIndex).slice(-6)}`;
  const preamble =
    contentType === "text/html"
      ? `<!-- CURSOR_CLOUD_COMPUTE_CORPUS seed=${seedId} variant=${variantIndex} borrower=${borrower} accession=${accession} -->\n`
      : `CURSOR_CLOUD_COMPUTE_CORPUS\nSEED=${seedId}\nVARIANT=${variantIndex}\nBORROWER=${borrower}\nACCESSION=${accession}\n\n`;

  // Bounded, deterministic token swaps — keep structural headings untouched.
  let body = seedText;
  body = body.replace(/\bBorrower\b/g, borrower);
  body = body.replace(/\bCompany\b/g, `${borrower}_CO`);
  // Touch a rare numeric run so near-identical HTML still differs after strip.
  body = body.replace(/(\$[\d,]{3,})/g, (m, _g, offset) => (offset % 17 === variantIndex % 17 ? `${m}.00` : m));
  return preamble + body;
}

export function buildDeterministicCorpus(options?: { size?: number; repoRoot?: string; duplicateEvery?: number }): CorpusDocument[] {
  const size = options?.size ?? DEFAULT_CORPUS_SIZE;
  const repoRoot = options?.repoRoot ?? process.cwd();
  const duplicateEvery = options?.duplicateEvery ?? 10;
  const seeds = loadSeeds(repoRoot);
  const docs: CorpusDocument[] = [];

  for (let i = 0; i < size; i++) {
    const seed = seeds[i % seeds.length]!;
    const isDuplicateSlot = i > 0 && i % duplicateEvery === 0;
    if (isDuplicateSlot) {
      const prior = docs[i - duplicateEvery]!;
      docs.push({
        documentId: `bench-doc-${String(i).padStart(3, "0")}`,
        label: `${prior.label} (duplicate)`,
        sourceSeed: prior.sourceSeed,
        contentType: prior.contentType as "text/plain" | "text/html",
        bytes: Buffer.from(prior.bytes),
        intentionalDuplicateOf: prior.documentId,
        charCount: prior.charCount,
      });
      continue;
    }

    const text = materializeVariant(seed.text, i, seed.seedId, seed.contentType);
    const bytes = Buffer.from(text, "utf-8");
    docs.push({
      documentId: `bench-doc-${String(i).padStart(3, "0")}`,
      label: `${seed.seedId}#${i}`,
      sourceSeed: seed.seedId,
      contentType: seed.contentType,
      bytes,
      intentionalDuplicateOf: null,
      charCount: text.length,
    });
  }

  return docs;
}

export function listSeedSpecs(): SeedSpec[] {
  return [...SEED_SPECS];
}
