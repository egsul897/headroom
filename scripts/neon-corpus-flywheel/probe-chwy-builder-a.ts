import { readFileSync } from "node:fs";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";

const text = readFileSync(
  "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
  "utf8",
);
const nodes = parseDocumentStructure({ documentId: "chwy", label: "CHWY", text });
const a = nodes.find((n) => n.sectionRef === "6.08(a)(3)(a)");
const b = nodes.find((n) => n.sectionRef === "6.08(a)(3)(b)");
const aA = nodes.find((n) => n.sectionRef === "6.08(a)(3)(a)(A)");
const aB = nodes.find((n) => n.sectionRef === "6.08(a)(3)(a)(B)");
const under3 = nodes.filter((n) => n.parentSectionRef === "6.08(a)(3)" && /6\.08\(a\)\(3\)\([AB]\)/.test(n.sectionRef));
console.log(
  JSON.stringify(
    {
      a: a && {
        start: a.charStart,
        end: a.charEnd,
        span: a.charEnd - a.charStart,
        parent: a.parentSectionRef,
        preview: text.slice(a.charStart, Math.min(a.charEnd, a.charStart + 100)),
        tail: text.slice(Math.max(a.charStart, a.charEnd - 120), a.charEnd),
      },
      b: b && { start: b.charStart, end: b.charEnd },
      aA: aA && { start: aA.charStart, end: aA.charEnd, parent: aA.parentSectionRef },
      aB: aB && { start: aB.charStart, end: aB.charEnd, parent: aB.parentSectionRef },
      falseParentedUnder3: under3.map((n) => ({ ref: n.sectionRef, parent: n.parentSectionRef })),
      aShouldEndAtB: a && b ? a.charEnd === b.charStart : null,
      gap: a && b ? b.charStart - a.charEnd : null,
    },
    null,
    2,
  ),
);
