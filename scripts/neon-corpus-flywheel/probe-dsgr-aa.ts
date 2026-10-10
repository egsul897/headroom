/**
 * Offline probe: DSGR Available Amount hierarchy swallow.
 * Read-only fixture analysis — no Neon, no paid inference.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";

async function main() {
  const textPath =
    "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt";
  const text = readFileSync(textPath, "utf8");
  const aaIdx = text.indexOf("Available Amount");
  console.log("Available Amount first index", aaIdx);

  const list = parseDocumentStructure({
    documentId: "dsgr-doc-d",
    label: "DSGR Second A&R Credit Agreement",
    text,
  });

  console.log("total nodes", list.length);

  const section101 = list.filter((n) => /^1\.01\b/.test(n.sectionRef ?? ""));
  console.log("1.01* nodes", section101.length);

  const big = [...section101]
    .filter((n) => (n.charEnd ?? 0) - (n.charStart ?? 0) > 20_000)
    .sort(
      (a, b) =>
        (b.charEnd ?? 0) - (b.charStart ?? 0) - ((a.charEnd ?? 0) - (a.charStart ?? 0)),
    );

  const aaHeading = list.filter((n) => /Available Amount/i.test(n.heading ?? ""));
  const limbs = section101.filter((n) => /1\.01\([ivx]+\)/.test(n.sectionRef ?? ""));

  const out = {
    textPath,
    textBytes: text.length,
    availableAmountIndex: aaIdx,
    totalNodes: list.length,
    section101Count: section101.length,
    availableAmountHeadingNodes: aaHeading.map((n) => ({
      sectionRef: n.sectionRef,
      heading: n.heading,
      charStart: n.charStart,
      charEnd: n.charEnd,
      span: (n.charEnd ?? 0) - (n.charStart ?? 0),
    })),
    romanLimbsUnder101: limbs.map((n) => ({
      sectionRef: n.sectionRef,
      heading: (n.heading ?? "").slice(0, 80),
      charStart: n.charStart,
      charEnd: n.charEnd,
      span: (n.charEnd ?? 0) - (n.charStart ?? 0),
    })),
    hugeSpans: big.slice(0, 20).map((n) => ({
      sectionRef: n.sectionRef,
      heading: (n.heading ?? "").slice(0, 80),
      charStart: n.charStart,
      charEnd: n.charEnd,
      span: (n.charEnd ?? 0) - (n.charStart ?? 0),
      ownedPreview: text.slice(n.charStart ?? 0, Math.min((n.charStart ?? 0) + 120, n.charEnd ?? 0)),
      ownedTail: text.slice(Math.max((n.charStart ?? 0), (n.charEnd ?? 0) - 120), n.charEnd ?? 0),
    })),
  };

  const outDir = path.join("docs/neon-corpus-flywheel");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "probe-dsgr-aa-hierarchy.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
