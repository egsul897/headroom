import { SecAccessCoordinator } from "../../lib/edgar-historical-backfill/sec-access";
import { loadIssuerFilings } from "../../lib/edgar-historical-backfill/submissions";
import { archivesDocUrl } from "../../lib/edgar-historical-backfill/ibr-resolver";
import {
  exhibitsFromPrimaryDocument,
  parsePrimaryExhibitIndex,
  extractExhibitIndexWindow,
} from "../../lib/edgar-historical-backfill/primary-exhibit-index";

async function main() {
  const sec = new SecAccessCoordinator({ cacheDir: "/tmp/sec-ibr-probe3", maxRequestsPerSecond: 5 });
  const { filings } = await loadIssuerFilings(sec, { cik: "0000816956", ticker: "CNMD" }, { maxArchiveFiles: 0 });
  const f = filings.find((x) => x.form.startsWith("10-K") && x.primaryDocument);
  if (!f) throw new Error("no 10-K");
  console.log("filing", f.accessionNumber, f.primaryDocument);
  const url = archivesDocUrl(f.cik, f.accessionNumber, f.primaryDocument!);
  const r = await sec.getText(url);
  console.log("status", r.status, "len", r.text.length);
  const window = extractExhibitIndexWindow(r.text);
  console.log("window len", window.length, "head", window.slice(0, 200));
  const rows = parsePrimaryExhibitIndex(r.text);
  console.log("rows", rows.length);
  for (const row of rows.filter((x) => /credit|indenture|loan|amendment/i.test(x.description)).slice(0, 10)) {
    console.log(row.exhibitType, row.description.slice(0, 100), "IBR?", Boolean(row.ibrText));
  }
  const exhibits = exhibitsFromPrimaryDocument(f, r.text);
  console.log("exhibits", exhibits.length, exhibits.slice(0, 5).map((e) => [e.exhibitType, e.documentKind, e.isIncorporatedByReference, e.ibr?.resolvedAccessionNumber]));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
