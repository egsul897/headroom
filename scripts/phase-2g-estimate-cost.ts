/**
 * Phase 2G §35 - free (zero-LLM-call) cost estimate for the real CONMED
 * amendment rerun: builds the real structural index + Phase 2C package
 * graph (already fixed by Phase 2F.3, reused unmodified) and counts how
 * many ambiguous amendment effects would need bounded semantic
 * interpretation, before any real call is made.
 */
import fs from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import { countAmbiguousEffectsNeedingInterpretation } from "../lib/contract-model/compiler/amendment/pipeline";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";

const PKG_DIR = path.join(__dirname, "..", "tests", "fixtures", "unseen-packages", "conmed-2025-credit-facility", "curated");

const DOCS: Array<{ documentId: string; label: string; files: string[] }> = [
  { documentId: "conmed-doc-a-eighth-ar-credit-agreement", label: "CONMED Eighth Amended and Restated Credit Agreement (2025-06-10)", files: ["base-credit-agreement-definitions-excerpt.txt", "base-credit-agreement-article-vii-negative-covenants.txt"] },
  { documentId: "conmed-doc-b-guarantee-collateral-agreement", label: "CONMED Amended and Restated Guarantee and Collateral Agreement (2025-06-10)", files: ["guarantee-and-collateral-agreement-full.txt"] },
  { documentId: "conmed-doc-c-second-amendment-2022", label: "CONMED Second Amendment to Seventh A&R Credit Agreement (2022-08-01)", files: ["second-amendment-2022-full.txt"] },
  { documentId: "conmed-doc-d-first-omnibus-amendment-2026", label: "CONMED First Omnibus Amendment and Increased Facility Activation Notice (2026-05-27)", files: ["first-omnibus-amendment-2026-curated.txt"] },
];

function main() {
  const documents: PackageDocumentInput[] = DOCS.map((d) => ({ documentId: d.documentId, label: d.label, text: d.files.map((f) => fs.readFileSync(path.join(PKG_DIR, f), "utf-8")).join("\n") }));

  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefs = [];
  for (const d of documents) {
    const nodes = parseDocumentStructure(d);
    nodesByDocument.set(d.documentId, { text: d.text, nodes });
    allDefs.push(...detectStructuralDefinitions(d.documentId, d.text, nodes));
  }
  const index = buildStructuralIndex(nodesByDocument, allDefs, []);
  const packageGraph = buildPackageGraph("phase-2g-conmed-regression", "conmed-2025-credit-facility", documents);

  const modCandidateCount = packageGraph.modificationCandidates.length;
  const ambiguousCount = countAmbiguousEffectsNeedingInterpretation({ documents, packageGraph, index });

  console.log(
    JSON.stringify(
      {
        totalModificationCandidates: modCandidateCount,
        estimatedSemanticCallsNeeded: ambiguousCount,
        note: "Each ambiguous call sends only ONE amendment clause excerpt (bounded, <=500 chars typical) + resolved target metadata + the target's own current text (typically <2000 chars for a real section) - a small, bounded per-call cost, not a full-document scan.",
      },
      null,
      2
    )
  );
}

main();
