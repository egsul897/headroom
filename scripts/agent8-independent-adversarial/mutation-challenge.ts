/**
 * Agent 8 — Mutation detection challenge (isolated temp tree only).
 *
 * Deliberately removes statusForAmount from a TEMPORARY copy of capacity/state.ts,
 * proves probe-gate-status detects AVAILABLE+GATE_NOT_SATISFIED, then discards the copy.
 * Never writes defects into the repo working tree.
 *
 * Usage: npx tsx scripts/agent8-independent-adversarial/mutation-challenge.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "a8-mutation-"));

function cpDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git" || ent.name === ".next") continue;
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) cpDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// Minimal copy: production capacity + probe deps
const need = [
  "lib/contract-model",
  "lib/decimal.ts",
  "scripts/agent8-independent-adversarial",
  "package.json",
  "tsconfig.json",
  "node_modules",
];
for (const n of need) {
  const s = path.join(repoRoot, n);
  const d = path.join(tmp, n);
  if (!fs.existsSync(s)) continue;
  if (n === "node_modules") {
    fs.symlinkSync(s, d, "junction");
    continue;
  }
  if (fs.statSync(s).isDirectory()) cpDir(s, d);
  else {
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.copyFileSync(s, d);
  }
}

const stateFile = path.join(tmp, "lib/contract-model/runtime/capacity/state.ts");
let src = fs.readFileSync(stateFile, "utf8");
const before = src.includes("statusForAmount");
// Mutate: collapse statusForAmount to identity (removes GATE_NOT_SATISFIED floor)
src = src.replace(
  /const statusForAmount = \(amount: CapacityAmount, base: CapacityStatus\): CapacityStatus =>\s*amount\.kind === "GATE_NOT_SATISFIED" \? worst\(\[base, "NOT_SATISFIED"\]\) : base;/,
  'const statusForAmount = (_amount: CapacityAmount, base: CapacityStatus): CapacityStatus => base; // A8 MUTATION',
);
fs.writeFileSync(stateFile, src);
const mutated = fs.readFileSync(stateFile, "utf8").includes("A8 MUTATION");

const probe = spawnSync("npx", ["tsx", "scripts/agent8-independent-adversarial/probe-gate-status.ts"], {
  cwd: tmp,
  encoding: "utf8",
  timeout: 60_000,
});
const m = probe.stdout?.match(/"status": "([^"]+)"/);
const status = m?.[1] ?? "PARSE_FAIL";
const detected = status === "AVAILABLE";

const report = {
  mutationApplied: before && mutated,
  probeStatusAfterMutation: status,
  detection: {
    expectedDefectSignal: "AVAILABLE",
    detected,
    mutationDetectionRate: detected ? 1 : 0,
  },
  note: "Temp tree discarded; production tree untouched",
  tmp,
};

console.log(JSON.stringify(report, null, 2));
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* best-effort cleanup */
}
process.exit(detected && mutated ? 0 : 1);
