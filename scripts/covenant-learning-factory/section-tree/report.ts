#!/usr/bin/env tsx
/** Section-tree acceptance report over HELDOUT sources that have document text (offline snapshot). */
import { readFileSync, writeFileSync } from "node:fs";
import { readSnapshot, type DevManifest } from "../../../lib/covenant-learning-factory/scoreboard";
import { parseDocumentTree, treeStats } from "../../../lib/contract-model/section-tree/parse";
import { covenantChecklist, definedTerms, resolveCrossRefs } from "../../../lib/contract-model/section-tree/semantics";
const D = "scripts/covenant-learning-factory/scoreboard";
const manifest = JSON.parse(readFileSync(`${D}/dev-manifest.json`, "utf8")) as DevManifest;
const snap = readSnapshot(process.argv[2] || `${D}/snapshot.json.gz`);
const rows: unknown[] = [];
for (const s of snap.sources) {
  if (manifest.sourceIds.includes(s.source.sourceId)) continue;
  const raw = s.documentText ?? "";
  if (raw.length < 80) continue;
  const tree = parseDocumentTree(raw);
  const st = treeStats(tree, tree.text);
  const xr = resolveCrossRefs(tree, tree.text);
  const resolved = xr.filter((x) => x.status === "RESOLVED").length;
  const internal = xr.filter((x) => x.status !== "UNRESOLVED_EXTERNAL").length;
  rows.push({
    sourceId: s.source.sourceId, basis: tree.basis, ...st,
    definedTerms: definedTerms(tree, tree.text).length,
    xrefs: xr.length, xrefResolved: resolved, xrefExternal: xr.length - internal,
    xrefResolvedPctOfInternal: internal ? Math.round((1000 * resolved) / internal) / 10 : null,
    checklist: Object.fromEntries(covenantChecklist(tree, tree.text).map((c) => [c.family, c.status])),
  });
}
const out = process.argv[3] ?? "section-tree-report.json";
writeFileSync(out, JSON.stringify(rows, null, 2) + "\n");
for (const r of rows as any[]) console.log(`${r.sourceId.slice(0, 55).padEnd(55)} A=${r.articles} S=${r.sections} C=${r.clauses} depth=${r.maxDepth} unparsed=${r.unparsedPct}% toc=${r.tocExcluded ? "yes" : "no"} seqGap=${r.sequenceGapSections} failClosed=${r.failClosedSections} parseErr=${r.parseErrors} xref=${r.xrefResolved}/${r.xrefs - r.xrefExternal} (${r.xrefResolvedPctOfInternal}%) ext=${r.xrefExternal} defs=${r.definedTerms}`);
