/**
 * Agent #7 — WOR Fourth→Fifth AR authentic evidence resolution.
 *
 * Uses the sealed #276 holdout fixture texts. Does not alter legal-reference
 * answers. Does not mutate package-graph RESTATES status. No paid inference.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPackageGraph } from "@/lib/contract-model/compiler/package-graph/pipeline";
import {
  AGENT7_STARTING_MAIN_SHA,
  buildOperativeAuthorityHandoffBundle,
  resolvePackageRestatementAuthorities,
} from "@/lib/contract-model/compiler/operative-authority";

const FIXTURE_DIR = path.join(
  process.cwd(),
  "tests/fixtures/unseen-packages/wor-2023-2026-credit-facility",
);

const DOC_A = "doc-a-2023-09-27-fourth-ar-credit-agreement.txt";
const DOC_B = "doc-b-2026-08-31-fifth-ar-credit-agreement.txt";

const EXPECTED_HASHES = {
  "doc-a": "29751da8c5ee22c84facccf0d643312b2fa8c485b612f92970bdbff05a4df5b2",
  "doc-b": "e5ce81017e3635960bcd519af513b480ca48a297cf97ba72e485ecb023399d3b",
} as const;

function loadWorDocs() {
  const aText = readFileSync(path.join(FIXTURE_DIR, "extracted-text", DOC_A), "utf8");
  const bText = readFileSync(path.join(FIXTURE_DIR, "extracted-text", DOC_B), "utf8");
  const aHash = createHash("sha256").update(aText).digest("hex");
  const bHash = createHash("sha256").update(bText).digest("hex");
  expect(aHash).toBe(EXPECTED_HASHES["doc-a"]);
  expect(bHash).toBe(EXPECTED_HASHES["doc-b"]);
  return [
    { documentId: "doc-a", label: "WOR Fourth AR 2023-09-27", text: aText },
    { documentId: "doc-b", label: "WOR Fifth AR 2026-08-31", text: bText },
  ];
}

describe("WOR Fourth→Fifth AR operative restatement authority", () => {
  it("records starting SHA pin and does not rewrite package-graph RESTATES", () => {
    expect(AGENT7_STARTING_MAIN_SHA).toBe("6abe42bae6dfe69bb72467daa7f460b727200d1b");
    const docs = loadWorDocs();
    const graph = buildPackageGraph("wor-holdout", "wor-2023-2026-credit-facility", docs);
    const edge = graph.relationshipCandidates.find(
      (r) => r.sourceDocumentId === "doc-b" && r.relationshipType === "RESTATES",
    );
    expect(edge?.status).toBe("REVIEW_REQUIRED");
    expect(edge?.evidenceClass).toBe("SUPPORTING_TARGET_EVIDENCE");

    const before = JSON.stringify(edge);
    resolvePackageRestatementAuthorities({ documents: docs, packageGraph: graph });
    const edgeAfter = graph.relationshipCandidates.find(
      (r) => r.sourceDocumentId === "doc-b" && r.relationshipType === "RESTATES",
    );
    expect(JSON.stringify(edgeAfter)).toBe(before);
  });

  it("confirms Fifth AR restatement authority from §11.01 + unique Fourth AR match", () => {
    const docs = loadWorDocs();
    const graph = buildPackageGraph("wor-holdout", "wor-2023-2026-credit-facility", docs);
    const authorities = resolvePackageRestatementAuthorities({ documents: docs, packageGraph: graph });

    const fifth = authorities.find((a) => a.successorDocumentId === "doc-b");
    expect(fifth).toBeTruthy();
    expect(fifth!.status).toBe("OPERATIVE_AUTHORITY_CONFIRMED");
    expect(fifth!.predecessorDocumentId).toBe("doc-a");
    expect(fifth!.effectiveDateIso).toBe("2026-08-31");
    expect(fifth!.evidence.captionRestatement.present).toBe(true);
    expect(fifth!.evidence.priorAgreementRecital.present).toBe(true);
    expect(fifth!.evidence.priorAgreementRecital.namedExecutionDate).toMatch(/September 27, 2023/i);
    expect(fifth!.evidence.operativeRestatementLanguage.present).toBe(true);
    expect(fifth!.evidence.operativeRestatementLanguage.supersedesEntirety).toBe(true);
    expect(fifth!.evidence.operativeRestatementLanguage.novationDisclaimed).toBe(true);
    expect(fifth!.evidence.conditionsPrecedent.present).toBe(true);
    expect(fifth!.evidence.signatureEvidence.present).toBe(true);
    expect(fifth!.conditionsPrecedentSatisfaction).toBe("NOT_INDEPENDENTLY_PROVEN");
    expect(fifth!.caveats).toContain("CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN");
    expect(fifth!.caveats).toContain("ADDITIVE_AUTHORITY_DOES_NOT_REWRITE_PACKAGE_GRAPH");
    expect(fifth!.doesNotMutatePackageGraphRelationship).toBe(true);

    // Historical Fourth AR → out-of-package Third AR remains review/unresolved — not manufactured.
    const fourth = authorities.find((a) => a.successorDocumentId === "doc-a");
    expect(fourth).toBeTruthy();
    expect(["REVIEW_REQUIRED", "AMBIGUOUS", "UNSUPPORTED"]).toContain(fourth!.status);
    expect(fourth!.predecessorDocumentId).toBeNull();
  });

  it("as-of dating: pre-Fifth → doc-a; post-Fifth → doc-b with caveats", () => {
    const docs = loadWorDocs();
    const graph = buildPackageGraph("wor-holdout", "wor-2023-2026-credit-facility", docs);

    const pre = buildOperativeAuthorityHandoffBundle({
      companyId: "wor-holdout",
      packageKey: "wor-2023-2026-credit-facility",
      asOfDate: "2026-08-30",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "6.01" }, { sectionRef: "6.02" }],
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });
    expect(pre.provisions.every((p) => p.governingDocumentId === "doc-a")).toBe(true);
    expect(pre.provisions.every((p) => p.authorityClassification === "NOT_YET_EFFECTIVE")).toBe(true);

    const post = buildOperativeAuthorityHandoffBundle({
      companyId: "wor-holdout",
      packageKey: "wor-2023-2026-credit-facility",
      asOfDate: "2026-08-31",
      documents: docs,
      packageGraph: graph,
      provisions: [
        { sectionRef: "6.01" },
        { sectionRef: "6.02" },
        { sectionRef: "6.03" },
        { sectionRef: "6.13" },
        { sectionRef: "11.01" },
      ],
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });

    for (const p of post.provisions) {
      expect(p.governingDocumentId).toBe("doc-b");
      expect(p.authorityClassification).toBe("CONFIRMED_OPERATIVE_WITH_CAVEATS");
      expect(p.supersededDocumentIds).toContain("doc-a");
      expect(p.provenance.conditionsPrecedentSatisfaction).toBe("NOT_INDEPENDENTLY_PROVEN");
      expect(p.provenance.packageGraphRestatesStatus).toBe("REVIEW_REQUIRED");
    }

    expect(post.verdict).toBe("OPERATIVE_RESTATEMENT_AUTHORITY_VERIFIED");
    expect(post.unsupportedCases).toContain("NO_PACKAGE_GRAPH_EDGE_MUTATION");
    expect(post.unsupportedCases.some((c) => c.startsWith("CP_SATISFACTION_NOT_INDEPENDENTLY_PROVEN"))).toBe(true);
    expect(post.unsupportedCases).toContain("PACKAGE_GRAPH_RESTATES_UNCHANGED:doc-b:REVIEW_REQUIRED");
  });

  it("deterministic replay on WOR sealed texts", () => {
    const docs = loadWorDocs();
    const graph = buildPackageGraph("wor-holdout", "wor-2023-2026-credit-facility", docs);
    const input = {
      companyId: "wor-holdout",
      packageKey: "wor-2023-2026-credit-facility",
      asOfDate: "2026-08-31",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "6.01" }],
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a" as string | null,
    };
    const a = buildOperativeAuthorityHandoffBundle(input);
    const b = buildOperativeAuthorityHandoffBundle(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
