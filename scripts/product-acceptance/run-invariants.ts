/** Runs the invariant checks and writes docs/product-readiness/invariant-runs/<sha12>/invariants.{json,md}. */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { renderInvariants, runInvariants } from "./invariants";
(async () => {
  const sha = process.env.HEADROOM_SHA ?? execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const results = await runInvariants();
  const dir = path.resolve(__dirname, "../../docs/product-readiness/invariant-runs", sha.slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  const all = results.flatMap((r) => r.verdicts.map((v) => ({ ...v, invariant: r.id, packageId: r.packageId })));
  const summary = { sha, generatedAt: new Date().toISOString(), invariants: results.length, product: { pass: all.filter((v) => v.kind === "PRODUCT" && v.ok).length, fail: all.filter((v) => v.kind === "PRODUCT" && !v.ok).map((v) => `${v.packageId}|${v.ref} [${v.severity}]`) }, observations: all.filter((v) => v.kind === "OBSERVATION").map((v) => `${v.ref}: ${v.ok}`) };
  fs.writeFileSync(path.join(dir, "invariants.json"), JSON.stringify({ summary, results }, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "invariants.md"), renderInvariants(results, sha) + "\n");
  console.log(JSON.stringify(summary, null, 1)); console.log(`written: ${path.relative(process.cwd(), dir)}`);
})();
