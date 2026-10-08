import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { EXAMPLE_CATALOG, HELDOUT_ISSUER_IDS } from "../../lib/source-to-covenant-dataset/catalog";
import { buildDataset, buildRecord } from "../../lib/source-to-covenant-dataset/build";
import { detectDuplicates } from "../../lib/source-to-covenant-dataset/dedup";
import { jaccardSimilarity, sha256Text } from "../../lib/source-to-covenant-dataset/hash";
import { validateCorpus } from "../../lib/source-to-covenant-dataset/validate";
import { currentToolVersionPins } from "../../lib/source-to-covenant-dataset/versions";

const REPO = resolve(__dirname, "../..");

describe("source-to-covenant dataset", () => {
  it("pins live compiler/IR versions and declares they are not label authority", () => {
    const pins = currentToolVersionPins();
    expect(pins.pinsAreNotLabelAuthority).toBe(true);
    expect(pins.irSchemaVersion).toMatch(/headroom-covenant-ir/);
    expect(pins.semanticCompilerAlgorithmVersion).toMatch(/semantic-accountability-compiler/);
    expect(pins.semanticVerifierAlgorithmVersion).toMatch(/phase-3c-semantic-verifier/);
  });

  it("builds a validated corpus from authentic SEC fixtures without paid inference", () => {
    const built = buildDataset(REPO);
    expect(built.records.length).toBe(EXAMPLE_CATALOG.length);
    expect(built.provenance.safety.noPaidInferenceUsed).toBe(true);
    expect(built.provenance.safety.compilerOutputNotUsedAsGroundTruth).toBe(true);
    expect(built.provenance.safety.claudeAcceptanceCorpusNotContaminated).toBe(true);
    expect(validateCorpus(built.records)).toEqual([]);
    expect(built.qualityReport.summary.readyForImport).toBe(true);
  });

  it("includes positive, negative, unresolved, unsupported, verified, and hypothesis labels", () => {
    const built = buildDataset(REPO);
    expect(built.records.some((r) => r.polarity === "POSITIVE")).toBe(true);
    expect(built.records.some((r) => r.polarity === "NEGATIVE")).toBe(true);
    expect(built.records.some((r) => r.output.verificationStatus === "HUMAN_SOURCE_VERIFIED")).toBe(true);
    expect(built.records.some((r) => r.output.verificationStatus === "MODEL_HYPOTHESIS")).toBe(true);
    expect(built.records.some((r) => r.output.verificationStatus === "HUMAN_HYPOTHESIS")).toBe(true);
    expect(built.records.some((r) => r.output.verificationStatus === "UNRESOLVED")).toBe(true);
    expect(built.records.some((r) => r.output.verificationStatus === "UNSUPPORTED")).toBe(true);
  });

  it("preserves a held-out issuer/instrument evaluation set with no train/dev issuer leakage", () => {
    const built = buildDataset(REPO);
    const held = built.records.filter((r) => r.split === "eval-heldout");
    expect(held.length).toBeGreaterThanOrEqual(3);
    for (const r of held) {
      expect(HELDOUT_ISSUER_IDS).toContain(r.document.issuerId as (typeof HELDOUT_ISSUER_IDS)[number]);
    }
    const trainDevIssuers = new Set(built.records.filter((r) => r.split !== "eval-heldout").map((r) => r.document.issuerId));
    for (const id of HELDOUT_ISSUER_IDS) {
      expect(trainDevIssuers.has(id)).toBe(false);
    }
    expect(built.duplicateReport.heldOutContamination).toEqual([]);
  });

  it("tracks source text hashes and amendment identities", () => {
    const built = buildDataset(REPO);
    for (const row of built.provenance.sourceTextHashes) {
      expect(row.sourceTextSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(row.windowSha256).toMatch(/^[a-f0-9]{64}$/);
    }
    const withAmd = built.records.filter((r) => r.operativeVersion.amendmentIdentity);
    expect(withAmd.length).toBeGreaterThanOrEqual(2);
  });

  it("detects the intentional exact-duplicate Liens window pair", () => {
    const built = buildDataset(REPO);
    const pair = built.duplicateReport.exactDuplicatePairs.find(
      (p) =>
        (p.a === "stc-lsb-6.02-liens-prohibition" && p.b === "stc-lsb-6.02-liens-prohibition-near-dup-probe") ||
        (p.b === "stc-lsb-6.02-liens-prohibition" && p.a === "stc-lsb-6.02-liens-prohibition-near-dup-probe"),
    );
    expect(pair).toBeTruthy();
  });

  it("window hashes match exact text and fixtures exist on disk", () => {
    const spec = EXAMPLE_CATALOG.find((s) => s.exampleId === "stc-lsb-6.01-chapeau-ratio-gated")!;
    const record = buildRecord(REPO, spec);
    expect(record.input.windowSha256).toBe(sha256Text(record.input.exactText));
    expect(existsSync(resolve(REPO, record.document.sourceFixturePath))).toBe(true);
    expect(record.input.exactText).toMatch(/Indebtedness/i);
    expect(record.input.definitions["Payment Conditions"]).toMatch(/Specified Availability/);
  });

  it("exports SFT rows that still require usage-rights review and exclude Claude acceptance corpus", () => {
    const built = buildDataset(REPO);
    const line = built.sftJsonl.trim().split("\n")[0]!;
    const row = JSON.parse(line);
    expect(row.usage_rights_review_required).toBe(true);
    expect(row.exclude_from_claude_acceptance_corpus).toBe(true);
    expect(row.pins_are_not_label_authority).toBe(true);
    expect(row.source_text.length).toBeGreaterThan(20);
  });

  it("near-duplicate jaccard is deterministic and high for identical text", () => {
    expect(jaccardSimilarity("Hello World Covenant", "hello world covenant")).toBe(1);
    const report = detectDuplicates([]);
    expect(report.exactDuplicatePairs).toEqual([]);
  });

  it("refuses to treat compiler-as-ground-truth wording in label notes", () => {
    const spec = EXAMPLE_CATALOG[0]!;
    const bad = buildRecord(REPO, spec);
    bad.output.labelNotes = "copied from compiler ground truth";
    const problems = validateCorpus([bad]);
    expect(problems.some((p) => p.code === "COMPILER_AS_GT")).toBe(true);
  });
});
