import { describe, expect, it } from "vitest";
import { presentStatus } from "@/components/status-presentation";

describe("status-presentation (design system)", () => {
  it("maps known codes to plain-language labels and tones", () => {
    expect(presentStatus("NEEDS_INPUT")).toMatchObject({ label: "Needs input", tone: "attention" });
    expect(presentStatus("REVIEW_REQUIRED")).toMatchObject({ label: "Review required", tone: "attention" });
    expect(presentStatus("DISCOVERED")).toMatchObject({ label: "Discovered", tone: "info" });
    expect(presentStatus("ACCEPTED")).toMatchObject({ label: "Accepted", tone: "clear" });
    expect(presentStatus("REJECTED")).toMatchObject({ label: "Rejected", tone: "info" });
    expect(presentStatus("SYSTEM_ACCEPTED")).toMatchObject({ label: "System-accepted", tone: "info" });
    expect(presentStatus("FAILED")).toMatchObject({ label: "Failed", tone: "stop" });
  });

  it("never invents a friendlier status for unmapped codes", () => {
    const p = presentStatus("SOME_FUTURE_CODE");
    expect(p.tone).toBe("unknown");
    expect(p.label).toBe("Some Future Code");
    expect(p.hint).toMatch(/no success or failure implied/i);
  });

  it("keeps the SYSTEM vs counsel distinction explicit", () => {
    expect(presentStatus("SYSTEM_ACCEPTED").hint).toMatch(/not counsel-verified/i);
    expect(presentStatus("COUNSEL_DECIDED").label).toBe("Counsel-decided");
  });
});
