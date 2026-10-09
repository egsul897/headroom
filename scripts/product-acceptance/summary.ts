import type { AcceptanceReport } from "./report-types";

export function renderSummary(r: AcceptanceReport): string {
  const L: string[] = [];
  L.push(`# Offline product-acceptance run — ${r.repository.headSha.slice(0, 12)}`, "");
  L.push(`Generated ${r.generatedAt} on branch \`${r.repository.branch}\` (${r.repository.dirty ? "dirty tree" : "clean tree"}). Corpus identity \`${r.corpus.corpusSha256.slice(0, 16)}…\`.`, "");
  L.push("## Execution contract", "", `Provider calls: **${r.executionContract.providerCalls}**. Network: **${r.executionContract.network}**.`, "", `Mocked stages: ${r.executionContract.mockedStages.join(", ") || "none"}. Not run: ${r.executionContract.notRunStages.join(", ") || "none"}.`, "");
  for (const d of r.executionContract.mockDisclosure) L.push(`- ${d}`);
  L.push("", "## Totals", "", `| checks | pass | fail | not tested | findings |`, `|---|---|---|---|---|`, `| ${r.totals.checks} | ${r.totals.pass} | ${r.totals.fail} | ${r.totals.notTested} | ${r.totals.findings} |`, "");
  L.push("Findings by severity: " + Object.entries(r.totals.findingsBySeverity).map(([k, v]) => `${k} ${v}`).join(", ") + ".", "");
  L.push("Findings by outcome class: " + Object.entries(r.totals.findingsByOutcome).map(([k, v]) => `${k} ${v}`).join(", ") + ".", "");
  for (const p of r.packages) {
    L.push(`## ${p.packageId}`, "", `${p.title}`, "", `Checks ${p.summary.checks}: pass ${p.summary.pass}, fail ${p.summary.fail}, not tested ${p.summary.notTested}.`, "");
    L.push("| stage | mode | note |", "|---|---|---|");
    for (const s of p.stages) L.push(`| ${s.stage} | ${s.mode} | ${(s.error ? `ERROR: ${s.error} — ` : "") + s.note.replace(/\|/g, "/")} |`);
    L.push("");
    if (p.findings.length) {
      L.push("| id | stage | severity | outcome | expectation | actual |", "|---|---|---|---|---|---|");
      for (const f of p.findings) L.push(`| ${f.findingId} | ${f.stage}${f.stageMode === "MOCKED" ? " (mocked input)" : ""} | ${f.severity} | ${f.outcomeClass} | ${f.expectationRef} | ${f.actual.replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 300)} |`);
      L.push("");
    } else L.push("No findings.", "");
    if (p.observations.length) { L.push("<details><summary>Observations</summary>", ""); for (const o of p.observations) L.push(`- ${o.replace(/\n/g, " ")}`); L.push("", "</details>", ""); }
  }
  return L.join("\n") + "\n";
}
