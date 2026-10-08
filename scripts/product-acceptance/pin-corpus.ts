/**
 * Pins (or re-pins) the sha256 of every fixture document into its package's expectations.json.
 *
 * Only the `documents[].sha256` fields are rewritten; every expectation is left byte-for-byte as authored.
 * Run after editing any fixture text: `npx tsx scripts/product-acceptance/pin-corpus.ts`.
 * With `--check` it exits non-zero on drift instead of rewriting.
 */
import fs from "node:fs";
import path from "node:path";
import { CORPUS_ROOT, listPackageIds, readRawManifest, sha256 } from "./corpus";

const check = process.argv.includes("--check");
let drift = 0;
for (const packageId of listPackageIds()) {
  const manifest = readRawManifest(packageId);
  const docs = manifest.documents as Array<{ documentId: string; file: string; sha256: string }>;
  for (const d of docs) {
    const actual = sha256(fs.readFileSync(path.join(CORPUS_ROOT, packageId, d.file)));
    if (d.sha256 !== actual) {
      drift += 1;
      console.log(`${check ? "DRIFT" : "PIN"} ${packageId}/${d.file} ${d.sha256 || "(unpinned)"} -> ${actual}`);
      d.sha256 = actual;
    }
  }
  if (!check) fs.writeFileSync(path.join(CORPUS_ROOT, packageId, "expectations.json"), JSON.stringify(manifest, null, 2) + "\n");
}
console.log(check ? `check complete: ${drift} drifted document(s)` : `pinned: ${drift} document hash(es) updated`);
if (check && drift > 0) process.exit(1);
