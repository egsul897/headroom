/** Renders docs/product-readiness/03-defect-register.md from the machine-readable register (the JSON is the record). */
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(__dirname, "../../docs/product-readiness");
const reg = JSON.parse(fs.readFileSync(path.join(dir, "03-defect-register.json"), "utf8")) as { registerVersion: string; authoredBy: string; baselineSha: string; evidence: string; ownership: string; defects: Array<Record<string, unknown> & { id: string; status: string; severity: string; outcomeClass: string; stage: string; title: string; packages: string[]; signatures: Array<{ packageId: string; expectationRef: string }> }>; observations: string[] };
const L: string[] = [];
L.push("# Independent defect register", "", `Record: \`03-defect-register.json\` (${reg.registerVersion}). Baseline \`${reg.baselineSha.slice(0, 12)}\`. ${reg.authoredBy}.`, "", `${reg.ownership}`, "", `Evidence: ${reg.evidence}. A defect stays OPEN until \`tests/product-acceptance/known-defects.test.ts\` reports its signatures no longer fail.`, "");
L.push("| id | severity | outcome | stage | title | packages |", "|---|---|---|---|---|---|");
for (const d of reg.defects) L.push(`| ${d.id} | ${d.severity} | ${d.outcomeClass} | ${d.stage} | ${d.title} | ${d.packages.map((p) => p.replace(/^pkg-/, "")).join(", ")} |`);
L.push("");
for (const d of reg.defects) {
  L.push(`## ${d.id} — ${d.title}`, "", `**Status** ${d.status} · **Severity** ${d.severity} · **Outcome** ${d.outcomeClass} · **Stage** ${d.stage} · **Deterministic** ${String(d.deterministic)}`, "");
  for (const k of ["failingInput", "expected", "actual", "repro", "impact", "hypothesis", "acceptance"] as const) L.push(`- **${k}**: ${String(d[k])}`);
  L.push(`- **signatures**: ${d.signatures.map((s) => `\`${s.packageId}\` → \`${s.expectationRef}\``).join("; ")}`, "");
}
L.push("## Observations (not defects)", "");
for (const o of reg.observations) L.push(`- ${o}`);
fs.writeFileSync(path.join(dir, "03-defect-register.md"), L.join("\n") + "\n");
console.log("rendered 03-defect-register.md");
