// Fetch and cache each issuer's latest 10-Q/10-K instance debt breakdown (dimensioned debt-axis facts).
import { readdirSync } from "node:fs";
import { latestInstanceFacts } from "../../lib/covenant-learning-factory/xbrl/instance-debt";
const cache = process.env.XBRL_CACHE ?? "/workspace/xbrl-cache";
const asOf = process.env.XBRL_TEST_DATE ?? new Date().toISOString().slice(0, 10);
const ciks = readdirSync(cache).map((f) => /^CIK(\d{10})\.json$/.exec(f)?.[1]).filter((x): x is string => !!x);
void (async () => {
let withAxis = 0, none = 0;
for (const c of ciks) { const f = await latestInstanceFacts(c, asOf, `${cache}/instances`); if (f && f.length) withAxis++; else none++; }
console.log(JSON.stringify({ issuers: ciks.length, withDebtAxisFacts: withAxis, none }));
})();
