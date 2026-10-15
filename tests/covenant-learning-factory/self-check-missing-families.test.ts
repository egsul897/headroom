/** Self-check matcher: Events of Default, General Conditions, Guarantees and
 *  Restricted Subsidiaries/Designations are canonical families (were OTHER → null). */
import { describe, expect, it } from "vitest";
import { canonicalFamily, strictCandidateMatch } from "@/lib/covenant-learning-factory/sweep/self-check";

const body = "upon the occurrence of a payment failure under the senior notes exceeding $25,000,000 the administrative agent may accelerate";

describe("self-check missing families", () => {
  it("maps the four families", () => {
    expect(canonicalFamily("EVENTS_OF_DEFAULT")).toBe("EVENTS_OF_DEFAULT");
    expect(canonicalFamily("EVENT_OF_DEFAULT")).toBe("EVENTS_OF_DEFAULT");
    expect(canonicalFamily("GENERAL_CONDITIONS_AND_EXCEPTIONS")).toBe("GENERAL_CONDITIONS");
    expect(canonicalFamily("GUARANTEES")).toBe("GUARANTEES");
    expect(canonicalFamily("GUARANTEE")).toBe("GUARANTEES");
    expect(canonicalFamily("RESTRICTED_SUBSIDIARIES")).toBe("RESTRICTED_SUBSIDIARIES_AND_DESIGNATIONS");
    expect(canonicalFamily("UNRESTRICTED_SUBSIDIARIES")).toBe("RESTRICTED_SUBSIDIARIES_AND_DESIGNATIONS");
    expect(canonicalFamily("DESIGNATIONS")).toBe("RESTRICTED_SUBSIDIARIES_AND_DESIGNATIONS");
  });
  it("existing families unchanged; OTHER/UNKNOWN still null", () => {
    expect(canonicalFamily("INDEBTEDNESS")).toBe("DEBT");
    expect(canonicalFamily("RESTRICTED_PAYMENTS")).toBe("RESTRICTED_PAYMENTS");
    expect(canonicalFamily("OTHER")).toBe(null);
    expect(canonicalFamily("UNKNOWN")).toBe(null);
  });
  it("same-family, no-section match now credits; cross-family still rejects", () => {
    const b = { cite: body, sectionRef: null, family: "EVENTS_OF_DEFAULT" };
    expect(strictCandidateMatch({ excerpt: body, sectionRef: null, family: "EVENTS_OF_DEFAULT" }, b)).toBe(true);
    expect(strictCandidateMatch({ excerpt: body, sectionRef: null, family: "GUARANTEES" }, b)).toBe(false);
  });
});
