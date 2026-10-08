import { SecAccessCoordinator } from "../../lib/edgar-historical-backfill/sec-access";

async function main() {
  const sec = new SecAccessCoordinator({ cacheDir: "/tmp/sec-ibr-probe2", maxRequestsPerSecond: 5 });
  const url = "https://www.sec.gov/Archives/edgar/data/816956/000081695626000009/cnmd-20251231.htm";
  const r = await sec.getText(url);
  console.log("status", r.status, "len", r.text.length);
  const text = r.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const ibr = [...text.matchAll(/incorporated by reference[\s\S]{0,180}/gi)].slice(0, 8);
  console.log("ibr mentions", ibr.length);
  for (const m of ibr) console.log("---", m[0].slice(0, 200));
  const credit = [...text.matchAll(/Exhibit 10\.\d+[^\n]{0,40}.{0,80}Credit Agreement.{0,160}/gi)].slice(0, 5);
  console.log("credit-ish", credit.length);
  for (const m of credit) console.log("---", m[0].slice(0, 240));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
