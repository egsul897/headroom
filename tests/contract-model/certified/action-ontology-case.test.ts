/**
 * DEFECT C of the §7.5(j) live-exposed deterministic closure - canonical-action-ontology.v2 preserves regex flags.
 *
 * Live defect: the object-family regexes were rebuilt with `new RegExp(fam.re.source)` (flags dropped) and carried no
 * case-insensitive flag, so "Dispose of any of its Property" (capital P, as drafted) was not an ASSET object; the scan
 * skipped that cluster and recorded the LATER cluster "issue or sell any shares" (ONTOLOGY_GAP) as the governing act,
 * which the compiler turned into ACTION_INCONSISTENT_WITH_SOURCE_ACT and a false PARTIAL. Nothing here names a section,
 * an agreement or a figure; the matrix is generic drafting language.
 */
import { describe, expect, it } from "vitest";
import { assessActionCompatibility, CANONICAL_ACTION_ONTOLOGY_VERSION, classifySourceAction } from "../../../lib/contract-model/compiler/semantic/action-ontology";

const same = (a: ReturnType<typeof classifySourceAction>, b: ReturnType<typeof classifySourceAction>) => {
  expect([a.objectFamily, a.canonicalAction, a.coverage, a.categories, a.verbs.map((v) => v.toLowerCase())]).toEqual([b.objectFamily, b.canonicalAction, b.coverage, b.categories, b.verbs.map((v) => v.toLowerCase())]);
};

describe("defect C - case does not decide an object family", () => {
  it("version: canonical-action-ontology.v2", () => {
    expect(CANONICAL_ACTION_ONTOLOGY_VERSION).toBe("canonical-action-ontology.v2");
  });

  it("C1: 'Dispose of any of its Property' -> ASSET / SELL_ASSET / COVERED", () => {
    const c = classifySourceAction("Dispose of any of its Property");
    expect(c).toMatchObject({ phrase: "Dispose of any of its Property", objectFamily: "ASSET", canonicalAction: "SELL_ASSET", coverage: "COVERED", categories: ["SELL_ASSET"] });
    expect(assessActionCompatibility("SELL_ASSET", c).compatibility).toBe("COMPATIBLE");
  });

  it("C2: the lowercase twin yields the identical result", () => {
    same(classifySourceAction("Dispose of any of its property"), classifySourceAction("Dispose of any of its Property"));
  });

  it("C3: the all-caps twin yields the identical semantic result (verb recognition is case-insensitive too)", () => {
    same(classifySourceAction("DISPOSE OF ANY OF ITS PROPERTY"), classifySourceAction("Dispose of any of its Property"));
  });

  it("C4: representative case variants never change the object family", () => {
    const pairs: [string, string, string, string | null][] = [
      ["sell any Assets", "sell any assets", "ASSET", "SELL_ASSET"],
      ["make any Investments", "make any investments", "INVESTMENT", "MAKE_INVESTMENT"],
      ["create any Liens", "create any liens", "LIEN", "CREATE_LIEN"],
      ["repurchase any Capital Stock", "repurchase any capital stock", "EQUITY_REPURCHASE", "REPURCHASE_EQUITY"],
      ["repurchase any Shares", "repurchase any shares", "EQUITY_REPURCHASE", "REPURCHASE_EQUITY"],
      ["incur any Indebtedness", "incur any indebtedness", "DEBT", "INCUR_DEBT"],
      ["declare any Dividends", "declare any dividends", "RESTRICTED_PAYMENT", "PAY_DIVIDEND"],
      ["amend any Organizational Documents", "amend any organizational documents", "DOCUMENT", "AMEND_DOCUMENT"],
    ];
    for (const [upper, lower, family, action] of pairs) {
      const a = classifySourceAction(upper);
      const b = classifySourceAction(lower);
      expect([upper, a.objectFamily, a.canonicalAction]).toEqual([upper, family, action]);
      same(a, b);
    }
  });

  it("C5: a later verb/object cluster never displaces an earlier valid cluster merely because the earlier object is capitalised", () => {
    const leadIn = "Dispose of any of its Property or business (including receivables and leasehold interests), whether now owned or hereafter acquired, or, in the case of any Subsidiary, issue or sell any shares of such Subsidiary's Capital Stock to any Person, except:";
    const c = classifySourceAction(leadIn);
    expect(c.phrase).toBe("Dispose of any of its Property");
    expect(c).toMatchObject({ objectFamily: "ASSET", canonicalAction: "SELL_ASSET", coverage: "COVERED" });
    expect(assessActionCompatibility("SELL_ASSET", c)).toMatchObject({ compatibility: "COMPATIBLE" });
    // the later cluster on its own is still an honest gap - case-insensitivity added no category
    expect(classifySourceAction("issue or sell any shares of such Subsidiary's Capital Stock")).toMatchObject({ coverage: "ONTOLOGY_GAP", canonicalAction: null });
  });

  it("C6: ambiguity / MIXED_CATEGORIES / ONTOLOGY_GAP / NO_ACTION_FOUND outcomes are unchanged where semantically applicable", () => {
    expect(classifySourceAction("incur or guarantee any Indebtedness")).toMatchObject({ canonicalAction: null, coverage: "MIXED_CATEGORIES", categories: ["INCUR_DEBT", "GUARANTEE_DEBT"] });
    expect(classifySourceAction("incur or guarantee any indebtedness")).toMatchObject({ canonicalAction: null, coverage: "MIXED_CATEGORIES", categories: ["INCUR_DEBT", "GUARANTEE_DEBT"] });
    expect(classifySourceAction("issue or sell any shares")).toMatchObject({ coverage: "ONTOLOGY_GAP", canonicalAction: null, categories: [] });
    expect(classifySourceAction("The Borrower shall deliver financial statements")).toMatchObject({ coverage: "NO_ACTION_FOUND" });
    expect(classifySourceAction("Create, incur, assume or suffer to exist any Indebtedness, except:")).toMatchObject({ canonicalAction: "INCUR_DEBT", coverage: "COVERED", verbs: ["Create", "incur", "assume", "suffer to exist"] });
    expect(classifySourceAction("merge or consolidate with any Person")).toMatchObject({ canonicalAction: "MERGE", coverage: "COVERED" });
    // case changes nothing but case: a different act in a different case is still a different act
    expect(classifySourceAction("GUARANTEE ANY INDEBTEDNESS").canonicalAction).toBe("GUARANTEE_DEBT");
    expect(classifySourceAction("PREPAY ANY INDEBTEDNESS").canonicalAction).toBe("PREPAY_DEBT");
  });

  it("flag preservation is structural, not a Property special case: no global regex state leaks between classifications", () => {
    const a = classifySourceAction("sell any Assets");
    const b = classifySourceAction("sell any Assets");
    const c = classifySourceAction("create any Liens");
    expect(a).toEqual(b);
    expect(c.canonicalAction).toBe("CREATE_LIEN");
    expect(JSON.stringify(classifySourceAction("Dispose of any of its Property"))).toBe(JSON.stringify(classifySourceAction("Dispose of any of its Property")));
  });
});
