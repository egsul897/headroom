/**
 * Agent 8 — Pending integration risk probe (disposable / read-only vs remote tips).
 *
 * Does NOT modify production. Evaluates whether pending PR tips would reintroduce
 * DEFECT-A8-01 (AVAILABLE + GATE_NOT_SATISFIED) by inspecting capacity status
 * helpers on a worktree tip provided via env, or by documenting main's contract.
 *
 * Usage:
 *   A8_TIP_ROOT=/tmp/a8-wt-243 npx tsx scripts/agent8-independent-adversarial/probe-pending-integration-risk.ts
 *   npx tsx scripts/agent8-independent-adversarial/probe-pending-integration-risk.ts   # main only
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tipRoot = process.env.A8_TIP_ROOT ? path.resolve(process.env.A8_TIP_ROOT) : process.cwd();
const statePath = path.join(tipRoot, "lib/contract-model/runtime/capacity/state.ts");
const typesPath = path.join(tipRoot, "lib/contract-model/runtime/capacity/types.ts");

function fileHas(p: string, needle: string): boolean {
  if (!fs.existsSync(p)) return false;
  return fs.readFileSync(p, "utf8").includes(needle);
}

const hasStatusForAmount = fileHas(statePath, "statusForAmount");
const hasNotSatisfiedEnum = fileHas(typesPath, '"NOT_SATISFIED"');
const statusAssignedViaFloor =
  fileHas(statePath, "statusForAmount(") &&
  (fileHas(statePath, "statusForAmount(\n      remaining") ||
    fileHas(statePath, "statusForAmount(\n      localEffective") ||
    /status\s*=\s*statusForAmount\s*\(/.test(fs.readFileSync(statePath, "utf8")));

let probeOutcome: Record<string, unknown> | null = null;
const probeScript = path.join(tipRoot, "scripts/agent8-independent-adversarial/probe-gate-status.ts");
if (fs.existsSync(probeScript)) {
  const r = spawnSync("npx", ["tsx", probeScript], { cwd: tipRoot, encoding: "utf8", timeout: 60_000 });
  const firstJson = r.stdout?.match(/\{[\s\S]*?\n\}/);
  if (firstJson) {
    try {
      probeOutcome = JSON.parse(firstJson[0]!);
    } catch {
      probeOutcome = { parseError: true, stdoutHead: r.stdout.slice(0, 400) };
    }
  } else {
    probeOutcome = { noJson: true, stderr: r.stderr?.slice(0, 400), status: r.status };
  }
}

const status = (probeOutcome as { status?: string } | null)?.status;
const falseFavorable =
  status === "AVAILABLE" ||
  (!hasStatusForAmount && !hasNotSatisfiedEnum) ||
  !statusAssignedViaFloor;

const report = {
  tipRoot,
  staticAnalysis: {
    hasStatusForAmount,
    hasNotSatisfiedEnum,
    statusAssignedViaFloor,
  },
  probeOutcome,
  contract: {
    // Integration tip must never publish AVAILABLE for GATE_NOT_SATISFIED.
    a8_01_safe: !falseFavorable && status !== "AVAILABLE" && hasStatusForAmount && hasNotSatisfiedEnum,
    falseFavorableRisk: falseFavorable,
  },
  defectIfUnsafe: {
    id: "DEFECT-A8-03",
    title: "Pending integration tip reintroduces AVAILABLE + GATE_NOT_SATISFIED (A8-01 regression)",
    severity: "CRITICAL_FALSE_PERMISSION",
    recommendation:
      "Rebase onto main ≥7f1dd3a2 and preserve statusForAmount + CapacityStatus.NOT_SATISFIED byte-for-byte from #229/#237 before merge",
  },
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.contract.a8_01_safe ? 0 : 2);
