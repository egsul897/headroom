import { readFileSync } from "node:fs";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";

const text = readFileSync(
  "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt",
  "utf8",
);
const nodes = parseDocumentStructure({ documentId: "dsgr-d", label: "DSGR", text });
const defs = detectStructuralDefinitions("dsgr-d", text, nodes).filter((d) => !d.nested);
const aaIdx = defs.findIndex((d) => d.normalizedTerm === "available amount");
const aa = defs[aaIdx];
const next = defs[aaIdx + 1];
console.log(
  JSON.stringify(
    {
      totalNonNestedDefs: defs.length,
      aa: aa && { term: aa.exactTerm, charStart: aa.charStart, charEnd: aa.charEnd },
      next: next && { term: next.exactTerm, charStart: next.charStart },
      nearby: defs.slice(Math.max(0, aaIdx - 2), aaIdx + 5).map((d) => ({
        term: d.exactTerm,
        start: d.charStart,
      })),
      aaBodyLen: aa && next ? next.charStart - aa.charStart : null,
      aaBodyTail:
        aa && next ? text.slice(Math.max(aa.charStart, next.charStart - 180), next.charStart) : null,
      limbsInAaBody:
        aa && next
          ? [...text.slice(aa.charStart, next.charStart).matchAll(/^\s*\((i{1,3}|iv|v|vi{0,3}|ix|x)\)/gm)].map(
              (m) => m[1],
            )
          : null,
    },
    null,
    2,
  ),
);
