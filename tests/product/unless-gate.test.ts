/**
 * Rule 42 — "unless" gate extraction must work across newlines.
 *
 * The inline regex /unless (.+)$/ could not cross a newline and
 * required the clause to run to end-of-string, so ANY multi-line
 * statement with the unless clause anywhere but the final line
 * missed the gate entirely: a conditional prohibition ("shall
 * not ... unless no Default has occurred") was reported as an
 * absolute PROHIBITS instead of CONDITIONAL. The extractor now
 * spans newlines and ends at the first sentence terminator,
 * with a lookbehind so "U.S." abbreviations do not truncate
 * the gate.
 */
import { describe, expect, it } from "vitest";
import { extractUnlessGate } from "../../lib/product/covenant-intelligence/unless-gate";

describe("extractUnlessGate", () => {
  it("extracts a single-line unless gate", () => {
    expect(
      extractUnlessGate("The Company shall not make any Restricted Payment unless no Default has occurred."),
    ).toBe("no Default has occurred");
  });

  it("extracts an unless gate mid-statement followed by more sentences on later lines", () => {
    expect(
      extractUnlessGate(
        "The Company shall not make any Restricted Payment unless no Default has occurred and is continuing.\nAny such payment must be approved by the Board.",
      ),
    ).toBe("no Default has occurred and is continuing");
  });

  it("extracts an unless gate starting on the next line", () => {
    expect(
      extractUnlessGate("The Company shall not make any Restricted Payment unless\nno Default has occurred."),
    ).toBe("no Default has occurred");
  });

  it("does not truncate at U.S. abbreviations", () => {
    expect(
      extractUnlessGate("The Company shall not transfer assets unless U.S. law permits."),
    ).toBe("U.S. law permits");
  });

  it("returns null when no unless clause is present", () => {
    expect(extractUnlessGate("The Company shall not make any Restricted Payment.")).toBeNull();
  });
});
