import {
  extractIbrFormAndDate,
  parseIncorporatedByReference,
  resolveIbrAccessionFromFilings,
} from "../../lib/edgar-historical-backfill/ibr-resolver";

const raw =
  "Incorporated by reference to Exhibit 10.1 of the Company's Current Report on Form 8-K filed with the Securities and Exchange Commission on June 16, 2025";
console.log(extractIbrFormAndDate(raw));
const ibr = parseIncorporatedByReference({
  description: "Eighth A&R Credit Agreement",
  documentCellText: raw,
  cik: "0000816956",
});
console.log(ibr);
const resolved = resolveIbrAccessionFromFilings(ibr, [
  { form: "8-K", filingDate: "2025-06-16", accessionNumber: "0001174947-25-000941" },
]);
console.log(resolved);
