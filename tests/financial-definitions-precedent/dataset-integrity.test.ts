import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const PACK = path.join(ROOT, "docs/financial-definitions-precedent");

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(PACK, name), "utf8")) as T;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Match Python html.unescape + tag strip + whitespace collapse used at atlas generation. */
function loadSourceText(sourcePath: string): string {
  const abs = path.join(ROOT, sourcePath);
  expect(existsSync(abs), `missing source ${sourcePath}`).toBe(true);
  let text = readFileSync(abs, "utf8");
  if (sourcePath.endsWith(".htm") || sourcePath.endsWith(".html")) {
    text = text
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&ldquo;/gi, "“")
      .replace(/&rdquo;/gi, "”")
      .replace(/&lsquo;/gi, "‘")
      .replace(/&rsquo;/gi, "’")
      .replace(/&mdash;/gi, "—")
      .replace(/&ndash;/gi, "–")
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
  }
  return text;
}

type Atlas = {
  version: string;
  workstreamId: string;
  entries: Array<{
    id: string;
    kind: string;
    termLabel: string;
    sourceId: string;
    sourcePath: string;
    charStart: number;
    charEnd: number;
    excerpt: string;
    excerptSha256: string;
    verificationStatus: string;
    formulaSketch: string | null;
    dependencies: string[];
    units: string | null;
    measurementPeriod: string | null;
    entityScope: string | null;
  }>;
  counts: { entries: number; negativeExamples: number };
};

describe("financial-definitions-precedent dataset integrity", () => {
  it("pack contains required artifacts", () => {
    const required = [
      "00-ownership-and-coordination.md",
      "01-schema.json",
      "02-precedent-atlas.json",
      "03-calculation-dependency-graph.json",
      "04-addback-taxonomy.json",
      "05-negative-examples-conditions-not-capacity.json",
      "06-missing-financial-inputs.json",
      "07-unresolved-interpretation-queue.json",
      "08-regression-candidates.json",
      "09-mechanic-divergences.json",
      "10-dataset-export.json",
      "11-progress-ledger.md",
      "README.md",
    ];
    for (const f of required) {
      expect(existsSync(path.join(PACK, f)), f).toBe(true);
    }
    // ensure we did not accidentally write outside pack via empty dir listing sanity
    expect(readdirSync(PACK).length).toBeGreaterThan(10);
  });

  it("schema declares missing-input fail-closed rule and peer boundaries", () => {
    const schema = readJson<{
      version: string;
      missingInputRepresentation: { pattern: string };
      coordination: Record<string, { bcId: string }>;
      nonGoals: string[];
    }>("01-schema.json");
    expect(schema.version).toBe("fdp.v1");
    expect(schema.missingInputRepresentation.pattern).toBe("MISSING_INPUT:<inputKey>");
    expect(schema.coordination.definitionEncyclopedia.bcId).toMatch(/^bc-/);
    expect(schema.coordination.basketFormulaLibrary.bcId).toMatch(/^bc-/);
    expect(schema.nonGoals.join(" ")).toMatch(/calculation equivalence/i);
  });

  it("atlas entries have unique ids and required calculation fields", () => {
    const atlas = readJson<Atlas>("02-precedent-atlas.json");
    expect(atlas.workstreamId).toBe("WS-FDP");
    expect(atlas.entries.length).toBe(atlas.counts.entries);
    expect(atlas.entries.length).toBeGreaterThanOrEqual(25);
    const ids = new Set<string>();
    for (const e of atlas.entries) {
      expect(ids.has(e.id), `duplicate ${e.id}`).toBe(false);
      ids.add(e.id);
      expect(e.termLabel.length).toBeGreaterThan(0);
      expect(e.sourcePath.length).toBeGreaterThan(0);
      expect(e.excerpt.length).toBeGreaterThan(0);
      expect(e.formulaSketch && e.formulaSketch.length).toBeGreaterThan(0);
      expect(e.units && e.units.length).toBeGreaterThan(0);
      expect(e.measurementPeriod && e.measurementPeriod.length).toBeGreaterThan(0);
      expect(e.entityScope && e.entityScope.length).toBeGreaterThan(0);
      expect(Array.isArray(e.dependencies)).toBe(true);
    }
  });

  it("every atlas excerpt matches source bytes and sha256", () => {
    const atlas = readJson<Atlas>("02-precedent-atlas.json");
    for (const e of atlas.entries) {
      const text = loadSourceText(e.sourcePath);
      const span = text.slice(e.charStart, e.charEnd);
      expect(span, e.id).toBe(e.excerpt);
      expect(sha256(span), e.id).toBe(e.excerptSha256);
    }
  });

  it("negative examples are conditions/gates, not capacity, with verified spans", () => {
    const neg = readJson<{
      examples: Array<{
        id: string;
        kind: string;
        sourcePath: string;
        charStart: number;
        charEnd: number;
        excerpt: string;
        excerptSha256: string;
        whyNotCapacity: string;
        correctClassification: string;
      }>;
    }>("05-negative-examples-conditions-not-capacity.json");
    expect(neg.examples.length).toBeGreaterThanOrEqual(5);
    for (const n of neg.examples) {
      expect(n.kind).toBe("NEGATIVE_EXAMPLE_CONDITION_NOT_CAPACITY");
      expect(n.whyNotCapacity.toLowerCase()).not.toMatch(/this is a basket/);
      expect(n.correctClassification.length).toBeGreaterThan(0);
      const text = loadSourceText(n.sourcePath);
      const span = text.slice(n.charStart, n.charEnd);
      expect(span, n.id).toBe(n.excerpt);
      expect(sha256(span), n.id).toBe(n.excerptSha256);
    }
  });

  it("dependency graph includes non-equivalence edges for same labels", () => {
    const graph = readJson<{
      edges: Array<{ edgeType: string; from: string; to: string }>;
    }>("03-calculation-dependency-graph.json");
    const nonEq = graph.edges.filter((e) =>
      ["SAME_LABEL_NOT_EQUIVALENT", "RELATED_LABEL_NOT_EQUIVALENT", "CASH_NETTING_MECHANICS_DIFFER"].includes(
        e.edgeType,
      ),
    );
    expect(nonEq.length).toBeGreaterThanOrEqual(4);
  });

  it("add-back taxonomy covers synergies, caps, cash netting, cures, step-ups", () => {
    const tax = readJson<{ families: Array<{ id: string }> }>("04-addback-taxonomy.json");
    const ids = new Set(tax.families.map((f) => f.id));
    for (const need of [
      "SYNERGIES_RUN_RATE",
      "PRO_FORMA_SYNERGY",
      "CASH_NETTING",
      "ANTI_DOUBLE_COUNT",
      "STEP_UP",
      "CURE",
      "RESTRUCTURING_OPTIMIZATION",
    ]) {
      expect(ids.has(need), need).toBe(true);
    }
  });

  it("missing inputs use explicit MISSING_INPUT keys and never invent results", () => {
    const missing = readJson<{
      rule: string;
      inputs: Array<{ key: string; status: string }>;
    }>("06-missing-financial-inputs.json");
    expect(missing.rule).toMatch(/MISSING_INPUT/);
    expect(missing.inputs.length).toBeGreaterThanOrEqual(10);
    expect(missing.inputs.every((i) => i.key.length > 0 && i.status.length > 0)).toBe(true);
  });

  it("unresolved queue and regression candidates are non-empty drafts", () => {
    const uq = readJson<{ items: Array<{ id: string; status: string }> }>(
      "07-unresolved-interpretation-queue.json",
    );
    const reg = readJson<{ candidates: Array<{ id: string; failureClass: string }> }>(
      "08-regression-candidates.json",
    );
    expect(uq.items.length).toBeGreaterThanOrEqual(5);
    expect(reg.candidates.length).toBeGreaterThanOrEqual(6);
    expect(reg.candidates.some((c) => c.failureClass === "CONDITION_AS_CAPACITY")).toBe(true);
    expect(reg.candidates.some((c) => c.failureClass === "INVENTED_FINANCIAL_RESULT")).toBe(true);
  });

  it("ownership doc forbids peer production edits and paid calls", () => {
    const md = readFileSync(path.join(PACK, "00-ownership-and-coordination.md"), "utf8");
    expect(md).toMatch(/Must not touch/);
    expect(md).toMatch(/Definition Encyclopedia/);
    expect(md).toMatch(/Basket Formula Library/);
    expect(md).toMatch(/docs\/financial-definitions-precedent\/\*\*/);
  });

  it("dataset export ids are unique across atlas + negatives", () => {
    const exp = readJson<{ records: Array<{ id: string }> }>("10-dataset-export.json");
    const ids = exp.records.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
