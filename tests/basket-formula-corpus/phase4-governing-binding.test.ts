import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bindGoverningSource,
  classifySpanFidelity,
  classifySemanticRole,
  linkPermissionToCeiling,
} from "../../lib/basket-formula-corpus";

const ROOT = resolve(__dirname, "../..");

describe("phase-4 governing source binding", () => {
  it("refuses affirmative permission from numerical fragments alone", () => {
    expect(classifySpanFidelity("greater of $5,000,000 and 10% of Total Assets", null)).toBe(
      "NUMERICAL_FRAGMENT",
    );
    const role = classifySemanticRole({
      spanText: "greater of $5,000,000 and 10% of Total Assets",
      spanFidelity: "NUMERICAL_FRAGMENT",
    });
    expect(role.suppliesPermissionAuthority).toBe(false);
    expect(role.capacitySemantics).not.toBe("AFFIRMATIVE_CAPACITY");
  });

  it("replays spans against canonical source bytes with provenance offsets", () => {
    const doc = resolve(
      ROOT,
      "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt",
    );
    expect(existsSync(doc)).toBe(true);
    const source = readFileSync(doc, "utf8");
    const needle = "Fixed Incremental Amount";
    const idx = source.indexOf(needle);
    expect(idx).toBeGreaterThan(0);
    // Use a short exact slice that must be byte-exact.
    const span = source.slice(idx, idx + needle.length);
    const binding = bindGoverningSource({
      candidateId: "test-chwy-fia-label",
      exactSourceSpan: span,
      documentPath: doc,
      sourceText: source,
    });
    expect(binding.sourceRecovered).toBe(true);
    expect(binding.spanReplayable).toBe(true);
    expect(binding.extractedSpan?.provenance.byteExact).toBe(true);
    expect(binding.extractedSpan?.provenance.byteOffsetStart).not.toBeNull();
  });

  it("returns explicit unresolved status when source bytes are missing", () => {
    const binding = bindGoverningSource({
      candidateId: "missing-src",
      exactSourceSpan: "not to exceed $1,000,000",
      documentPath: "does/not/exist.txt",
    });
    expect(binding.bindingResolution).toBe("UNRESOLVED_SOURCE_MISSING");
    expect(binding.sufficientForAffirmativePermission).toBe(false);
    expect(binding.blockers).toContain("CANONICAL_SOURCE_BYTES_UNAVAILABLE");
  });
});

describe("phase-4 mandatory ceiling vs permission (Section A / Section B)", () => {
  const sectionA = `Section 7.04 Limitation on Indebtedness. The aggregate principal amount of Indebtedness of the Borrower and its Restricted Subsidiaries shall not exceed the greater of $5,000,000 and 10% of Total Assets.`;
  const sectionB = `Section 7.02(c) Permitted Indebtedness. The Borrower may incur other Indebtedness, subject to Section 7.04.`;

  it("classifies A as ceiling/threshold and B as permission authority without duplicate capacity", () => {
    const roleA = classifySemanticRole({
      spanText: sectionA,
      spanFidelity: "OPERATIVE_PROVISION",
      hasBoundPermissionAuthority: false,
    });
    const roleB = classifySemanticRole({
      spanText: sectionB,
      governingContext: sectionB + "\n" + sectionA,
      spanFidelity: "OPERATIVE_PROVISION",
    });

    expect(roleA.suppliesPermissionAuthority).toBe(false);
    expect(roleA.isCeilingOrThreshold).toBe(true);
    expect(["CAPACITY_CEILING", "PROHIBITION_THRESHOLD"]).toContain(roleA.role);
    expect(roleA.capacitySemantics).toBe("NOT_CAPACITY");

    expect(roleB.suppliesPermissionAuthority).toBe(true);
    expect(["PERMISSION_AUTHORITY", "CONDITIONAL_EXCEPTION"]).toContain(roleB.role);

    // When A is known to limit B, reclassify A as CAPACITY_CEILING.
    const roleALinked = classifySemanticRole({
      spanText: sectionA,
      spanFidelity: "OPERATIVE_PROVISION",
      hasBoundPermissionAuthority: true,
    });
    expect(roleALinked.role).toBe("CAPACITY_CEILING");

    const link = linkPermissionToCeiling({
      permissionAuthorityId: "sec-7.02(c)",
      ceilingId: "sec-7.04",
      permissionRole: roleB.role === "CONDITIONAL_EXCEPTION" ? "CONDITIONAL_EXCEPTION" : "PERMISSION_AUTHORITY",
      ceilingRole: "CAPACITY_CEILING",
    });
    expect(link.duplicateCapacityCreated).toBe(false);
    expect(link.ceilingIndependentlyExecutable).toBe(false);
    expect(link.failsClosedWhenAuthorityOrInputsMissing).toBe(true);
    expect(link.relationship).toBe("PERMISSION_SUBJECT_TO_CEILING");
  });
});
