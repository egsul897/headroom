/**
 * Hand-rolled CSV parser (docs/autonomous-retrieval-phase-a-foundation.md) -
 * a full character-level RFC 4180-style state machine (quoted fields,
 * embedded commas/newlines inside quotes, escaped `""` quotes), deliberately
 * NOT a naive `line.split(",")` (unsafe for any real financial export a
 * spreadsheet tool produces) and deliberately NOT a new dependency either -
 * this codebase's own established "no unnecessary heavy deps" discipline
 * (see docs/document-onboarding-pipeline-foundation.md §D's choice of unpdf/
 * mammoth over native-binding alternatives for the same reason). This one
 * function is genuinely simple enough to hand-roll safely; a pivot-table-
 * grade Excel importer would not be, which is why this phase only accepts
 * CSV, not raw .xlsx.
 */

/** Parses raw CSV text into rows of string cells. Handles quoted fields, embedded commas/newlines within quotes, and doubled `""` as an escaped quote. Trailing blank lines are dropped; every other row (including a short/ragged one) is preserved as-is for the caller to validate. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  function endField() {
    row.push(field);
    field = "";
  }
  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < n) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Final field/row (a file with no trailing newline).
  if (field.length > 0 || row.length > 0) {
    endRow();
  }

  // Drop wholly-blank trailing rows (a common trailing-newline artifact).
  while (rows.length > 0) {
    const last = rows[rows.length - 1]!;
    if (last.length === 1 && last[0] === "") rows.pop();
    else break;
  }
  return rows;
}

/** Parses CSV text into an array of header-keyed row objects, using the first row as the header. Every value is a raw string - callers (e.g. CsvFinancialConnector) own their own type coercion/validation, deliberately kept out of this generic parser. */
export function parseCsvObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0]!.map((h) => h.trim());
  const objects: Record<string, string>[] = [];
  for (const dataRow of rows.slice(1)) {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = dataRow[idx] ?? "";
    });
    objects.push(obj);
  }
  return { headers, rows: objects };
}
