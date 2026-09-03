import { classifyUnaccountedFragment, computeSourceCoverage } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/source-coverage";
import { scanQuantitativeValues } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/quantitative";

const frags = [
  "jointly and severally,",
  "directly or indirectly,",
  "except as provided in Section 6.02,",
  "minus the sum of the foregoing,",
  "solely,",
  "only,",
  "provided that,",
  "THE BORROWER HEREBY WAIVES ANY RIGHT TO TRIAL BY JURY",
  "SELLER MAKES NO WARRANTY OF MERCHANTABILITY OR FITNESS",
  "6.02 The Borrower shall not incur any Indebtedness",
  "7.01 No Lien may be created on the Collateral",
  "\"The Borrower shall not incur any Indebtedness without consent\"",
  "借款人不得设定任何留置权。",
  "Заемщик не вправе создавать залог.",
  "25000000",
  "except as set forth below,",
  "unless otherwise provided,",
  "including without limitation,",
  "notwithstanding the foregoing,",
  "provided, however, that,",
  "and not, jointly,",
  "less the sum of clauses (a) and (b),",
  "plus the product of the foregoing,",
  "subject to the following,",
];
for (const f of frags) {
  const v = scanQuantitativeValues(f);
  const r = classifyUnaccountedFragment(f, v);
  console.log(JSON.stringify(f).padEnd(66), "->", r.disposition, "| values:", v.map(x=>x.rawText).join(","));
}
