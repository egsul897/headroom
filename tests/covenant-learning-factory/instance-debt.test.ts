import { describe, expect, it } from "vitest";
import { basketUsage, clauseFacilityNames, memberName, parseInstanceDebt } from "@/lib/covenant-learning-factory/xbrl/instance-debt";

const xml = `<xbrl>
<context id="a"><entity><segment><xbrldi:explicitMember dimension="us-gaap:LongTermDebtTypeAxis">abc:ExistingTermLoanMember</xbrldi:explicitMember></segment></entity><period><instant>2026-06-30</instant></period></context>
<context id="b"><entity><segment><xbrldi:explicitMember dimension="us-gaap:LineOfCreditFacilityAxis">us-gaap:RevolvingCreditFacilityMember</xbrldi:explicitMember></segment></entity><period><instant>2026-06-30</instant></period></context>
<context id="c"><entity><segment><xbrldi:explicitMember dimension="us-gaap:LongTermDebtTypeAxis">abc:SeniorNotesDue2028Member</xbrldi:explicitMember></segment></entity><period><instant>2026-06-30</instant></period></context>
<context id="old"><entity><segment><xbrldi:explicitMember dimension="us-gaap:LongTermDebtTypeAxis">abc:ExistingTermLoanMember</xbrldi:explicitMember></segment></entity><period><instant>2025-12-31</instant></period></context>
<us-gaap:LongTermDebtGross contextRef="a" unitRef="usd" decimals="-5">300000000</us-gaap:LongTermDebtGross>
<us-gaap:LongTermDebtGross contextRef="old" unitRef="usd" decimals="-5">320000000</us-gaap:LongTermDebtGross>
<us-gaap:LineOfCredit contextRef="b" unitRef="usd" decimals="-5">45000000</us-gaap:LineOfCredit>
<us-gaap:LongTermDebt contextRef="c" unitRef="usd" decimals="-5">496000000</us-gaap:LongTermDebt>
</xbrl>`;
const facts = parseInstanceDebt(xml, "0000000000-26-000001");

describe("instance-file debt breakdown", () => {
  it("names members and keeps the latest instant only", () => {
    expect(memberName("abc:SeniorNotesDue2028Member")).toBe("Senior Notes Due 2028");
    expect(facts.every((f) => f.instant === "2026-06-30")).toBe(true);
    expect(facts).toHaveLength(3);
  });
  it("reads the facility a basket names", () => {
    expect(clauseFacilityNames("(i) Indebtedness under the Existing Term Loan Documents in an aggregate principal amount not to exceed $362,023,838.75")).toEqual(["Existing Term Loan"]);
  });
  it("exact name, principal concept → usage", () => {
    const u = basketUsage("Indebtedness under the Existing Term Loan Documents not to exceed $400,000,000", facts);
    expect(u).toMatchObject({ status: "COMPUTED", usage: 300000000n, facility: "Existing Term Loan" });
    expect(basketUsage("Indebtedness under the Revolving Credit Facility not to exceed $100,000,000", facts)).toMatchObject({ status: "COMPUTED", usage: 45000000n });
  });
  it("near names, carrying amounts and several facilities stay NEEDS_INPUT", () => {
    expect(basketUsage("Indebtedness under the Term Loan Documents not to exceed $1", facts).status).toBe("NEEDS_INPUT");
    expect(basketUsage("Indebtedness in respect of the Senior Notes Due 2028 not to exceed $1", facts)).toMatchObject({ status: "NEEDS_INPUT" });
    expect(basketUsage("Indebtedness under the Existing Term Loan Documents and under the Revolving Credit Facility not to exceed $1", facts).status).toBe("NEEDS_INPUT");
    expect(basketUsage("Indebtedness not to exceed $50,000,000 at any time outstanding", facts).status).toBe("NEEDS_INPUT");
  });
});

import { digitsFromWords, instrumentOf, resolveByDefinition } from "@/lib/covenant-learning-factory/xbrl/instance-debt";

describe("defined term → filing instrument", () => {
  const xml2 = `<xbrl>
<context id="n1"><entity><segment><xbrldi:explicitMember dimension="us-gaap:DebtInstrumentAxis">x:FivePointZeroZeroZeroPercentageSeniorUnsecuredNotesDueTwoThousandTwentySevenMember</xbrldi:explicitMember></segment></entity><period><instant>2026-06-30</instant></period></context>
<context id="n2"><entity><segment><xbrldi:explicitMember dimension="us-gaap:DebtInstrumentAxis">x:SixPointTwoFivePercentSeniorNotesDue2030Member</xbrldi:explicitMember></segment></entity><period><instant>2026-06-30</instant></period></context>
<us-gaap:LongTermDebtGross contextRef="n1" unitRef="usd" decimals="-5">750000000</us-gaap:LongTermDebtGross>
<us-gaap:LongTermDebtGross contextRef="n2" unitRef="usd" decimals="-5">400000000</us-gaap:LongTermDebtGross>
</xbrl>`;
  const f2 = parseInstanceDebt(xml2, "a");
  it("reads spelled-out coupons and years", () => {
    expect(digitsFromWords("Five Point Zero Zero Zero Percentage Senior Unsecured Notes Due Two Thousand Twenty Seven")).toBe("5.000 Percentage Senior Unsecured Notes Due 2027");
    expect(instrumentOf("the 5.000% Senior Notes due 2027")).toEqual({ type: "NOTES", coupon: 5, year: 2027 });
    expect(instrumentOf("the 5.000% Senior Notes due 2027 and the 6.25% Senior Notes due 2030")).toBeNull();
  });
  it("matches one definition to one filing line; ambiguity stays unresolved", () => {
    const doc = `"Existing Notes" means the Company's 5.000% Senior Notes due 2027 issued under the Base Indenture. "Other" means x.`;
    expect(resolveByDefinition("Existing Notes", doc, f2)).toMatchObject({ member: "x:FivePointZeroZeroZeroPercentageSeniorUnsecuredNotesDueTwoThousandTwentySevenMember" });
    expect(basketUsage("Indebtedness in respect of the Existing Notes not to exceed $800,000,000", f2, doc)).toMatchObject({ status: "COMPUTED", usage: 750000000n });
    expect("reason" in resolveByDefinition("Existing Notes", `"Existing Notes" means the 5.000% Senior Notes due 2027 and the 6.25% Senior Notes due 2030.`, f2)).toBe(true);
    expect("reason" in resolveByDefinition("Existing Notes", `"Existing Notes" means the 5.000% Senior Notes due 2028.`, f2)).toBe(true);
    expect("reason" in resolveByDefinition("Existing Notes", `"Existing Notes" means the senior notes of the Company.`, f2)).toBe(true);
  });
});

describe("parenthetical definitions", () => {
  it("reads '… 9.200% Senior Secured Second Lien Notes due 2028 (the \"Notes\")' and refuses a mixed definition", async () => {
    const { definitionTexts, resolveByDefinition: rb } = await import("@/lib/covenant-learning-factory/xbrl/instance-debt");
    const doc = `WHEREAS, the Issuer has authorized an issue of up to $189.05 million of 9.200% Senior Secured Second Lien Notes due 2028 (the “ Notes ”); and WHEREAS ...`;
    expect(definitionTexts(doc, "Notes")).toHaveLength(1);
    const xml = `<context id="q"><entity><segment><xbrldi:explicitMember dimension="us-gaap:LongTermDebtTypeAxis">x:NinePointTwoZeroZeroPercentSeniorSecuredSecondLieuNotesDue2028Member</xbrldi:explicitMember></segment></entity><period><instant>2026-06-30</instant></period></context><us-gaap:LongTermDebtGross contextRef="q" unitRef="usd">189050000</us-gaap:LongTermDebtGross>`;
    const f = parseInstanceDebt(xml, "a");
    expect(rb("Notes", doc, f)).toMatchObject({ instrument: { type: "NOTES", coupon: 9.2, year: 2028 } });
    expect("reason" in rb("Notes", doc + ` “ Notes ” means the Initial Notes and any Additional Notes.`, f)).toBe(true);
  });
});
