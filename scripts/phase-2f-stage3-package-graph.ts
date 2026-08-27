/**
 * Phase 2F - Stage 3: frozen Phase 2C package-graph pipeline (deterministic,
 * zero LLM calls) over the 4 real CONMED documents. No declaredType is
 * supplied for any document - classification, identity, relationship
 * resolution, and instrument grouping must all be worked out by the
 * frozen algorithm itself from document text alone (Phase 2F §7: "do not
 * manually link amendments... do not manually identify definitions").
 */
import fs from "node:fs";
import path from "node:path";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");
const OUT_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "phase-2f-freeze");

interface DocSpec {
  documentId: string;
  label: string;
  files: string[];
}

const DOCS: DocSpec[] = [
  { documentId: "conmed-doc-a-eighth-ar-credit-agreement", label: "CONMED Eighth Amended and Restated Credit Agreement (2025-06-10)", files: ["base-credit-agreement-definitions-excerpt.txt", "base-credit-agreement-article-vii-negative-covenants.txt"] },
  { documentId: "conmed-doc-b-guarantee-collateral-agreement", label: "CONMED Amended and Restated Guarantee and Collateral Agreement (2025-06-10)", files: ["guarantee-and-collateral-agreement-full.txt"] },
  { documentId: "conmed-doc-c-second-amendment-2022", label: "CONMED Second Amendment to Seventh A&R Credit Agreement (2022-08-01)", files: ["second-amendment-2022-full.txt"] },
  { documentId: "conmed-doc-d-first-omnibus-amendment-2026", label: "CONMED First Omnibus Amendment and Increased Facility Activation Notice (2026-05-27)", files: ["first-omnibus-amendment-2026-curated.txt"] },
];

function main() {
  const documents: PackageDocumentInput[] = DOCS.map((doc) => ({
    documentId: doc.documentId,
    label: doc.label,
    text: doc.files.map((f) => fs.readFileSync(path.join(PKG_DIR, f), "utf-8")).join("\n\n"),
  }));

  const result = buildPackageGraph("phase-2f-unseen-conmed", "conmed-2025-credit-facility", documents);

  fs.writeFileSync(path.join(OUT_DIR, "phase-2f-stage3-package-graph.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main();
