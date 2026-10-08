/**
 * Build the source-to-covenant compilation dataset artifacts under
 * datasets/source-to-covenant/. Offline only — no paid inference.
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { buildDataset } from "../../lib/source-to-covenant-dataset/build";

function main() {
  const repoRoot = resolve(__dirname, "../..");
  const outRoot = resolve(repoRoot, "datasets/source-to-covenant");
  const built = buildDataset(repoRoot);

  for (const split of ["train", "dev", "eval-heldout"] as const) {
    const dir = resolve(outRoot, "records", split);
    mkdirSync(dir, { recursive: true });
  }
  mkdirSync(resolve(outRoot, "provenance"), { recursive: true });
  mkdirSync(resolve(outRoot, "exports"), { recursive: true });
  mkdirSync(resolve(outRoot, "reports"), { recursive: true });

  // Clear per-split files by rewriting only current ids
  for (const r of built.records) {
    writeFileSync(resolve(outRoot, "records", r.split, `${r.exampleId}.json`), JSON.stringify(r, null, 2) + "\n");
  }

  writeFileSync(resolve(outRoot, "provenance", "corpus-manifest.json"), JSON.stringify(built.provenance, null, 2) + "\n");
  writeFileSync(resolve(outRoot, "provenance", "version-pins.json"), JSON.stringify(built.provenance.toolVersions, null, 2) + "\n");
  writeFileSync(
    resolve(outRoot, "provenance", "usage-rights.json"),
    JSON.stringify(
      {
        status: "REVIEW_REQUIRED_BEFORE_SFT_OR_DISTILLATION",
        sourceClass: "PUBLIC_SEC_EDGAR_FILINGS_VIA_REPO_FIXTURES",
        notes: [
          "Exact legal text is excerpted from authentic SEC EDGAR financing documents already stored as repository fixtures.",
          "Export rows are suitable for future supervised fine-tuning or distillation only after provenance and usage-rights review.",
          "Do not ingest into Claude independent acceptance corpora, verifier few-shots, or compiler prompt few-shots.",
          "Compiler/verifier version pins are provenance only and are not label authority.",
        ],
        contaminationRestrictions: {
          excludeFromClaudeAcceptanceCorpus: true,
          excludeFromVerifierFewShots: true,
          excludeFromCompilerPromptFewShots: true,
        },
      },
      null,
      2,
    ) + "\n",
  );

  writeFileSync(resolve(outRoot, "exports", "importable-records.json"), built.importableJson + "\n");
  writeFileSync(resolve(outRoot, "exports", "sft-ready.jsonl"), built.sftJsonl);
  writeFileSync(resolve(outRoot, "reports", "quality-report.json"), JSON.stringify(built.qualityReport, null, 2) + "\n");
  writeFileSync(resolve(outRoot, "reports", "duplicate-report.json"), JSON.stringify(built.duplicateReport, null, 2) + "\n");
  writeFileSync(
    resolve(outRoot, "reports", "split-manifest.json"),
    JSON.stringify(
      {
        train: built.records.filter((r) => r.split === "train").map((r) => r.exampleId),
        dev: built.records.filter((r) => r.split === "dev").map((r) => r.exampleId),
        "eval-heldout": built.records.filter((r) => r.split === "eval-heldout").map((r) => r.exampleId),
        heldOutIssuers: [...new Set(built.records.filter((r) => r.split === "eval-heldout").map((r) => r.document.issuerId))],
      },
      null,
      2,
    ) + "\n",
  );

  const failed = built.qualityReport.checks.filter((c) => c.status === "FAIL");
  console.log(`Built ${built.records.length} records`);
  console.log(`Quality: readyForImport=${built.qualityReport.summary.readyForImport}`);
  for (const c of built.qualityReport.checks) {
    console.log(`  [${c.status}] ${c.id}: ${c.detail}`);
  }
  if (failed.length) {
    process.exitCode = 1;
  }
}

main();
