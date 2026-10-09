/**
 * Derive a VerifiedExecutionPackage from product-acceptance CERTIFIED candidates
 * (deterministic gates + silent mocked Layer-2) for packages that already certify
 * under offline acceptance — using certifyDiscoveredCovenantPackage →
 * certifiedMapToVerifiedExecutionPackage → enumerateCertifiedPaths.
 *
 * Does NOT claim live/authentic CONMED CERTIFIED. For that path see
 * attempt-authenticated-vep.ts (currently REFUSED NO_CERTIFIED_ARTIFACTS).
 * Never invents FIXTURE_IR. Never calls paid providers.
 */
import fs from "node:fs";
import path from "node:path";
import { loadPackage } from "../product-acceptance/corpus";
import { runDeterministicStages } from "../product-acceptance/stages";
import { runSemanticStage } from "../product-acceptance/semantic-stage";
import {
  certifiedMapToVerifiedExecutionPackage,
  type CertifiedCandidateArtifacts,
} from "../../lib/contract-model/phase3-certification/phase4-adapter";
import { serializeVerifiedUnitPackage } from "../../lib/contract-model/verified-units";
import { enumerateCertifiedPaths } from "../../lib/product/north-star-workflow/verified-path-enumeration";

const ELIGIBLE_PACKAGES = [
  "pkg-n-clean-ratio",
  "pkg-a-basic-credit-agreement",
  "pkg-j-restricted-payments-builder",
  "pkg-c-amendment-supersession",
] as const;

async function deriveForPackage(packageId: string) {
  const pkg = loadPackage(packageId);
  const stages = await runDeterministicStages(pkg);
  const sem = await runSemanticStage(pkg, stages);
  if (!sem.faithful) return { packageId, error: sem.faithfulError ?? "no faithful run", adapter: null, phase4e: null, certified: 0 };
  const artifacts: CertifiedCandidateArtifacts[] = [];
  for (const r of sem.faithful.results) {
    if (r.certification?.status !== "CERTIFIED" || !r.verifiedPackage) continue;
    artifacts.push({
      certification: r.certification,
      verifiedPackage: serializeVerifiedUnitPackage(r.verifiedPackage),
    });
  }
  const adapter = certifiedMapToVerifiedExecutionPackage(artifacts);
  const phase4e =
    adapter.outcome === "DERIVED"
      ? enumerateCertifiedPaths({ verifiedPackage: adapter.package, transactionKind: "INCUR_DEBT", secured: false })
      : enumerateCertifiedPaths({ verifiedPackage: null, transactionKind: "INCUR_DEBT", secured: false });
  return {
    packageId,
    certified: artifacts.length,
    included: adapter.outcome === "DERIVED" ? adapter.included : adapter.included,
    adapterOutcome: adapter.outcome,
    refusals: adapter.outcome === "REFUSED" ? adapter.refusals : [],
    adapter,
    phase4e,
  };
}

async function main() {
  const outDir = path.join(process.cwd(), "docs/product/customer-workflow/acceptance-certified-vep");
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const id of ELIGIBLE_PACKAGES) {
    const r = await deriveForPackage(id);
    results.push({
      packageId: r.packageId,
      certified: r.certified,
      adapterOutcome: r.adapterOutcome,
      refusals: r.refusals,
      included: r.included,
      phase4eAuthority: r.phase4e?.authority,
      phase4ePathCount: r.phase4e?.paths.length ?? 0,
      error: "error" in r ? r.error : undefined,
    });
    if (r.adapter?.outcome === "DERIVED") {
      const pkgDir = path.join(outDir, id);
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "verified-execution-package.json"), `${JSON.stringify(r.adapter.package, null, 2)}\n`);
      fs.writeFileSync(path.join(pkgDir, "phase4e-enumeration.json"), `${JSON.stringify(r.phase4e, null, 2)}\n`);
      console.log(`DERIVED ${id}: ${r.adapter.included.length} candidates → ${path.relative(process.cwd(), pkgDir)} (4E ${r.phase4e?.authority}, ${r.phase4e?.paths.length ?? 0} paths)`);
    } else {
      console.log(`REFUSED ${id}: certified=${r.certified} ${(r.refusals ?? []).map((x) => x.code).join(",") || r.error || ""}`);
    }
  }
  const summary = {
    schema: "acceptance-certified-vep.v1",
    paidProvidersCalled: false,
    fixtureIrInvented: false,
    authenticLiveCertifiedClaimed: false,
    note: "VEPs derived from product-acceptance CERTIFIED candidates (deterministic gates; Layer-2 mocked silent). Not live/authentic CONMED CERTIFIED.",
    packages: results,
  };
  fs.writeFileSync(path.join(outDir, "00-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), outDir)}`);
  const derived = results.filter((r) => r.adapterOutcome === "DERIVED");
  process.exit(derived.length > 0 ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
