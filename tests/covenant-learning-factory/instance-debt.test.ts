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
