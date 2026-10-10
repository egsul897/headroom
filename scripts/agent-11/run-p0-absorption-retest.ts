/**
 * Agent #11 independent P0 absorption retest against the corrected canonical tip.
 * Sealed AutoNation package only; no paid inference; no Neon writes; no seal mutation.
 *
 * Usage: npx tsx scripts/agent-11/run-p0-absorption-retest.ts
 * Writes: docs/agent-11-p0-absorption-retest/
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import { assignPackageDocumentRoles } from "../../lib/contract-model/compiler/package-graph/document-roles";
import {
  buildOperativeAuthorityHandoffBundle,
  summarizeBundleProductionAuthority,
  resolvePackageRestatementAuthorities,
} from "../../lib/contract-model/compiler/operative-authority";

delete process.env.AI_GATEWAY_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const REPO = process.cwd();
const FIX = join(REPO, "tests/fixtures/unseen-packages/an-2020-2026-credit-facility");
const R1_FROZEN = join(REPO, "docs/agent-11-e2e-acceptance-round1-frozen");
const OUT = join(REPO, "docs/agent-11-p0-absorption-retest");
mkdirSync(OUT, { recursive: true });

const tip = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const seal = JSON.parse(readFileSync(join(R1_FROZEN, "03-package-seal.json"), "utf8"));
const legalBytes = readFileSync(join(R1_FROZEN, "05-legal-reference-answers.json"));
const legalSha = createHash("sha256").update(legalBytes).digest("hex");
const LEGAL_SEAL_EXPECTED = "393facc432182df08dae690e3fc0e751a4c3a410b71c0e7b93a54122915fa1bd";

const docsMeta = [
  { documentId: "doc-a", label: "AN Third AR", file: "doc-a-2020-03-26-third-ar-credit-agreement.txt" },
  { documentId: "doc-b", label: "AN Fifth AR", file: "doc-b-2026-09-14-fifth-ar-credit-agreement.txt" },
];

const pkgDocs = docsMeta.map((d) => {
  const text = readFileSync(join(FIX, "extracted-text", d.file), "utf8");
  const extractedSha256 = createHash("sha256").update(text).digest("hex");
  const sealed = seal.documents.find((x: { documentId: string }) => x.documentId === d.documentId);
  return {
    documentId: d.documentId,
    label: d.label,
    text,
    extractedSha256,
    sealMatch: sealed?.extractedSha256 === extractedSha256,
  };
});

const packageGraph = buildPackageGraph(
  "agent-11-p0-absorb",
  "an-2020-2026-credit-facility",
  pkgDocs.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text })),
);

const documentRoles = assignPackageDocumentRoles(
  packageGraph.classifications,
  packageGraph.identities,
  packageGraph.relationshipCandidates,
);

const restatementAuthorities = resolvePackageRestatementAuthorities({
  documents: pkgDocs.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text })),
  packageGraph,
});

const agent7Bundle = buildOperativeAuthorityHandoffBundle({
  companyId: "agent-11-p0-absorb",
  packageKey: "an-2020-2026-credit-facility",
  asOfDate: "2026-09-15",
  documents: pkgDocs.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text })),
  packageGraph,
  provisions: [{ sectionRef: "8.1" }, { sectionRef: "8.2" }, { sectionRef: "11.01" }, { sectionRef: "2.1" }],
  instrumentDocumentIds: ["doc-a", "doc-b"],
  baseDocumentId: "doc-a",
});

const summary = summarizeBundleProductionAuthority(agent7Bundle, {
  attemptPromotionToProduction: true,
});

const wrongDocumentProductionPromotion =
  agent7Bundle.provisions.some(
    (p) =>
      p.governingDocumentId === "doc-a" &&
      (p.authorityClassification === "CONFIRMED_OPERATIVE" ||
        p.authorityClassification === "CONFIRMED_OPERATIVE_WITH_CAVEATS"),
  ) && summary.allProvisionsProductionActive === true;

const classCounts: Record<string, number> = {};
for (const p of agent7Bundle.provisions) {
  classCounts[p.authorityClassification] = (classCounts[p.authorityClassification] ?? 0) + 1;
}

const out = {
  tipSha: tip,
  asOfDate: "2026-09-15",
  legalReferenceAnswersSha256: legalSha,
  legalSealPreserved: legalSha === LEGAL_SEAL_EXPECTED,
  sealMatches: Object.fromEntries(pkgDocs.map((d) => [d.documentId, d.sealMatch])),
  restatementAuthorities: restatementAuthorities.map((a) => ({
    successorDocumentId: a.successorDocumentId,
    predecessorDocumentId: a.predecessorDocumentId,
    status: a.status,
    effectiveDateIso: a.effectiveDateIso,
  })),
  provisionClassCounts: classCounts,
  provisions: agent7Bundle.provisions.map((p) => ({
    provisionKey: p.provisionKey,
    authorityClassification: p.authorityClassification,
    governingDocumentId: p.governingDocumentId,
  })),
  allProvisionsProductionActive: summary.allProvisionsProductionActive,
  anyProductionRefused: summary.anyProductionRefused,
  wrongDocumentProductionPromotion,
  confirmedOperativeOnDocA: agent7Bundle.provisions.filter(
    (p) =>
      p.governingDocumentId === "doc-a" &&
      (p.authorityClassification === "CONFIRMED_OPERATIVE" ||
        p.authorityClassification === "CONFIRMED_OPERATIVE_WITH_CAVEATS"),
  ).length,
  documentRoles,
  verdict: wrongDocumentProductionPromotion
    ? "WRONG_DOCUMENT_PROMOTION_STILL_PRESENT"
    : "CANONICAL_293_OPERATIVE_AUTHORITY_SAFETY_VERIFIED",
};

writeFileSync(join(OUT, "10d-agent7-operative-authority.json"), JSON.stringify(out, null, 2));
writeFileSync(
  join(OUT, "00-versions.json"),
  JSON.stringify(
    {
      tipSha: tip,
      absorbedFromFixSha: "1f0945835a5facf83f5a4d584f2100c1d68f3475",
      priorCanonicalTip: "59af93201de9d5db20eccadbf990feaba176638b",
      legalSealSha256Expected: LEGAL_SEAL_EXPECTED,
      legalReferenceAnswersSha256: legalSha,
      note: "Agent #11 independent absorption retest — production code differs from 1f094583; focused wrong-document + seal check",
    },
    null,
    2,
  ),
);
writeFileSync(
  join(OUT, "15-final-report.md"),
  [
    "# Agent #11 — P0 Absorption Independent Retest",
    "",
    `- Tip SHA: \`${tip}\``,
    `- Legal seal preserved: ${legalSha === LEGAL_SEAL_EXPECTED}`,
    `- wrongDocumentProductionPromotion: **${wrongDocumentProductionPromotion}**`,
    `- allProvisionsProductionActive: ${summary.allProvisionsProductionActive}`,
    `- Verdict: **${out.verdict}**`,
    "",
  ].join("\n"),
);

console.log(JSON.stringify(out, null, 2));
