import { SecAccessCoordinator } from "../../lib/edgar-historical-backfill/sec-access";
import { loadIssuerFilings } from "../../lib/edgar-historical-backfill/submissions";
import { indexUrlFor } from "../../lib/edgar-historical-backfill/ibr-resolver";
import { parseIndexExhibitRows } from "../../lib/edgar-historical-backfill/index-parser";

async function main() {
  const sec = new SecAccessCoordinator({ cacheDir: "/tmp/sec-ibr-probe", maxRequestsPerSecond: 5 });
  const { filings } = await loadIssuerFilings(sec, { cik: "0000816956", ticker: "CNMD" }, { maxArchiveFiles: 1 });
  const tens = filings.filter((f) => f.form.startsWith("10-K")).slice(0, 2);
  for (const f of tens) {
    const url = indexUrlFor(f.cik, f.accessionNumber);
    const r = await sec.getText(url);
    const rows = parseIndexExhibitRows(r.text);
    const ibrish = rows.filter(
      (row) => /incorporat/i.test(row.description + row.documentCellText) || (!row.href && /EX-10|EX-4/i.test(row.type)),
    );
    console.log(f.accessionNumber, f.filingDate, "rows", rows.length, "ibrish", ibrish.length);
    for (const row of ibrish.slice(0, 8)) {
      console.log(" ", row.type, JSON.stringify(row.description).slice(0, 120), "href", row.href, "doc", row.documentCellText.slice(0, 100));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
