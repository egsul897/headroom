import { readFileSync, readdirSync } from "node:fs";
import { checkIntraDefinitionComponentCompleteness } from "../lib/contract-model/compiler/semantic/completeness-check";

const DIR = "tests/fixtures/unseen-packages/post-holdout-semantic-remediation-rerun";
for (const f of readdirSync(DIR).sort()) {
  if (!f.startsWith("holdout-") || f.includes("summary")) continue;
  const d = JSON.parse(readFileSync(`${DIR}/${f}`, "utf-8"));
  console.log("===", f);
  for (const def of d.compile.definitions) {
    const r = checkIntraDefinitionComponentCompleteness(def.calculationExpression);
    if (r.applicable) {
      console.log(`  ${def.termName}: applicable=true total=${r.totalComponentCount} wellTyped=${r.wellTypedComponentCount} unsupported=${r.unsupportedComponentCount}`);
      console.log(`    unsupportedReasons: ${JSON.stringify(r.unsupportedComponentReasons)}`);
    } else {
      console.log(`  ${def.termName}: applicable=false (ceKind=${def.calculationExpression?.kind ?? "null"})`);
    }
  }
}
