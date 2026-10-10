/**
 * Final-audit companion — fingerprint delta vs PR #255 tip (187c72e0)
 * before the final-audit remediation. Does not rewrite historical
 * before-after-health.json (Gate 3 evidence against main PRE_SHA).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

const PRE_SHA = "187c72e06da53801f19dfaef548ecffb94e5e67f";
const OUT = "docs/neon-corpus-flywheel/acceptance-gate";
const WT = "/tmp/flywheel-audit-before";

function docs(): Array<{ key: string; id: string; path: string }> {
  const out: Array<{ key: string; id: string; path: string }> = [];
  const add = (key: string, dir: string) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
      out.push({ key, id: f.replace(/\.txt$/, ""), path: path.join(dir, f) });
    }
  };
  add("dsgr", "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text");
  add("chwy", "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text");
  add("conmed", "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated");
  for (const f of ["definitions-excerpt.txt", "article-6-negative-covenants.txt", "intercreditor-joinder.txt"]) {
    const p = path.join("tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement", f);
    if (existsSync(p)) out.push({ key: "lsb-holdout", id: f.replace(/\.txt$/, ""), path: p });
  }
  return out;
}

function healthErrors(documentId: string, text: string, nodes: StructuralNode[]) {
  const defs = detectStructuralDefinitions(documentId, text, nodes);
  const index = buildStructuralIndex(new Map([[documentId, { text, nodes }]]), defs, []);
  const errors = index.healthDiagnostics().filter((h) => h.severity === "ERROR");
  const byCode: Record<string, number> = {};
  for (const e of errors) byCode[e.code] = (byCode[e.code] ?? 0) + 1;
  return { errorCount: errors.length, byCode, nodeCount: nodes.length };
}

function fingerprint(nodes: StructuralNode[]) {
  return nodes.map(
    (n) =>
      `${n.sectionRef}|${n.nodeType}|${n.charStart}|${n.charEnd}|${n.parentSectionRef ?? "-"}|${n.parentNodeId ?? "-"}`,
  );
}

function parseBefore(textPath: string, documentId: string): StructuralNode[] {
  const outJson = `/tmp/audit-pre-nodes-${documentId}.json`;
  const script = `
const { parseDocumentStructure } = require("./lib/contract-model/compiler/stage-structure");
const fs = require("fs");
const text = fs.readFileSync(process.env.TEXT_PATH, "utf8");
const nodes = parseDocumentStructure({ documentId: process.env.DOC_ID, label: process.env.DOC_ID, text });
fs.writeFileSync(process.env.OUT_JSON, JSON.stringify(nodes));
`;
  execFileSync("npx", ["tsx", "-e", script], {
    cwd: WT,
    env: {
      ...process.env,
      TEXT_PATH: path.resolve("/workspace", textPath),
      DOC_ID: documentId,
      OUT_JSON: outJson,
    },
    stdio: "pipe",
  });
  return JSON.parse(readFileSync(outJson, "utf8")) as StructuralNode[];
}

function main() {
  mkdirSync(OUT, { recursive: true });
  if (!existsSync(path.join(WT, "package.json"))) {
    try {
      execSync(`git worktree remove --force ${WT}`, { cwd: "/workspace", stdio: "pipe" });
    } catch {
      /* absent */
    }
    execSync(`git worktree add --detach ${WT} ${PRE_SHA}`, { cwd: "/workspace", stdio: "inherit" });
    execSync(`ln -sfn /workspace/node_modules ${WT}/node_modules`, { stdio: "pipe" });
  }

  const rows = [];
  for (const d of docs()) {
    const text = readFileSync(d.path, "utf8");
    const afterNodes = parseDocumentStructure({ documentId: d.id, label: d.id, text });
    const after = healthErrors(d.id, text, afterNodes);
    const beforeNodes = parseBefore(d.path, d.id);
    const before = healthErrors(d.id, text, beforeNodes);

    const beforeFp = new Set(fingerprint(beforeNodes));
    const afterFp = fingerprint(afterNodes);
    const added = afterFp.filter((x) => !beforeFp.has(x));
    const removed = [...beforeFp].filter((x) => !afterFp.includes(x));
    const parentageChanged = afterFp.filter((x) => {
      const [ref, , start] = x.split("|");
      const prev = [...beforeFp].find((p) => {
        const parts = p.split("|");
        return parts[0] === ref && parts[2] === start;
      });
      if (!prev) return false;
      return prev.split("|").slice(4).join("|") !== x.split("|").slice(4).join("|");
    });

    rows.push({
      key: `${d.key}::${d.id}`,
      before,
      after,
      deltaErrors: after.errorCount - before.errorCount,
      added: added.length,
      removed: removed.length,
      parentageChanged: parentageChanged.length,
      addedSample: added.slice(0, 6),
      removedSample: removed.slice(0, 6),
      parentageSample: parentageChanged.slice(0, 6),
    });
  }

  const report = {
    schemaVersion: "neon-corpus-flywheel.final-audit-fingerprint-delta.v1",
    preSha: PRE_SHA,
    afterSha: execSync("git rev-parse HEAD", { cwd: "/workspace" }).toString().trim(),
    comparedAgainst: "PR #255 tip before final-audit remediation",
    generatedAt: new Date().toISOString(),
    rows,
    totals: {
      beforeErrors: rows.reduce((a, r) => a + r.before.errorCount, 0),
      afterErrors: rows.reduce((a, r) => a + r.after.errorCount, 0),
      added: rows.reduce((a, r) => a + r.added, 0),
      removed: rows.reduce((a, r) => a + r.removed, 0),
      parentageChanged: rows.reduce((a, r) => a + r.parentageChanged, 0),
    },
  };
  writeFileSync(path.join(OUT, "final-audit-fingerprint-delta.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        totals: report.totals,
        rows: rows.map((r) => ({
          key: r.key,
          beforeErrors: r.before.errorCount,
          afterErrors: r.after.errorCount,
          added: r.added,
          removed: r.removed,
          parentageChanged: r.parentageChanged,
        })),
      },
      null,
      2,
    ),
  );
}

main();
