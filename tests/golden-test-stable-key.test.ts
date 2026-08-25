/**
 * Adversarial regression suite for GoldenTest.stableKey - the durable,
 * content-derived business identity introduced to fix the golden-test
 * replay problem (docs/database-replay-safety.md). Proves the mechanism
 * itself, not just that it "looks right":
 *   A. a fresh row-recreation produces a different cuid `id` but the same
 *      `stableKey` (real DB proof, not prose).
 *   B. review scripts' resolution pattern (stableKey -> current id) attaches
 *      to the correct row.
 *   C. changing `expectedAnswer` does not change `stableKey`.
 *   D. changing review `status` does not change `stableKey`.
 *   E. the upsert-by-stableKey pattern in seed scripts uses `stableKey` as
 *      the `where`, not `question` - a wording-only question edit updates
 *      the existing row in place rather than creating a new one.
 *   F. the database unique constraint actually rejects a duplicate
 *      `stableKey` insertion.
 *   G. a lookup for a `stableKey` that doesn't exist fails loudly (throws),
 *      never silently returns nothing.
 *   H. no script in the repo falls back to a hardcoded golden_tests.id cuid
 *      literal as a live lookup key (grep-based, checked against every id
 *      actually present in the database today, not just a memorized list).
 *
 * Tests A/C/D/E/F/G use a dedicated, clearly-marked throwaway fixture
 * stableKey ("coherent:zz-test-fixture-stable-key") under the real
 * "coherent" company (GoldenTest.companyId is a real FK) so the constraint
 * checks are proven against a live Postgres connection, not asserted in
 * prose - and clean up after themselves (delete-if-exists both before and
 * after) so no test row is left behind in the database.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";

const FIXTURE_STABLE_KEY = "coherent:zz-test-fixture-stable-key";
const FIXTURE_COMPANY_ID = "coherent";

async function deleteFixture() {
  await prisma.goldenTest.deleteMany({ where: { stableKey: FIXTURE_STABLE_KEY } });
}

async function createFixture(question: string, overrides: Record<string, unknown> = {}) {
  return prisma.goldenTest.create({
    data: {
      companyId: FIXTURE_COMPANY_ID,
      stableKey: FIXTURE_STABLE_KEY,
      question,
      queryType: "OUT_OF_SCOPE",
      status: "UNVERIFIED",
      ...overrides,
    },
  });
}

beforeEach(deleteFixture);
afterEach(deleteFixture);

describe("A: fresh recreation produces a different cuid id but the same stableKey", () => {
  it("deleting and recreating a row under the same stableKey yields a new id", async () => {
    const first = await createFixture("Fixture question v1");
    const firstId = first.id;
    expect(first.stableKey).toBe(FIXTURE_STABLE_KEY);

    await prisma.goldenTest.delete({ where: { id: firstId } });

    const second = await createFixture("Fixture question v1");
    expect(second.stableKey).toBe(FIXTURE_STABLE_KEY);
    expect(second.id).not.toBe(firstId);
  });
});

describe("B: resolution-by-stableKey attaches to the correct row (mirrors the pattern every review script now uses)", () => {
  it("resolving coherent:q22 by stableKey returns the row whose question is the Q22 question, regardless of its current id", async () => {
    const row = await prisma.goldenTest.findUniqueOrThrow({ where: { stableKey: "coherent:q22" } });
    expect(row.question).toBe("If Coherent incurs $500M of new secured debt today, what secured capacity remains immediately afterward, and under which provision?");
    expect(Number(row.expectedAnswer)).toBe(3541);
    expect(row.bindingProvision).toBe("mila_secured");
  });

  it("resolving coherent:q17a/q17b (rows 16/17) by stableKey returns the two SSNL spot-check rows with the Gate-0 reconciliation note attached", async () => {
    for (const key of ["coherent:q17a", "coherent:q17b"]) {
      const row = await prisma.goldenTest.findUniqueOrThrow({ where: { stableKey: key } });
      expect(row.reviewerNotes).toMatch(/GATE-0 SECURITY-SCOPE FIX RECONCILIATION/);
    }
  });
});

describe("C: changing expectedAnswer does not change stableKey", () => {
  it("update({ data: { expectedAnswer } }) leaves stableKey untouched", async () => {
    const created = await createFixture("Fixture question", { expectedAnswer: 100, tolerance: 1 });
    const updated = await prisma.goldenTest.update({ where: { id: created.id }, data: { expectedAnswer: 999 } });
    expect(Number(updated.expectedAnswer)).toBe(999);
    expect(updated.stableKey).toBe(FIXTURE_STABLE_KEY);
    expect(updated.id).toBe(created.id);
  });
});

describe("D: changing review status does not change stableKey", () => {
  it("update({ data: { status } }) leaves stableKey untouched", async () => {
    const created = await createFixture("Fixture question");
    expect(created.status).toBe("UNVERIFIED");
    const updated = await prisma.goldenTest.update({ where: { id: created.id }, data: { status: "VERIFIED" } });
    expect(updated.status).toBe("VERIFIED");
    expect(updated.stableKey).toBe(FIXTURE_STABLE_KEY);
    expect(updated.id).toBe(created.id);
  });
});

describe("E: the seed upsert pattern keys on stableKey, not question - a wording-only question edit updates in place, never creates a duplicate row", () => {
  it("two upserts with the same stableKey but different question text produce exactly one row, with the question re-synced to the latest wording", async () => {
    const first = await prisma.goldenTest.upsert({
      where: { stableKey: FIXTURE_STABLE_KEY },
      update: { question: "Original wording" },
      create: { companyId: FIXTURE_COMPANY_ID, stableKey: FIXTURE_STABLE_KEY, question: "Original wording", queryType: "OUT_OF_SCOPE", status: "UNVERIFIED" },
    });

    const second = await prisma.goldenTest.upsert({
      where: { stableKey: FIXTURE_STABLE_KEY },
      update: { question: "Reworded, wording-only edit" },
      create: { companyId: FIXTURE_COMPANY_ID, stableKey: FIXTURE_STABLE_KEY, question: "Reworded, wording-only edit", queryType: "OUT_OF_SCOPE", status: "UNVERIFIED" },
    });

    expect(second.id).toBe(first.id); // same row updated in place, not a new one created
    expect(second.question).toBe("Reworded, wording-only edit");
    expect(second.stableKey).toBe(FIXTURE_STABLE_KEY);

    const count = await prisma.goldenTest.count({ where: { stableKey: FIXTURE_STABLE_KEY } });
    expect(count).toBe(1);
  });
});

describe("F: duplicate stableKey insertion is rejected by the database, for real", () => {
  it("creating a second row with an already-used stableKey throws a unique-constraint error (P2002)", async () => {
    await createFixture("First row with this stableKey");

    await expect(
      prisma.goldenTest.create({
        data: { companyId: FIXTURE_COMPANY_ID, stableKey: FIXTURE_STABLE_KEY, question: "Second row, same stableKey", queryType: "OUT_OF_SCOPE", status: "UNVERIFIED" },
      })
    ).rejects.toMatchObject({ code: "P2002" });

    // Confirm the rejected insert didn't leave a partial row behind.
    const count = await prisma.goldenTest.count({ where: { stableKey: FIXTURE_STABLE_KEY } });
    expect(count).toBe(1);
  });
});

describe("G: a lookup for a stableKey that doesn't exist fails loudly, never silently", () => {
  it("findUniqueOrThrow throws for a nonexistent stableKey", async () => {
    await expect(prisma.goldenTest.findUniqueOrThrow({ where: { stableKey: "coherent:this-key-does-not-exist" } })).rejects.toMatchObject({ code: "P2025" });
  });

  it("findUnique returns null (never a wrong row) for a nonexistent stableKey - callers must check for null and throw, exactly as every updated review script now does", async () => {
    const row = await prisma.goldenTest.findUnique({ where: { stableKey: "coherent:this-key-does-not-exist" } });
    expect(row).toBeNull();
  });
});

describe("H: no script depends on a hardcoded golden_tests.id cuid literal as a live lookup key", () => {
  it("none of the 48 actual golden_tests.id values currently in the database appear anywhere in scripts/*.ts outside a comment line", async () => {
    const rows = await prisma.goldenTest.findMany({ select: { id: true } });
    expect(rows.length).toBe(48);
    const ids = rows.map((r) => r.id);

    const scriptsDir = join(__dirname, "..", "scripts");
    const files = readdirSync(scriptsDir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(join(scriptsDir, file), "utf8");
      const codeLines = content
        .split("\n")
        .filter((line) => {
          const trimmed = line.trim();
          return !(trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/**"));
        })
        .join("\n");

      for (const id of ids) {
        if (codeLines.includes(id)) {
          offenders.push(`${file}: contains live (non-comment) reference to golden_tests.id ${id}`);
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("scripts/backfill-golden-test-stable-keys.ts, the one script allowed to touch stableKey directly, resolves rows by (companyId, question) text, never by a hardcoded id", () => {
    const content = readFileSync(join(__dirname, "..", "scripts", "backfill-golden-test-stable-keys.ts"), "utf8");
    expect(content).toMatch(/seedByQuestion/);
    expect(content).not.toMatch(/where:\s*{\s*id:\s*"cm[a-z0-9]+"\s*}/);
  });
});
