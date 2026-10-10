/**
 * Product Proof 002 — issuer-agnostic frozen-package compile runner.
 *
 * Usage:
 *   npx tsx scripts/product-proof/run-002-compile-package.ts \
 *     --companyId=pp002-mtn --packageKey=mtn-2026-tenth-ar \
 *     --out=docs/product-proof/002/artifacts/mtn-regression \
 *     --doc=docId=path/to.txt[:label]
 *
 * Or load a manifest JSON:
 *   npx tsx scripts/product-proof/run-002-compile-package.ts --manifest=path/to/manifest.json
 *
 * Manifest shape:
 * {
 *   "companyId": "...",
 *   "packageKey": "...",
 *   "instrumentKey": "optional",
 *   "documents": [{ "documentId", "label", "textPath" }]
 * }
 */
import fs from "node:fs";
import path from "node:path";
import { compileFrozenDebtPackage } from "../../lib/contract-model/analysis/offline-package-compile";

interface ManifestDoc {
  documentId: string;
  label: string;
  textPath: string;
}

interface Manifest {
  companyId: string;
  packageKey: string;
  instrumentKey?: string;
  documents: ManifestDoc[];
}

function parseArgs(argv: string[]) {
  const out: { manifest?: string; outDir?: string; companyId?: string; packageKey?: string; instrumentKey?: string; docs: { documentId: string; path: string; label: string }[]; authorizePaid?: boolean } = {
    docs: [],
  };
  for (const a of argv) {
    if (a.startsWith("--manifest=")) out.manifest = a.slice("--manifest=".length);
    else if (a.startsWith("--out=")) out.outDir = a.slice("--out=".length);
    else if (a.startsWith("--companyId=")) out.companyId = a.slice("--companyId=".length);
    else if (a.startsWith("--packageKey=")) out.packageKey = a.slice("--packageKey=".length);
    else if (a.startsWith("--instrumentKey=")) out.instrumentKey = a.slice("--instrumentKey=".length);
    else if (a.startsWith("--doc=")) {
      // docId=path or docId=path:label
      const rest = a.slice("--doc=".length);
      const eq = rest.indexOf("=");
      if (eq < 0) throw new Error(`--doc expects docId=path[:label], got ${a}`);
      const documentId = rest.slice(0, eq);
      const pathAndLabel = rest.slice(eq + 1);
      const colon = pathAndLabel.indexOf(":");
      // Allow Windows paths — only treat colon after .txt/.htm as label sep when path exists
      let filePath = pathAndLabel;
      let label = documentId;
      if (colon > 0 && fs.existsSync(pathAndLabel.slice(0, colon))) {
        filePath = pathAndLabel.slice(0, colon);
        label = pathAndLabel.slice(colon + 1);
      } else if (!fs.existsSync(pathAndLabel) && colon > 0) {
        // label after last colon if file without label doesn't exist
        const lastColon = pathAndLabel.lastIndexOf(":");
        const maybePath = pathAndLabel.slice(0, lastColon);
        if (fs.existsSync(maybePath)) {
          filePath = maybePath;
          label = pathAndLabel.slice(lastColon + 1);
        }
      }
      out.docs.push({ documentId, path: filePath, label });
    } else if (a === "--authorize-paid") out.authorizePaid = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let companyId = args.companyId;
  let packageKey = args.packageKey;
  let instrumentKey = args.instrumentKey;
  const documents: { documentId: string; label: string; text: string }[] = [];

  if (args.manifest) {
    const manifest = JSON.parse(fs.readFileSync(args.manifest, "utf8")) as Manifest;
    companyId = manifest.companyId;
    packageKey = manifest.packageKey;
    instrumentKey = manifest.instrumentKey;
    const base = path.dirname(args.manifest);
    for (const d of manifest.documents) {
      const textPath = path.isAbsolute(d.textPath) ? d.textPath : path.join(base, d.textPath);
      documents.push({
        documentId: d.documentId,
        label: d.label,
        text: fs.readFileSync(textPath, "utf8"),
      });
    }
  }

  for (const d of args.docs) {
    documents.push({
      documentId: d.documentId,
      label: d.label,
      text: fs.readFileSync(d.path, "utf8"),
    });
  }

  if (!companyId || !packageKey || documents.length === 0) {
    console.error("Usage: --manifest=... OR --companyId= --packageKey= --doc=id=path [--out=dir]");
    process.exit(2);
  }

  const outDir = args.outDir ?? path.join("docs/product-proof/002/artifacts", packageKey);
  fs.mkdirSync(outDir, { recursive: true });

  const started = Date.now();
  const result = await compileFrozenDebtPackage({
    companyId,
    packageKey,
    instrumentKey,
    documents,
    authorizePaidInference: Boolean(args.authorizePaid),
  });
  const wallMs = Date.now() - started;

  const verifiedExecutableUnits = result.units.filter((u) => u.executableAuthority === "VERIFIED_EXECUTABLE");
  const summary = {
    wallMs,
    version: result.version,
    companyId: result.companyId,
    packageKey: result.packageKey,
    instrumentKey: result.instrumentKey,
    paidInferenceUsed: result.paidInferenceUsed,
    stages: result.stages,
    summary: result.summary,
    humanInterventions: result.humanInterventions,
    exceptionCatalogTerms: result.exceptionCatalogs.map((c) => ({
      term: c.termExact,
      clauses: c.clauses.length,
      supportStatus: c.supportStatus,
      prohibitionRefs: c.referencedFromProhibitionRefs,
      crossLinks: c.crossDefinitionLinks.length,
    })),
    unitSupportBreakdown: result.units.reduce<Record<string, number>>((acc, u) => {
      acc[u.supportStatus] = (acc[u.supportStatus] ?? 0) + 1;
      return acc;
    }, {}),
    fixedDollarVerticalSlice: {
      attempted: result.fixedDollarResults.length,
      verifiedExecutable: verifiedExecutableUnits.length,
      productionCapacityRefused: verifiedExecutableUnits.filter((u) => u.fixedDollarSlice?.productionRefusal).length,
      units: verifiedExecutableUnits.map((u) => ({
        sourceRef: u.sourceRef,
        classification: u.fixedDollarSlice?.classification ?? null,
        fidelityVerdict: u.fixedDollarSlice?.fidelityVerdict ?? null,
        capacityOutcome: u.fixedDollarSlice?.capacityOutcome ?? null,
        availableAmountUsd: u.fixedDollarSlice?.availableAmountUsd ?? null,
        productionRefusal: u.fixedDollarSlice?.productionRefusal ?? null,
      })),
    },
  };

  fs.writeFileSync(path.join(outDir, "compile-summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(outDir, "exception-catalogs.json"),
    JSON.stringify(
      result.exceptionCatalogs.map((c) => ({
        ...c,
        candidates: c.candidates.map((x) => ({
          discoveryId: x.discoveryId,
          role: x.role,
          normalizedSourceRef: x.normalizedSourceRef,
          description: x.description,
        })),
      })),
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(outDir, "units.json"),
    JSON.stringify(
      result.units.map((u) => ({
        ...u,
        // Keep operative text but bound size already applied
      })),
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(outDir, "candidates.json"),
    JSON.stringify(
      result.candidates.map((c) => ({
        discoveryId: c.discoveryId,
        documentId: c.documentId,
        role: c.role,
        families: c.families,
        normalizedSourceRef: c.normalizedSourceRef,
        description: c.description,
        evidenceSignals: c.evidenceSignals,
      })),
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(outDir, "fixed-dollar-results.json"),
    JSON.stringify(
      result.fixedDollarResults.map((r) => ({
        sourceRef: r.sourceRef,
        executableClass: r.compile.executableClass,
        classification: r.compile.classification.class,
        amountUsd: r.compile.classification.amountUsd,
        residuals: r.compile.classification.residuals,
        fidelityVerdict: r.evaluation.fidelity.verdict,
        outcomeLabel: r.evaluation.outcomeLabel,
        availableAmountUsd: r.evaluation.availableAmountUsd,
        productionRefusal: r.evaluation.productionRefusal,
        capacityOutcome: r.evaluation.capacity?.outcome ?? null,
        ruleId: r.compile.rule?.ruleId ?? null,
        sufficiency: r.compile.rule?.sufficiency ?? null,
      })),
      null,
      2,
    ),
  );

  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote artifacts to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
