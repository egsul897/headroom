/**
 * Freeze Kennametal Product Proof 001 evidence for PP002 owner handoff.
 * Offline only — no Pass B, no synthetic discovery, no hand-modeled permissions.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { EMPTY_SUPERSESSION_INDEX } from "../../lib/contract-model/compiler/amendment/operative-state";

const PKG = "tests/fixtures/product-proof-001/kennametal-2026-term-loan-credit-agreement";
const OUT = path.join(PKG, "frozen-evidence");
const DOC_ID = "kennametal-doc-a-2026-05-28-term-loan-credit-agreement";
const LABEL = "Kennametal Inc. Term Loan Credit Agreement dated as of May 28, 2026 (EX-10.2)";

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(typeof data === "string" ? Buffer.from(data) : data).digest("hex");
}

function writeJson(rel: string, value: unknown): string {
  const full = path.join(OUT, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  const body = JSON.stringify(value, null, 2) + "\n";
  writeFileSync(full, body);
  return sha256(body);
}

async function main() {
  const freeze = JSON.parse(readFileSync("docs/product/product-proof-001/00-freeze-manifest.json", "utf8"));
  const provenance = JSON.parse(readFileSync(path.join(PKG, "provenance.json"), "utf8"));
  const text = readFileSync(path.join(PKG, "extracted-text/credit-agreement.txt"), "utf8");
  const raw = readFileSync(path.join(PKG, "raw-html/d136977dex102.htm"));
  if (sha256(raw) !== freeze.package.bodySha256 || sha256(text) !== freeze.package.extractedTextSha256) {
    throw new Error("Refuse to export: freeze hash mismatch");
  }

  const nodes = parseDocumentStructure({ documentId: DOC_ID, label: LABEL, text });
  const definitions = detectStructuralDefinitions(DOC_ID, text, nodes);
  const references = detectStructuralReferences(DOC_ID, text, nodes);
  const index = buildStructuralIndex(new Map([[DOC_ID, { text, nodes }]]), definitions, references);
  const passA = runPassADeterministicSignals(DOC_ID, index, EMPTY_SUPERSESSION_INDEX);

  if (passA.length !== 236) {
    throw new Error(`Expected 236 Pass A candidates (frozen baseline), got ${passA.length}`);
  }

  const signalCounts: Record<string, number> = {};
  for (const c of passA) {
    for (const s of c.signals) signalCounts[s] = (signalCounts[s] ?? 0) + 1;
  }

  const hashes: Record<string, string> = {};
  hashes["structural-index-summary.json"] = writeJson("structural-index-summary.json", {
    documentId: DOC_ID,
    label: LABEL,
    nodeCount: nodes.length,
    definitionCount: definitions.length,
    referenceCount: references.length,
    passACandidateCount: passA.length,
    signalCounts,
    sectionRefSample: nodes.slice(0, 40).map((n) => ({
      nodeId: n.nodeId,
      sectionRef: n.sectionRef,
      heading: n.heading,
      nodeType: n.nodeType,
      charStart: n.charStart,
      charEnd: n.charEnd,
    })),
    note: "Full node list in structural-nodes.json. Offline deterministic only.",
  });

  hashes["structural-nodes.json"] = writeJson(
    "structural-nodes.json",
    nodes.map((n) => ({
      nodeId: n.nodeId,
      sectionRef: n.sectionRef,
      heading: n.heading,
      nodeType: n.nodeType,
      charStart: n.charStart,
      charEnd: n.charEnd,
      parentNodeId: n.parentNodeId ?? null,
    })),
  );

  hashes["definitions.json"] = writeJson(
    "definitions.json",
    definitions.map((d) => ({
      exactTerm: d.exactTerm,
      normalizedTerm: d.normalizedTerm,
      sourceNodeId: d.sourceNodeId,
      charStart: d.charStart,
      charEnd: d.charEnd,
      declarationKind: d.declarationKind ?? null,
      definitionExcerpt: d.definitionExcerpt.slice(0, 240),
    })),
  );

  hashes["references.json"] = writeJson(
    "references.json",
    references.map((r) => ({
      sourceNodeId: r.sourceNodeId,
      referenceText: r.referenceText,
      normalizedTarget: r.normalizedTarget,
      targetNodeId: r.targetNodeId,
      targetKind: r.targetKind,
      resolved: r.resolved,
      targetAmbiguous: r.targetAmbiguous,
      unresolvedReason: r.unresolvedReason,
      charStart: r.charStart,
      charEnd: r.charEnd,
    })),
  );

  const headingByNodeId = new Map(nodes.map((n) => [n.nodeId, n.heading] as const));
  hashes["pass-a-candidates.json"] = writeJson(
    "pass-a-candidates.json",
    {
      count: passA.length,
      frozenExpectedCount: 236,
      candidates: passA.map((c) => ({
        nodeId: c.nodeId,
        sectionRef: c.sectionRef,
        heading: headingByNodeId.get(c.nodeId) ?? null,
        signals: c.signals,
        signalScore: c.signalScore,
        supersessionStatus: c.supersessionStatus,
      })),
    },
  );

  hashes["manifest.json"] = writeJson("manifest.json", {
    artifact: "KENNAMETAL_PP001_FROZEN_EVIDENCE",
    frozenAt: new Date().toISOString(),
    baselineSha: freeze.baselineSha ?? "42e47d6785e6d73b4fb28ee7a63af22d00ff3d06",
    packageId: "kennametal-2026-term-loan-credit-agreement",
    bodySha256: freeze.package.bodySha256,
    extractedTextSha256: freeze.package.extractedTextSha256,
    provenanceDesignation: provenance.designation,
    firstUnsupportedStage: "PASS_B_SEMANTIC_UNSUPPORTED",
    firstUnsupportedIsNotCompilerFailure: true,
    compilerFailureNotDemonstratedOnThisPackage: true,
    mtnPp001CompilerBreak: {
      stage: "GENERALIZED_RULE_REPRESENTATION",
      prs: [263, 264],
      path: "docs/product-proof/001/",
      note: "MTN reached further; Kennametal stopped earlier. Do not re-prove the same compiler break on Kennametal until Pass B/IR path exists.",
    },
    fileHashes: hashes,
    forbidden: [
      "hand-model Kennametal permissions",
      "treat synthetic Pass B as authentic discovery",
      "paid inference without explicit authorization",
      "production Neon writes",
      "claim PASS_B_SEMANTIC_UNSUPPORTED equals compileCovenantToIR failure",
    ],
  });

  // Fix circular hash: rewrite manifest with hashes excluding self, then hash file
  const manifestPath = path.join(OUT, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  delete manifest.fileHashes.manifest;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  manifest.manifestSha256 = sha256(readFileSync(manifestPath));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        out: OUT,
        nodes: nodes.length,
        definitions: definitions.length,
        references: references.length,
        passA: passA.length,
        firstUnsupportedStage: "PASS_B_SEMANTIC_UNSUPPORTED",
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
