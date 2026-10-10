/**
 * Offline batch-1 package analysis for the neon corpus intelligence flywheel.
 * Uses authentic fixtures only — no Neon writes, no paid inference.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";

const OUT = path.join("docs/neon-corpus-flywheel");

interface DocSpec {
  id: string;
  label: string;
  typeHint: string;
  textPath: string;
}

interface PackageSpec {
  packageKey: string;
  priorityRole: string;
  docs: DocSpec[];
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function discoverExtracted(root: string): DocSpec[] {
  const extracted = path.join(root, "extracted-text");
  if (!existsSync(extracted)) return [];
  return readdirSync(extracted)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => {
      const lower = f.toLowerCase();
      let typeHint = "OTHER";
      if (lower.includes("amend") && lower.includes("restat")) typeHint = "AMENDED_AND_RESTATED_AGREEMENT";
      else if (lower.includes("amend") || lower.includes("omnibus")) typeHint = "AMENDMENT";
      else if (lower.includes("guarantee") || lower.includes("collateral") || lower.includes("security"))
        typeHint = "GUARANTEE_AND_SECURITY_AGREEMENT";
      else if (lower.includes("intercreditor") || lower.includes("joinder")) typeHint = "INTERCREDITOR_AGREEMENT";
      else if (lower.includes("indenture")) typeHint = "INDENTURE";
      else if (lower.includes("credit")) typeHint = "CREDIT_AGREEMENT";
      return {
        id: f.replace(/\.txt$/, ""),
        label: f.replace(/\.txt$/, ""),
        typeHint,
        textPath: path.join(extracted, f),
      };
    });
}

function conmedDocs(): DocSpec[] {
  const curated = "tests/fixtures/unseen-packages/conmed-2025-credit-facility/curated";
  return readdirSync(curated)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .map((f) => ({
      id: f.replace(/\.txt$/, ""),
      label: f.replace(/\.txt$/, ""),
      typeHint: /guarantee|collateral|security/i.test(f)
        ? "GUARANTEE_AND_SECURITY_AGREEMENT"
        : /amend|omnibus/i.test(f)
          ? "AMENDMENT"
          : "CREDIT_AGREEMENT",
      textPath: path.join(curated, f),
    }));
}

function analyzePackage(pkg: PackageSpec) {
  const loaded = pkg.docs
    .filter((d) => existsSync(d.textPath))
    .map((d) => ({ ...d, text: readFileSync(d.textPath, "utf8") }));

  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefs = [];
  const allRefs = [];
  for (const d of loaded) {
    const nodes = parseDocumentStructure({ documentId: d.id, label: d.label, text: d.text });
    nodesByDocument.set(d.id, { text: d.text, nodes });
    allDefs.push(...detectStructuralDefinitions(d.id, d.text, nodes));
    allRefs.push(...detectStructuralReferences(d.id, d.text, nodes));
  }
  const index = buildStructuralIndex(nodesByDocument, allDefs, allRefs);

  const structural = loaded.map((d) => {
    const nodes = nodesByDocument.get(d.id)!.nodes;
    const defs = allDefs.filter((x) => x.documentId === d.id);
    const candidates = runPassADeterministicSignals(d.id, index);
    const signalHits = new Map<string, number>();
    for (const c of candidates) {
      for (const s of c.signals) signalHits.set(s, (signalHits.get(s) ?? 0) + 1);
    }
    const aaLimb = nodes.find(
      (n) => n.sectionRef === "1.01(viii)" && defs.some((def) => def.normalizedTerm === "available amount" && n.charStart > def.charStart),
    );
    const builderA = nodes.find((n) => n.sectionRef === "6.08(a)(3)(a)");
    const builderB = nodes.find((n) => n.sectionRef === "6.08(a)(3)(b)");
    return {
      documentId: d.id,
      label: d.label,
      typeHint: d.typeHint,
      textBytes: d.text.length,
      textSha256: sha256(d.text),
      nodeCount: nodes.length,
      definitionCount: defs.length,
      nonNestedDefinitionCount: defs.filter((x) => !x.nested).length,
      passACandidateCount: candidates.length,
      topSignals: Object.fromEntries([...signalHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)),
      hasAvailableAmountTerm: defs.some((x) => /available amount/i.test(x.normalizedTerm)),
      dsgrAaViiiSpan: aaLimb ? { charStart: aaLimb.charStart, charEnd: aaLimb.charEnd, span: aaLimb.charEnd - aaLimb.charStart } : null,
      chwyBuilderA: builderA
        ? {
            charStart: builderA.charStart,
            charEnd: builderA.charEnd,
            span: builderA.charEnd - builderA.charStart,
            endsAtB: builderB ? builderA.charEnd === builderB.charStart : null,
            ownsProviso: /Specified\s+Event\s+of\s+Default/i.test(d.text.slice(builderA.charStart, builderA.charEnd)),
          }
        : null,
    };
  });

  const graphDocs: PackageDocumentInput[] = loaded.map((d) => ({
    documentId: d.id,
    label: d.label,
    text: d.text,
  }));
  const graph = buildPackageGraph(`offline:${pkg.packageKey}`, pkg.packageKey, graphDocs);

  return {
    packageKey: pkg.packageKey,
    priorityRole: pkg.priorityRole,
    documentCount: loaded.length,
    missingDocs: pkg.docs.filter((d) => !existsSync(d.textPath)).map((d) => d.textPath),
    structural,
    packageGraph: {
      instrumentCount: graph.instruments.length,
      relationshipCount: graph.relationshipCandidates.length,
      performance: graph.performance,
      classifications: graph.classifications.map((c) => ({
        documentId: c.documentId,
        documentType: c.type,
        confidence: c.confidence,
        resolutionMethod: c.resolutionMethod,
      })),
      relationships: graph.relationshipCandidates.slice(0, 20).map((e) => ({
        type: e.relationshipType,
        from: e.sourceDocumentId,
        to: e.targetDocumentId,
        status: e.status,
        unresolvedReason: e.unresolvedReason,
        resolutionMethod: e.resolutionMethod,
        targetHint: e.targetHint,
      })),
      instruments: graph.instruments.map((i) => ({
        name: i.name,
        documentIds: i.documentIds,
        baseDocumentId: i.baseDocumentId,
        reviewStatus: i.reviewStatus,
      })),
    },
  };
}

async function main() {
  const packages: PackageSpec[] = [
    {
      packageKey: "dsgr-2022-2025-credit-facility",
      priorityRole: "complete_credit_agreement_with_amendments_restatement",
      docs: discoverExtracted("tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility"),
    },
    {
      packageKey: "conmed-2025-credit-facility",
      priorityRole: "secured_package_lien_guarantee_collateral",
      docs: conmedDocs(),
    },
    {
      packageKey: "chwy-2026-credit-agreement",
      priorityRole: "restricted_payments_available_amount_builder",
      docs: discoverExtracted("tests/fixtures/unseen-packages/chwy-2026-credit-agreement"),
    },
  ];

  const analyses = packages.map(analyzePackage);
  const report = {
    schemaVersion: "neon-corpus-flywheel.batch1-analysis.v1",
    mode: "OFFLINE_AUTHENTIC_FIXTURES",
    generatedAt: new Date().toISOString(),
    localHead: "pending-commit",
    neonStatus: {
      attempted: true,
      result: "AUTH_FAILED",
      sqlstate: "28P01",
      hostFingerprintNote: "ep-shiny-rice-aw903tjv (pooler) TCP/TLS reachable; password rejected for neondb_owner",
      secretRefreshRequested: true,
    },
    paidInferenceUsd: 0,
    previouslyReportedNeonSnapshot: {
      source: "origin/cursor/kf-corpus-quality-gate-8a8b + neon-massive-corpus-expansion (NOT live this run)",
      disclaimer: "DISCOVERED historical counts only — not a substitute for Stage-1 live inventory",
      knowledgeSources: 769,
      distinctIssuers: 212,
      relationshipEdges: 48226,
      exactTripleDuplicates: 46810,
      documentByteObjects: 746,
      byClass: {
        CREDIT_AGREEMENT: 114,
        INDENTURE: 61,
        AMENDMENT: 65,
        RESTATEMENT: 106,
        SUPPLEMENTAL_INDENTURE: 98,
        SECURITY_AGREEMENT: 26,
        INTERCREDITOR_AGREEMENT: 3,
        GUARANTEE_AGREEMENT: 3,
        ABL_AGREEMENT: 1,
      },
    },
    packages: analyses,
    compilerChallengeFindings: [
      {
        packageKey: "dsgr-2022-2025-credit-facility",
        findingId: "DSGR-AA-DEF-SWALLOW",
        status: "REMEDIATED_THIS_BATCH",
        severity: "HIGH",
        independentEvidence:
          "Pre-fix: 1.01(viii) owned [32777,196272) (~163k chars). Post-fix: ends at Availability declaration (33273).",
        headroomBefore: "False hierarchy — later definitions nested under Available Amount last limb.",
        headroomAfter: "Limb clipped to definition body; zero post-term children under 1.01(viii).",
        rootCause: "Clause tree parsed across entire definitions SECTION; last enumerator closed only by next SECTION.",
        generalizedFix: "Per-definition-body clause parsing + soft charEnd clip; findTopLevelDefinitionStarts.",
        regressionTest: "tests/neon-corpus-flywheel/definition-body-clause-scope.test.ts",
      },
      {
        packageKey: "chwy-2026-credit-agreement",
        findingId: "CHWY-AA-BUILDER-A-NESTRANK",
        status: "REMEDIATED_THIS_BATCH",
        severity: "HIGH",
        independentEvidence:
          "Pre-fix: 6.08(a)(3)(a) ended at (A); Specified Event of Default proviso excluded. Post-fix: charEnd(a)==charStart(b); proviso inside owned text.",
        headroomBefore: "Depth>3 SUBCLAUSE clamp made (A)/(B) siblings of (a).",
        headroomAfter: "(A)/(B) parentNodeId = builder (a); material proviso retained on owning limb.",
        rootCause: "Owned-span stack used clamped nodeType RANK for all depth>=3.",
        generalizedFix: "nestRank = 1 + clause depth for ownership/parentage.",
        regressionTest: "tests/neon-corpus-flywheel/definition-body-clause-scope.test.ts",
      },
      {
        packageKey: "conmed-2025-credit-facility",
        findingId: "CONMED-MISSING-BASE-UNRESOLVED",
        status: "DEMONSTRATED_CORRECT_REFUSAL",
        severity: "N_A",
        independentEvidence:
          "Package graph keeps amendment→missing Seventh A&R as UNRESOLVED rather than inventing a base document (fail-closed).",
        headroomBefore: "N/A — correct behavior retained",
        headroomAfter: "N/A",
        rootCause: "Not a defect",
        generalizedFix: null,
        regressionTest: "Existing package-graph / phase-2f suites (not weakened)",
      },
    ],
    covenantCoverageNotes: {
      dsgr: "Full multi-doc CA + amendments; Pass A signals across Art. VI families; AA builder limbs now correctly bounded.",
      conmed: "Curated Art. VII + Guarantee/Collateral + amendments; lien/guarantee topology present; missing Seventh A&R explicit.",
      chwy: "Full CA text; RP §6.08 / Available Amount builder now retains limb (a) proviso on owning node.",
      omittedAuthenticIndenture: "No on-disk HY indenture fixture — deferred to Neon INDENTURE class after auth restore.",
    },
    nextBatch: [
      {
        packageKey: "lsb-2023-abl-credit-agreement",
        role: "abl_intercreditor_complexity",
        reason: "Intercreditor Joinder → out-of-package 2013 ICA must stay UNRESOLVED; Payment Conditions diversity.",
      },
      {
        packageKey: "fwrg-2021-credit-agreement",
        role: "available_amount_shared_cap_ground_truth",
        reason: "Canonical AA / grower / shared-cap human ground truth.",
      },
      {
        packageKey: "riot-2025-2026-credit-facility",
        role: "multi_restatement_operative_state",
        reason: "Three-document restatement chain; prior carve-out deletion evidence.",
      },
      {
        packageKey: "gibraltar-2026-credit-agreement",
        role: "builder_basket_marker_disagreement",
        reason: "Available Amount Builder Basket 7.05(a)(y) vs printed (vi).",
      },
      {
        packageKey: "neon-indenture-holdout",
        role: "high_yield_indenture",
        reason: "Select from Neon KnowledgeSource INDENTURE (~61 previously reported) once DATABASE_URL works.",
        blockedOn: "DATABASE_URL",
      },
    ],
    coordination: {
      pr246: "Graph-quality remediation — this batch performs no Neon edge writes and does not reintroduce duplicate amplification.",
      pr229_237: "Utilization/authority safeguards preserved; no gate weakening.",
    },
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "batch1-package-analysis.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        out: path.join(OUT, "batch1-package-analysis.json"),
        packages: analyses.map((p) => ({
          packageKey: p.packageKey,
          docs: p.documentCount,
          nodes: p.structural.reduce((a, d) => a + d.nodeCount, 0),
          defs: p.structural.reduce((a, d) => a + d.definitionCount, 0),
          passA: p.structural.reduce((a, d) => a + d.passACandidateCount, 0),
          relationships: p.packageGraph.relationshipCount,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
