/** Runs the mutation suite over the pinned corpus and writes docs/product-readiness/mutation-runs/<sha12>/mutations.{json,md}. */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadCorpus, loadPackage, corpusIdentity } from "./corpus";
import { MUTATIONS, observeMutation, renderMutationReport } from "./mutations";

(async () => {
  const sha = (process.env.HEADROOM_SHA ?? execSync("git rev-parse HEAD", { encoding: "utf8" }).trim());
  const obs = [];
  for (const m of MUTATIONS) obs.push(await observeMutation(loadPackage(m.packageId), m));
  const dir = path.resolve(__dirname, "../../docs/product-readiness/mutation-runs", sha.slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  const summary = {
    sha, generatedAt: new Date().toISOString(), corpus: corpusIdentity(loadCorpus()), mutations: MUTATIONS.length,
    killed: obs.filter((o) => o.kill.verdict === "KILLED").length, survived: obs.filter((o) => o.kill.verdict === "SURVIVED").map((o) => `${o.mutationId} (${o.kill.predicted})`),
    predictionsHeld: obs.filter((o) => o.kill.predictionHeld).length,
    harnessVerdicts: { pass: obs.flatMap((o) => o.verdicts).filter((v) => v.kind === "HARNESS" && v.ok).length, fail: obs.flatMap((o) => o.verdicts).filter((v) => v.kind === "HARNESS" && !v.ok).length },
    productVerdicts: { pass: obs.flatMap((o) => o.verdicts).filter((v) => v.kind === "PRODUCT" && v.ok).length, fail: obs.flatMap((o) => o.verdicts).filter((v) => v.kind === "PRODUCT" && !v.ok).map((v) => `${v.ref} [${v.severity}]`) },
    identity: obs.map((o) => ({ id: o.mutationId, ...o.nodeIdSurvival })),
  };
  fs.writeFileSync(path.join(dir, "mutations.json"), JSON.stringify({ summary, observations: obs }, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "mutations.md"), renderMutationReport(obs, sha) + "\n");
  console.log(JSON.stringify(summary, null, 1));
  console.log(`written: ${path.relative(process.cwd(), dir)}`);
})();
