/**
 * Stage D probe — pkg-i-secured-debt-lien offline derive + enumeration honesty.
 *
 * Documents which candidates CERTIFY, whether SECURED_DEBT can claim dual debt∩lien
 * paths, and why positive execution remains blocked when 7.01 debt is REVIEW_REQUIRED.
 * Zero paid providers. No FIXTURE_IR invention.
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

const OUT = "docs/product/customer-workflow/stage-d-pkgi-secured-lien";
const PACKAGE_ID = "pkg-i-secured-debt-lien";

function write(name: string, value: unknown): void {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const pkg = loadPackage(PACKAGE_ID);
  const stages = await runDeterministicStages(pkg);
  const sem = await runSemanticStage(pkg, stages);
  if (!sem.faithful) {
    write("00-blocker-report.md", `# Stage D probe refused\n\n${sem.faithfulError ?? "no faithful run"}\n`);
    process.exit(2);
  }

  const candidateRows = sem.faithful.results.map((r) => {
    const ruleUnit = r.verifiedPackage?.units.find((u) => u.kind === "RULE");
    const unit = ruleUnit?.unit as { sourceSectionRef?: string; action?: string; sufficiency?: string } | undefined;
    return {
      sourceSectionRef: unit?.sourceSectionRef ?? null,
      action: unit?.action ?? null,
      sufficiency: unit?.sufficiency ?? null,
      certification: r.certification?.status ?? null,
      blockers: (r.certification?.blockers ?? []).map((b) => ("code" in b ? b.code : String(b))),
    };
  });

  const artifacts: CertifiedCandidateArtifacts[] = [];
  for (const r of sem.faithful.results) {
    if (r.certification?.status !== "CERTIFIED" || !r.verifiedPackage) continue;
    artifacts.push({
      certification: r.certification,
      verifiedPackage: serializeVerifiedUnitPackage(r.verifiedPackage),
    });
  }

  const adapter = certifiedMapToVerifiedExecutionPackage(artifacts);
  write("01-candidates.json", {
    schema: "stage-d-pkgi-candidates.v1",
    paidProvidersCalled: false,
    packageId: PACKAGE_ID,
    candidateRows,
    certifiedCount: artifacts.length,
  });

  if (adapter.outcome !== "DERIVED") {
    write("00-blocker-report.md", `# Stage D VEP refused\n\n${JSON.stringify(adapter, null, 2)}\n`);
    process.exit(2);
  }

  write("verified-execution-package.json", adapter.package);

  const enumUnsecured = enumerateCertifiedPaths({
    verifiedPackage: adapter.package,
    transactionKind: "UNSECURED_DEBT",
    secured: false,
  });
  const enumSecured = enumerateCertifiedPaths({
    verifiedPackage: adapter.package,
    transactionKind: "SECURED_DEBT",
    secured: true,
  });

  write("02-phase4e-enumeration.json", {
    schema: "stage-d-pkgi-phase4e.v1",
    paidProvidersCalled: false,
    packageId: PACKAGE_ID,
    results: [
      {
        transactionKind: "UNSECURED_DEBT",
        authority: enumUnsecured.authority,
        incompleteReasons: enumUnsecured.incompleteReasons,
        unsupportedReasons: enumUnsecured.unsupportedReasons,
        paths: enumUnsecured.paths.map((p) => ({
          pathId: p.pathId,
          status: p.status,
          action: p.action,
          sourceSectionRef: p.sourceSectionRef,
        })),
      },
      {
        transactionKind: "SECURED_DEBT",
        authority: enumSecured.authority,
        incompleteReasons: enumSecured.incompleteReasons,
        unsupportedReasons: enumSecured.unsupportedReasons,
        paths: enumSecured.paths.map((p) => ({
          pathId: p.pathId,
          status: p.status,
          action: p.action,
          sourceSectionRef: p.sourceSectionRef,
        })),
      },
    ],
    note:
      "Only §7.02 lien candidates CERTIFY offline today. SECURED_DEBT must stay INCOMPLETE_PACKAGE until a CERTIFIED debt primary (e.g. 7.01(b)) is in the VEP.",
  });

  const debtCertified = candidateRows.some(
    (c) => c.certification === "CERTIFIED" && (c.action === "INCUR_DEBT" || c.action === "INCUR_SECURED_DEBT"),
  );
  const lienCertified = candidateRows.some(
    (c) => c.certification === "CERTIFIED" && (c.action === "CREATE_LIEN" || c.action === "GRANT_COLLATERAL"),
  );

  const report = [
    "# Stage D probe — pkg-i-secured-debt-lien",
    "",
    "**Verdict:** positive dual-path execution **BLOCKED** (debt primary not CERTIFIED). Enumeration honesty **PASS** — lien-only VEP does not claim SECURED_DEBT CERTIFIED_4E.",
    "",
    "| Field | Value |",
    "|---|---|",
    `| Package | \`${PACKAGE_ID}\` (synthetic; acceptance offline) |`,
    `| CERTIFIED candidates | ${artifacts.length} |`,
    `| Debt CERTIFIED | ${debtCertified ? "yes" : "**no**"} |`,
    `| Lien CERTIFIED | ${lienCertified ? "yes (§7.02 family)" : "no"} |`,
    `| SECURED_DEBT authority | **${enumSecured.authority}** |`,
    `| SECURED incomplete | ${enumSecured.incompleteReasons.join(", ") || "none"} |`,
    `| SECURED path count | ${enumSecured.paths.length} |`,
    "",
    "## Candidate certification (offline acceptance)",
    "",
    ...candidateRows.map(
      (c) =>
        `- \`${c.sourceSectionRef ?? "?"}\` action=${c.action ?? "n/a"} → **${c.certification}**` +
        (c.blockers.length ? ` [${c.blockers.join(", ")}]` : ""),
    ),
    "",
    "## Why not execute",
    "",
    "Stage D requires debt ∩ lien. Offline, only the §7.02 lien section CERTIFIES. §7.01(b) stays REVIEW_REQUIRED (`COMPILATION_NOT_COMPLETED`, `UNIT_SUFFICIENCY_INCOMPLETE` with a PARTIAL sibling unit). §9.15 secured cap stays REVIEW_REQUIRED. Inventing debt CERTIFIED status or FIXTURE_IR would be a false permission.",
    "",
    "## Enumeration honesty (this cycle)",
    "",
    "Before: a lien-only DERIVED VEP enumerated SECURED_DEBT as `CERTIFIED_4E` with `path:restriction:*` CANDIDATE rows despite `NO_MATCHING_PRIMARY_RULES_FOR_SECURED_DEBT`.",
    "After: companion liens surface only when a debt primary exists; missing primary forces `INCOMPLETE_PACKAGE` and zero secured grant paths.",
    "",
    "## Safety",
    "",
    "- No paid inference; no FIXTURE_IR; CFP target 0; gates not weakened.",
    "",
  ].join("\n");

  write("00-probe-report.md", report);
  console.log(report);

  if (enumSecured.authority === "CERTIFIED_4E") {
    console.error("FALSE COMPLETENESS: lien-only package must not claim CERTIFIED_4E for SECURED_DEBT");
    process.exit(2);
  }
  if (!enumSecured.incompleteReasons.includes("NO_MATCHING_PRIMARY_RULES_FOR_SECURED_DEBT")) {
    console.error("expected NO_MATCHING_PRIMARY_RULES_FOR_SECURED_DEBT");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
