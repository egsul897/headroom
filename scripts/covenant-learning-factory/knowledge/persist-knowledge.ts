#!/usr/bin/env tsx
/**
 * Persist built knowledge to Neon (ADDITIVE tables only; no UPDATE of existing rows, no DELETE, no DROP).
 *
 *   trees     per verified source (kf_source_text_backfill.verification BYTES_VERIFIED|TEXT_VERIFIED, plus
 *             --include-corpus for snapshot sources not in the backfill table): section-tree nodes
 *             (spans, parent, role), cross-references (resolved + unresolved), covenant checklist.
 *   findings  one scoreboard run (report JSON + findings JSONL) → kf_scoreboard_runs / kf_scoreboard_findings.
 *
 * Keys: (textSha256, parserVersion). textSha256 = sha256(utf8 documentText exactly as scored);
 * parserVersion = "st-" + sha256(parse.ts + semantics.ts)[0:12], so any parser change yields new rows and re-runs
 * of the same parser are no-ops (ON CONFLICT DO NOTHING). kf_tree_parses is written LAST per source as the
 * completion marker, so an interrupted run resumes cleanly. Each source is verified with SELECT count(*) after write.
 *
 * Usage:
 *   NEON_TRANSPORT=https DATABASE_URL=... npx tsx scripts/covenant-learning-factory/knowledge/persist-knowledge.ts \
 *     trees --snapshot=PATH [--dry-run] [--limit=N]
 *   ... findings --report=R.json --findings=F.jsonl --snapshot=PATH --rules-label=v0|v2 --tree=1|0 [--dry-run]
 *
 * Deterministic. Zero AI / LLM calls. Never prints the connection string.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createNeonHttpsExecutor, redactConnectionSecrets } from "../../../lib/covenant-learning-factory/store/neon-transport";
import { KNOWLEDGE_DDL, insertRows } from "../../../lib/covenant-learning-factory/pipeline/agreement-pipeline";
import { readSnapshot } from "../../../lib/covenant-learning-factory/scoreboard";
import { parseDocumentTree } from "../../../lib/contract-model/section-tree/parse";
import { covenantChecklist, resolveCrossRefs, roleOf } from "../../../lib/contract-model/section-tree/semantics";

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const DRY = argv.includes("--dry-run");
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export function parserVersion(): string {
  const p = (f: string) => readFileSync(new URL(`../../../lib/contract-model/section-tree/${f}`, import.meta.url));
  return "st-" + sha(Buffer.concat([p("parse.ts"), p("semantics.ts")])).slice(0, 12);
}

type Ex = Awaited<ReturnType<typeof createNeonHttpsExecutor>>;

const DDL = KNOWLEDGE_DDL;

async function count(ex: Ex, table: string, where: string, params: unknown[]) {
  return Number((await ex.execute(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params))[0]?.n ?? -1);
}

async function trees(ex: Ex) {
  const pv = parserVersion();
  const snap = readSnapshot(arg("snapshot")!);
  const ver = new Map<string, string>();
  // Snapshot sourceIds are "edgar:<accession>:<exhibitFilename>"; backfill rows are keyed by knowledge_sources.id.
  for (const r of await ex.execute(`SELECT b."sourceId" id, ks."accessionNumber" acc, ks."exhibitFilename" f, b.verification
      FROM kf_source_text_backfill b JOIN knowledge_sources ks ON ks.id = b."sourceId" WHERE b.verification IS NOT NULL`)) {
    ver.set(String(r.id), String(r.verification));
    if (r.acc && r.f) ver.set(`edgar:${r.acc}:${r.f}`, String(r.verification));
  }
  const done = new Set((await ex.execute(`SELECT "textSha256" FROM kf_tree_parses WHERE "parserVersion"=$1`, [pv]).catch(() => [])).map((r) => String(r.textSha256)));
  const include = argv.includes("--include-corpus");
  const todo = snap.sources.filter((s) => {
    const v = ver.get(s.source.sourceId);
    return (s.documentText ?? "").length >= 80 && (v === "TEXT_VERIFIED" || v === "BYTES_VERIFIED" || (include && v === undefined));
  }).slice(0, Number(arg("limit") ?? 1e9));
  console.log(`parserVersion=${pv} eligible=${todo.length} alreadyDone=${done.size} dry=${DRY}`);
  const tally = { written: 0, skipped: 0, mismatch: 0 };
  for (const s of todo) {
    const raw = s.documentText!;
    const h = sha(raw);
    if (done.has(h)) { tally.skipped++; continue; }
    const tree = parseDocumentTree(raw);
    const nodes = tree.nodes.map((n) => [h, pv, n.id, n.parentId, n.kind, n.label, n.path, n.sectionNumber, n.title, n.level,
      n.start, n.headingEnd, n.end, n.depth, n.status, n.kind === "CLAUSE" ? roleOf(tree, tree.text, n) : null, JSON.stringify(n.issues)]);
    const xr = resolveCrossRefs(tree, tree.text).map((x, i) => [h, pv, i, x.fromNodeId, x.at, x.raw, x.target, x.status, x.targetNodeId]);
    const cl = covenantChecklist(tree, tree.text).map((c) => [h, pv, c.family, c.status, JSON.stringify(c.sectionPaths), JSON.stringify(c.parts), JSON.stringify(c.needsInputs), c.note]);
    if (DRY) { console.log(`would write ${s.source.sourceId} nodes=${nodes.length} xrefs=${xr.length} checklist=${cl.length}`); continue; }
    await insertRows(ex, "kf_tree_nodes", ["textSha256","parserVersion","nodeId","parentId","kind","label","path","sectionNumber","title","level","start","headingEnd","end","depth","status","role","issues"], nodes, 100);
    await insertRows(ex, "kf_tree_xrefs", ["textSha256","parserVersion","ord","fromNodeId","at","raw","target","status","targetNodeId"], xr);
    await insertRows(ex, "kf_tree_checklist", ["textSha256","parserVersion","family","status","sectionPaths","parts","needsInputs","note"], cl);
    const k = [h, pv];
    const w = `"textSha256"=$1 AND "parserVersion"=$2`;
    const [cn, cx, cc] = [await count(ex, "kf_tree_nodes", w, k), await count(ex, "kf_tree_xrefs", w, k), await count(ex, "kf_tree_checklist", w, k)];
    if (cn !== nodes.length || cx !== xr.length || cc !== cl.length) {
      tally.mismatch++;
      console.log(`COUNT MISMATCH ${s.source.sourceId} nodes ${cn}/${nodes.length} xrefs ${cx}/${xr.length} checklist ${cc}/${cl.length} — not marking done`);
      continue;
    }
    await insertRows(ex, "kf_tree_parses", ["textSha256","parserVersion","sourceId","basis","verification","textLength","nodeCount","xrefCount","checklistCount"],
      [[h, pv, s.source.sourceId, tree.basis, ver.get(s.source.sourceId) ?? "CORPUS", raw.length, nodes.length, xr.length, cl.length]]);
    tally.written++;
    console.log(`ok ${s.source.sourceId} nodes=${cn} xrefs=${cx} checklist=${cc}`);
  }
  console.log(JSON.stringify(tally));
  if (!DRY) console.log("verify:", JSON.stringify((await ex.execute(
    `SELECT count(*)::int parses, sum("nodeCount")::int nodes, sum("xrefCount")::int xrefs, sum("checklistCount")::int checklist,
       (SELECT count(*)::int FROM kf_tree_nodes WHERE "parserVersion"=$1) nodes_rows,
       (SELECT count(*)::int FROM kf_tree_xrefs WHERE "parserVersion"=$1) xref_rows,
       (SELECT count(*)::int FROM kf_tree_xrefs WHERE "parserVersion"=$1 AND status='RESOLVED') xref_resolved,
       (SELECT count(*)::int FROM kf_tree_checklist WHERE "parserVersion"=$1) checklist_rows
     FROM kf_tree_parses WHERE "parserVersion"=$1`, [pv]))[0]));
}

async function findings(ex: Ex) {
  const snapPath = arg("snapshot")!;
  const snap = readSnapshot(snapPath);
  const textSha = new Map(snap.sources.map((s) => [s.source.sourceId, s.documentText ? sha(s.documentText) : null]));
  const report = JSON.parse(readFileSync(arg("report")!, "utf8"));
  const lines = readFileSync(arg("findings")!, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const commit = execSync("git rev-parse HEAD").toString().trim();
  const tree = arg("tree") !== "0";
  const label = arg("rules-label") ?? "unknown";
  const snapSha = sha(readFileSync(snapPath));
  const runId = sha([commit, label, report.rulesetVersion ?? "", tree, snapSha].join("|")).slice(0, 32);
  const ords = new Map<string, number>();
  const rows = lines.map((f) => {
    const o = ords.get(f.sourceId) ?? 0; ords.set(f.sourceId, o + 1);
    return [runId, f.sourceId, o, textSha.get(f.sourceId) ?? null, f.split, f.class, f.key ?? null, f.family ?? null, f.sectionRef ?? null, f.excerpt ?? null, f.message ?? null];
  });
  console.log(`runId=${runId} commit=${commit.slice(0, 8)} rules=${label} tree=${tree} findings=${rows.length} dry=${DRY}`);
  if (DRY) return;
  // Findings first, run row last (completion marker).
  await insertRows(ex, "kf_scoreboard_findings", ["runId","sourceId","ord","textSha256","split","class","key","family","sectionRef","excerpt","message"], rows, 150);
  const n = await count(ex, "kf_scoreboard_findings", `"runId"=$1`, [runId]);
  if (n !== rows.length) throw new Error(`findings count mismatch ${n}/${rows.length}; run row not written`);
  await insertRows(ex, "kf_scoreboard_runs", ["runId","gitCommit","rulesLabel","rulesetVersion","tree","snapshotSha256","totals","findingCount"],
    [[runId, commit, label, report.rulesetVersion ?? null, tree, snapSha, JSON.stringify(report.totals ?? report.splits ?? {}), rows.length]]);
  console.log("verify:", JSON.stringify((await ex.execute(
    `SELECT r."findingCount", (SELECT count(*)::int FROM kf_scoreboard_findings f WHERE f."runId"=r."runId") stored,
       (SELECT json_object_agg(class, c) FROM (SELECT class, count(*)::int c FROM kf_scoreboard_findings WHERE "runId"=$1 AND split='HELDOUT' GROUP BY class) q) heldout
     FROM kf_scoreboard_runs r WHERE r."runId"=$1`, [runId]))[0]));
}

async function main() {
  const ex = await createNeonHttpsExecutor(process.env.DATABASE_URL!);
  if (!DRY) for (const d of DDL) await ex.execute(d);
  if (cmd === "trees") await trees(ex);
  else if (cmd === "findings") await findings(ex);
  else throw new Error("usage: persist-knowledge.ts trees|findings ...");
}
main().catch((e) => { console.error(redactConnectionSecrets(String(e?.stack ?? e))); process.exit(1); });
