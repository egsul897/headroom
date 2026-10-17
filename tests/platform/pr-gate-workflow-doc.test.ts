import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const doc = fs.readFileSync(path.join(ROOT, "docs/platform/pr-gate.workflow.yml"), "utf8");

describe("docs/platform/pr-gate.workflow.yml (proposed pr-gate revision)", () => {
  it("is not marked inactive", () => {
    expect(doc).not.toMatch(/NOT ACTIVE/);
  });
  it("reads every gate tool from the BASE ref, never runs a PR copy without a bootstrap warning", () => {
    expect(doc).toContain('git show "origin/$REF_NAME:scripts/platform/$f"');
    expect(doc).toContain("::warning title=pr-gate bootstrap::");
    expect(doc).not.toMatch(/node "?scripts\/platform\//);
    const tools = [...doc.matchAll(/\$RUNNER_TEMP\/gate\/([\w.-]+\.mjs)/g)].map((m) => m[1]!);
    expect(new Set(tools)).toEqual(new Set(["pr-gate-compare.mjs", "pr-gate-reporter.mjs", "protected-paths.mjs", "clean-tree.mjs"]));
    for (const t of tools) expect(fs.existsSync(path.join(ROOT, "scripts/platform", t)), t).toBe(true);
    const loop = (/for f in ([^;]+); do/.exec(doc)?.[1] ?? "").trim().split(/\s+/);
    expect(new Set(loop)).toEqual(new Set(tools));
  });
  it("runs the protected-path check with the PR labels and re-runs on label changes", () => {
    expect(doc).toContain("PR_LABELS: ${{ toJSON(github.event.pull_request.labels.*.name) }}");
    expect(doc).toMatch(/protected-paths\.mjs" --base "origin\/\$REF_NAME"/);
    expect(doc).toMatch(/types: \[[^\]]*\blabeled\b[^\]]*\bunlabeled\b/);
  });
  it("fails when the PR test run leaves the tree dirty, and resets after the base run", () => {
    const head = doc.indexOf('PR_GATE_REPORT="$RUNNER_TEMP/pr-gate-head.json"');
    const clean = doc.indexOf('clean-tree.mjs" --label "the PR test run"');
    expect(head).toBeGreaterThan(0);
    expect(clean).toBeGreaterThan(head);
    expect(doc).toContain("git status --porcelain");
    expect(doc).toContain("git reset --hard --quiet");
    expect(doc).toContain("git clean -fdq");
  });
});
