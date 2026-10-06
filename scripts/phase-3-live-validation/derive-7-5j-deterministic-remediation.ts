/**
 * Writes the offline BEFORE/AFTER evidence of the §7.5(j) live-exposed deterministic defect closure (defects A-D) into a
 * NEW directory. Reads the frozen live artifacts only (hash-pinned); never rewrites them; zero provider calls.
 *
 *   npx tsx scripts/phase-3-live-validation/derive-7-5j-deterministic-remediation.ts [--out <dir>]
 */
import fs from "node:fs";
import path from "node:path";
import { replayFrozen75j } from "./replay-7-5j-deterministic";
import { scanForSecrets } from "../p3-conmed-pilot/evidence";

const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length) ?? (process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : undefined);
const OUT = outArg ?? "docs/phase-3-live-validation/7.5j-deterministic-remediation";
if (path.resolve(OUT).startsWith(path.resolve("docs/phase-3-live-validation/7.5j-end-to-end-certification")) || /7\.2c-/.test(OUT)) throw new Error(`refusing to write into immutable live evidence ${OUT}`);
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length > 0) throw new Error(`refusing to write into ${OUT}: already populated; pass --out <new directory>`);
function write(name: string, value: unknown): void {
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const hits = scanForSecrets(body);
  if (hits.length > 0) throw new Error(`refusing to write ${name}: credential-shaped content at ${JSON.stringify(hits)}`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), body);
}

async function main(): Promise<void> {
  const r = await replayFrozen75j();
  write("00-frozen-inputs.json", { frozenDirectory: "docs/phase-3-live-validation/7.5j-end-to-end-certification", hashes: r.hashes, target: r.target, frozenRawModelOutputSha256: r.frozenRawModelHash, frozenInventoryContentHash: r.frozenInventoryHash, versions: r.versions, providerCalls: 0, reviewer: "scripted zero findings (the live reviewer's recorded result); deterministic layers only" });
  write("01-defect-a-coverage.json", r.defectA);
  write("02-defect-b-quantitative.json", r.defectB);
  write("03-defect-c-action.json", r.defectC);
  write("04-defect-d-timing.json", r.defectD);
  write("05-accountability-before-after.json", r.accountability);
  write("06-verification-before-after.json", r.verification);
  write("07-certification-before-after.json", r.certification);
  write("08-residual-genuine-blockers.json", r.residual);
  write("09-replayed-rule.json", r.rule);
  write("10-replayed-projection.json", r.projection);
  console.log(JSON.stringify({ wrote: OUT, A: r.defectA.after.unaccountedSource, B: r.defectB.after.map((i) => i.values), C: [r.defectC.after.leadInClassification.canonicalAction, r.defectC.after.compatibilityWithSellAsset.compatibility, r.defectC.after.sufficiency], D: (r.defectD.after.ctaNode as { kind: string; asOfDate?: string } | null)?.kind, accountability: r.accountability.after.failureReasons, status: r.accountability.after.status, verification: r.verification.after.status, findings: r.verification.after.findings, certification: r.certification.after.status, blockers: r.certification.after.blockers.map((b) => b[0]) }, null, 1));
}
main().catch((err) => { console.error(err); process.exit(1); });
