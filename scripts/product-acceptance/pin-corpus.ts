/**
 * Pins (or re-pins) the sha256 of every fixture document into its package's expectations.json.
 *
 * Only the `documents[].sha256` and `covenants[].textSha256` fields are rewritten; every other expectation is left
 * byte-for-byte as authored. textSha256 is the sha256 of the whitespace-normalised DESCENDANTS text of the covenant's
 * uniquely resolved structural node (the production parser decides the span; the hash pins what it produced on the
 * pinned bytes, so a later textual change to the clause is a deterministic STRUCTURE failure - mutation suite MUT-02).
 * Run after editing any fixture text: `npx tsx scripts/product-acceptance/pin-corpus.ts`.
 * With `--check` it exits non-zero on drift instead of rewriting.
 */
import fs from "node:fs";
import path from "node:path";
import { CORPUS_ROOT, listPackageIds, loadPackage, readRawManifest, sha256 } from "./corpus";
import { buildIndex } from "./stages";

const ws = (t: string) => t.replace(/\s+/g, " ").trim();

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
  // covenant text hashes (needs the parsed manifest + the production parser over the now-pinned bytes)
  const index = buildIndex(loadPackage(packageId));
  const covenants = manifest.covenants as Array<{ id: string; documentId: string; sectionRef: string; occurrence?: number; textSha256?: string }>;
  let textDrift = 0;
  for (const c of covenants) {
    const nodes = index.findNodesByRef(c.documentId, c.sectionRef);
    const node = c.occurrence ? nodes[c.occurrence - 1] : nodes.length === 1 ? nodes[0] : undefined;
    const actual = node ? sha256(ws(index.getNodeText(node.nodeId, "DESCENDANTS"))) : undefined;
    if (c.textSha256 !== actual) {
      textDrift += 1; drift += 1;
      console.log(`${check ? "DRIFT" : "PIN"} ${packageId} ${c.id} text ${c.textSha256?.slice(0, 12) ?? "(unpinned)"} -> ${actual?.slice(0, 12) ?? "(unresolvable)"}`);
      if (actual) c.textSha256 = actual; else delete c.textSha256;
    }
  }
  if (!check && textDrift > 0) fs.writeFileSync(path.join(CORPUS_ROOT, packageId, "expectations.json"), JSON.stringify(manifest, null, 2) + "\n");
}
console.log(check ? `check complete: ${drift} drifted hash(es)` : `pinned: ${drift} hash(es) updated`);
if (check && drift > 0) process.exit(1);
