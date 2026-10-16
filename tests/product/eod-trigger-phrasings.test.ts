/**
 * Rule 16 — event-of-default trigger detection must cover "shall be
 * an Event of Default", not only "constitute(s) an Event of Default".
 *
 * The trigger regex only matched "constitutes an Event of Default".
 * Real EoD clauses also write "failure to pay … shall be an Event of
 * Default", "it is an Event of Default if …", and "shall constitute
 * a Default". A §8.01(a) non-payment trigger in those forms was not
 * recognized as an EoD trigger, so it could be classified by its
 * subject matter (payment → something else) and its posture labeled
 * a permission/prohibition — the exact inversion the EoD guard
 * exists to prevent. "Shall NOT be an Event of Default" (waiver
 * language) must still not match.
 */
import { describe, expect, it } from "vitest";
import {
  classifyFamiliesFromText,
  isEventOfDefaultTrigger,
} from "../../lib/knowledge-factory/taxonomy/families";

describe("event-of-default trigger phrasings", () => {
  it("recognizes 'shall be an Event of Default'", () => {
    expect(
      isEventOfDefaultTrigger(
        "Non-Payment",
        "Failure to pay principal when due shall be an Event of Default.",
      ),
    ).toBe(true);
  });

  it("recognizes 'is an Event of Default'", () => {
    expect(
      isEventOfDefaultTrigger(
        "Cross-Default",
        "It is an Event of Default if the Company defaults on any Indebtedness.",
      ),
    ).toBe(true);
  });

  it("recognizes 'shall constitute a Default'", () => {
    expect(
      isEventOfDefaultTrigger(
        "Covenant Default",
        "Failure to observe any covenant shall constitute a Default hereunder.",
      ),
    ).toBe(true);
  });

  it("still recognizes 'constitute an Event of Default'", () => {
    expect(
      isEventOfDefaultTrigger(
        "Cross-Default",
        "Default in payment of Indebtedness shall constitute an Event of Default.",
      ),
    ).toBe(true);
  });

  it("does NOT match waiver language 'shall not be an Event of Default'", () => {
    expect(
      isEventOfDefaultTrigger(
        "Waiver",
        "The waiver shall not be an Event of Default under this Indenture.",
      ),
    ).toBe(false);
  });

  it("classifies a 'shall be' non-payment trigger as EVENTS_OF_DEFAULT", () => {
    expect(
      classifyFamiliesFromText(
        "Failure to pay principal when due shall be an Event of Default.",
        "Non-Payment",
      ),
    ).toEqual(["EVENTS_OF_DEFAULT"]);
  });
});
