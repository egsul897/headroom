import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { probeLiveFalsePermission } from "../../lib/evaluation/ckg-benchmark/live-false-permission";

const report = probeLiveFalsePermission();
const outDir = path.resolve("docs/intelligence-factory/cycle-3");
mkdirSync(outDir, { recursive: true });
const payload = {
  schemaVersion: "intelligence-factory.false-permission-forensic.v1",
  generatedAt: new Date().toISOString(),
  adversarialControl: {
    numeratorFailures: 1,
    denominatorEvaluated: 2,
    incidence: 0.5,
    failingCaseId: "syn-false-perm-general-prohibition",
    successCaseId: "syn-false-perm-carveout-present",
    predictionSource: "SYNTHETIC_ADVERSARIAL_OUTPUT",
    fixturePath: "tests/fixtures/covenant-knowledge-generalization/system-outputs/synthetic-offline.json",
    isInjectedAdversarialFailure: true,
    representsLiveProductionPath: false,
    note: "The FAILURE is an intentionally injected {permitted:true,status:PERMITTED} used to prove the CKG scorer can detect false permissions. It is not Headroom live output.",
  },
  liveProductionPath: {
    numeratorFailures: report.incidence.failures,
    denominatorEvaluated: report.incidence.evaluated,
    incidence: report.incidence.rate,
    outcomes: report.outcomes,
    certificationGatesPreventCustomerExecutable: report.outcomes.every((o) => o.gateBlocksCustomerExecutable),
    releaseBlocking: report.incidence.failures > 0,
  },
  adversarialControlNote: report.adversarialControlNote,
};
writeFileSync(path.join(outDir, "false-permission-forensic.json"), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
