#!/usr/bin/env python3
"""Acquire and freeze WOR holdout sources. Title-block fit already confirmed; no compiler run yet."""
from __future__ import annotations

import hashlib
import html as H
import json
import os
import re
import urllib.request
from datetime import datetime, timezone

UA = "Headroom-IndependentEval/1.0 (contact: engineering@headroom-app.example)"
BASE = "/workspace/tests/fixtures/unseen-packages/wor-2023-2026-credit-facility"
ACQ = datetime.now(timezone.utc).isoformat()

DOCS = [
    {
        "documentId": "doc-a",
        "label": "Worthington Industries, Inc. Fourth Amended and Restated Credit Agreement (2023-09-27)",
        "role": "PRIOR_AMENDED_AND_RESTATED_CREDIT_AGREEMENT",
        "agreementDate": "2023-09-27",
        "filingDate": "2023-09-28",
        "form": "8-K",
        "accession": "0000950170-23-050472",
        "exhibit": "EX-4.1",
        "cik": "0000108516",
        "url": "https://www.sec.gov/Archives/edgar/data/108516/000095017023050472/wor-ex4_1.htm",
        "rawName": "doc-a-2023-09-27-fourth-ar-credit-agreement.htm",
        "textName": "doc-a-2023-09-27-fourth-ar-credit-agreement.txt",
    },
    {
        "documentId": "doc-b",
        "label": "Worthington Enterprises, Inc. Fifth Amended and Restated Credit Agreement (2026-08-31)",
        "role": "CURRENT_AMENDED_AND_RESTATED_CREDIT_AGREEMENT",
        "agreementDate": "2026-08-31",
        "filingDate": "2026-08-31",
        "form": "8-K",
        "accession": "0001193125-26-376705",
        "exhibit": "EX-4.1",
        "cik": "0000108516",
        "url": "https://www.sec.gov/Archives/edgar/data/108516/000119312526376705/wor-ex4_1.htm",
        "rawName": "doc-b-2026-08-31-fifth-ar-credit-agreement.htm",
        "textName": "doc-b-2026-08-31-fifth-ar-credit-agreement.txt",
    },
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def extract_text(raw: bytes) -> str:
    text = raw.decode("utf-8", "replace")
    text = re.sub(r"(?is)<script.*?</script>", " ", text)
    text = re.sub(r"(?is)<style.*?</style>", " ", text)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p>", "\n", text)
    text = re.sub(r"(?i)</div>", "\n", text)
    text = re.sub(r"(?i)</tr>", "\n", text)
    text = re.sub(r"(?i)</li>", "\n", text)
    text = re.sub(r"(?i)</h[1-6]>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = H.unescape(text)
    lines = [re.sub(r"[ \t\f\v]+", " ", line).strip() for line in text.splitlines()]
    out: list[str] = []
    blank = 0
    for line in lines:
        if not line:
            blank += 1
            if blank <= 1:
                out.append("")
            continue
        blank = 0
        out.append(line)
    return "\n".join(out).strip() + "\n"


def main() -> None:
    os.makedirs(os.path.join(BASE, "raw-html"), exist_ok=True)
    os.makedirs(os.path.join(BASE, "extracted-text"), exist_ok=True)
    os.makedirs(os.path.join(BASE, "filings"), exist_ok=True)
    manifest = []
    for d in DOCS:
        print("fetching", d["documentId"], d["url"])
        raw = fetch(d["url"])
        raw_path = os.path.join(BASE, "raw-html", d["rawName"])
        with open(raw_path, "wb") as f:
            f.write(raw)
        text = extract_text(raw)
        text_path = os.path.join(BASE, "extracted-text", d["textName"])
        with open(text_path, "w", encoding="utf-8") as f:
            f.write(text)
        entry = {
            **d,
            "rawPath": f"tests/fixtures/unseen-packages/wor-2023-2026-credit-facility/raw-html/{d['rawName']}",
            "extractedPath": f"tests/fixtures/unseen-packages/wor-2023-2026-credit-facility/extracted-text/{d['textName']}",
            "rawBytes": len(raw),
            "rawSha256": hashlib.sha256(raw).hexdigest(),
            "extractedChars": len(text),
            "extractedSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "acquisitionTimestampUtc": ACQ,
            "userAgent": UA,
            "source": "SEC EDGAR",
        }
        manifest.append(entry)
        print(
            "  raw",
            entry["rawBytes"],
            entry["rawSha256"][:16],
            "text",
            entry["extractedChars"],
            entry["extractedSha256"][:16],
        )
    with open(os.path.join(BASE, "extraction-manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print("DONE", ACQ)


if __name__ == "__main__":
    main()
