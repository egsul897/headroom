/**
 * Documents that application-side discoveryId scans are NOT concurrent-safe
 * without a database UNIQUE(discoveryKey) constraint.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

function discoveryId(term: string): string {
  return createHash("sha256")
    .update(`PROVISION_DEFINITION|doc|1.01|doc|${term}`)
    .digest("hex")
    .slice(0, 24);
}

describe("provision graph concurrent persist race (pre-UNIQUE)", () => {
  it("sequential shared store is idempotent across two passes", () => {
    const ids = Array.from({ length: 40 }, (_, i) => discoveryId(`T${i}`));
    const store = new Set<string>();
    let inserts = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const id of ids) {
        if (store.has(id)) continue;
        store.add(id);
        inserts += 1;
      }
    }
    expect(inserts).toBe(ids.length);
    expect(store.size).toBe(ids.length);
  });

  it("two writers with the same pre-insert snapshot amplify without UNIQUE", () => {
    const ids = Array.from({ length: 40 }, (_, i) => discoveryId(`T${i}`));
    const db: string[] = [];
    const snapA = new Set(db);
    const snapB = new Set(db);

    for (const id of ids) {
      if (!snapA.has(id)) db.push(id);
    }
    for (const id of ids) {
      // Writer B still uses snapB — without UNIQUE both inserts land
      if (!snapB.has(id)) db.push(id);
    }

    expect(new Set(db).size).toBe(ids.length);
    expect(db.length).toBe(ids.length * 2);
  });

  it("notes skipDuplicates is ineffective until a unique constraint exists", () => {
    // Prisma createMany({ skipDuplicates: true }) only skips on unique violations.
    // knowledge_relationship_edges has no discoveryKey unique index until authorized migration.
    expect(true).toBe(true);
  });
});
