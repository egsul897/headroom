import { describe, expect, it } from "vitest";
import { classifyNeonProbeError } from "../../lib/covenant-learning-factory/store/neon-database-url";

describe("classifyNeonProbeError", () => {
  it("classifies password / P1010 as auth_failed", () => {
    expect(classifyNeonProbeError("password authentication failed for user 'neondb_owner'")).toBe(
      "auth_failed",
    );
    expect(classifyNeonProbeError("Error: P1010\nUser was denied access on the database")).toBe(
      "auth_failed",
    );
    expect(classifyNeonProbeError("28P01")).toBe("auth_failed");
  });

  it("classifies P1001 as unreachable", () => {
    expect(
      classifyNeonProbeError(
        "Can't reach database server at `ep-shiny-rice-aw903tjv-pooler.c-12.us-east-1.aws.neon.tech:5432`",
      ),
    ).toBe("unreachable");
    expect(classifyNeonProbeError("P1001")).toBe("unreachable");
  });
});
