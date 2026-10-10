#!/usr/bin/env python3
"""Acquire and freeze AutoNation (AN) authentic evaluation package.

No compiler / Headroom pipeline invocation. Title-block fit only.
"""
from __future__ import annotations

import hashlib
import html as H
import json
import os
import re
import urllib.request
from datetime import datetime, timezone

UA = "Headroom-Agent11-Acceptance/1.0 (contact: engineering@headroom-app.example)"
BASE = "/workspace/tests/fixtures/unseen-packages/an-2020-2026-credit-facility"
ACQ = datetime.now(timezone.utc).isoformat()

DOCS = [
    {
        "documentId": "doc-a",
        "label": "AutoNation, Inc. Third Amended and Restated Credit Agreement (2020-03-26)",
        "role": "PRIOR_AMENDED_AND_RESTATED_CREDIT_AGREEMENT",
        "agreementDate": "2020-03-26",
        "filingDate": "2020-03-26",
        "form": "8-K",
        "accession": "0000350698-20-000060",
        "exhibit": "EX-10.1",
        "cik": "0000350698",
        "ticker": "AN",
        "issuer": "AutoNation, Inc.",
        "url": "https://www.sec.gov/Archives/edgar/data/350698/000035069820000060/ex101creditagreement.htm",
        "rawName": "doc-a-2020-03-26-third-ar-credit-agreement.htm",
        "textName": "doc-a-2020-03-26-third-ar-credit-agreement.txt",
    },
    {
        "documentId": "doc-b",
        "label": "AutoNation, Inc. Fifth Amended and Restated Credit Agreement (2026-09-14)",
        "role": "CURRENT_AMENDED_AND_RESTATED_CREDIT_AGREEMENT",
        "agreementDate": "2026-09-14",
        "filingDate": "2026-09-15",
        "form": "8-K",
        "accession": "0001193125-26-391953",
        "exhibit": "EX-10.1",
        "cik": "0000350698",
        "ticker": "AN",
        "issuer": "AutoNation, Inc.",
        "url": "https://www.sec.gov/Archives/edgar/data/350698/000119312526391953/d83423dex101.htm",
        "rawName": "doc-b-2026-09-14-fifth-ar-credit-agreement.htm",
        "textName": "doc-b-2026-09-14-fifth-ar-credit-agreement.txt",
    },
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=180) as r:
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
            "rawPath": f"tests/fixtures/unseen-packages/an-2020-2026-credit-facility/raw-html/{d['rawName']}",
            "extractedPath": f"tests/fixtures/unseen-packages/an-2020-2026-credit-facility/extracted-text/{d['textName']}",
            "rawBytes": len(raw),
            "extractedChars": len(text),
            "rawSha256": hashlib.sha256(raw).hexdigest(),
            "extractedSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "acquiredAtUtc": ACQ,
        }
        manifest.append(entry)
        print(" ", entry["rawSha256"][:16], entry["extractedSha256"][:16], entry["extractedChars"])

    out = {
        "packageKey": "an-2020-2026-credit-facility",
        "issuer": "AutoNation, Inc.",
        "ticker": "AN",
        "cik": "0000350698",
        "role": "AGENT11_AUTHENTIC_EVALUATION_PACKAGE",
        "contaminationNote": "Absent from DEVELOPMENT/REGRESSION fixtures and from HEADROOM-5 sealed WOR holdout. Not used for compiler tuning on main tip.",
        "acquiredAtUtc": ACQ,
        "documents": manifest,
    }
    with open(os.path.join(BASE, "extraction-manifest.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
        f.write("\n")
    with open(os.path.join(BASE, "README.md"), "w", encoding="utf-8") as f:
        f.write(
            "# AutoNation (AN) 2020–2026 credit facility — Agent #11 evaluation package\n\n"
            "Authentic EDGAR exhibits frozen for independent end-to-end product acceptance.\n"
            "Do not treat as a sealed unseen holdout claim if this package is later reused for tuning.\n"
            "Fourth A&R intermediate filings were not located as standalone full-agreement exhibits; "
            "package uses Third A&R (2020) + Fifth A&R (2026).\n"
        )
    with open(os.path.join(BASE, ".gitignore"), "w", encoding="utf-8") as f:
        f.write("offline-eval-run/\n")
    print("wrote", os.path.join(BASE, "extraction-manifest.json"))


if __name__ == "__main__":
    main()
