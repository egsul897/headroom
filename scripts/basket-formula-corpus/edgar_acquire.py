#!/usr/bin/env python3
"""
Acquire authentic credit-agreement exhibits from SEC EDGAR for Phase 2 corpus expansion.

Stores under docs/.../phase-2/edgar-acquisitions/ — does NOT modify Claude-owned fixtures.
No paid APIs. Subject to SEC availability and fair-access rate limits.
"""

from __future__ import annotations

import hashlib
import json
import re
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/covenant-basket-capacity-formula-library/phase-2/edgar-acquisitions"
UA = "HeadroomBasketFormulaResearch/2.0 (contact: engineering@headroom-app.example)"
CTX = ssl.create_default_context()
SLEEP = 0.12  # stay under SEC fair-access guidance

# Diversified issuers across sectors; avoid concentrating on already-used instruments.
TICKERS = [
    "AAPL", "MSFT", "JNJ", "XOM", "JPM", "WMT", "PG", "CVX", "HD", "MRK",
    "ABBV", "KO", "PEP", "COST", "MCD", "CSCO", "ACN", "TMO", "DHR", "LIN",
    "ADBE", "CRM", "NFLX", "AMD", "INTC", "QCOM", "TXN", "AMAT", "NOW", "INTU",
    "UNH", "LLY", "PFE", "BMY", "GILD", "AMGN", "MDT", "SYK", "ISRG", "BSX",
    "CAT", "DE", "GE", "HON", "UPS", "FDX", "BA", "LMT", "RTX", "NOC",
    "NEE", "DUK", "SO", "D", "AEP", "SRE", "EXC", "PCG", "ED", "XEL",
    "BAC", "WFC", "GS", "MS", "C", "BLK", "SCHW", "AXP", "USB", "PNC",
    "T", "VZ", "CMCSA", "DIS", "NKE", "SBUX", "LOW", "TJX", "TGT", "BKNG",
    "ORCL", "IBM", "AVGO", "MU", "LRCX", "KLAC", "SNPS", "CDNS", "ADI", "NXPI",
    "PM", "MO", "CL", "EL", "KMB", "GIS", "K", "HSY", "STZ", "TAP",
    "F", "GM", "DAL", "UAL", "MAR", "HLT", "MMM", "EMR", "ITW", "ETN",
    "SHW", "ECL", "APD", "DD", "DOW", "PPG", "NEM", "FCX", "VLO", "MPC",
    "COP", "EOG", "SLB", "OXY", "PSX", "HAL", "BKR", "DVN", "FANG", "HES",
]

EXHIBIT_KW = re.compile(r"credit agreement|amended and restated credit|term loan credit|revolving credit agreement", re.I)
PROSE_EXT = {".htm", ".html", ".txt"}
# Skip issuers already heavily represented in Phase 1 corpus
SKIP_TITLES = re.compile(r"chewy|gibraltar|distribution solutions|conmed|lsb industries|superior industries|first watch|riot platform", re.I)


def fetch(url: str, accept: str = "*/*") -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read() if e.fp else b""


def strip_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    html = re.sub(r"</(p|div|tr|h[1-6]|li|br)\s*>", "\n", html, flags=re.I)
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    html = re.sub(r"<[^>]+>", " ", html)
    html = (
        html.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&mdash;", "—")
        .replace("&ndash;", "–")
        .replace("&rsquo;", "’")
        .replace("&lsquo;", "‘")
        .replace("&rdquo;", "”")
        .replace("&ldquo;", "“")
    )
    lines = [" ".join(l.split()) for l in html.splitlines()]
    return "\n".join(l for l in lines if l)


def parse_index_rows(html: str) -> list[dict]:
    rows = []
    for row_html in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", html, flags=re.I):
        cells = re.findall(r"<td[^>]*>([\s\S]*?)</td>", row_html, flags=re.I)
        if len(cells) != 5:
            continue
        desc, document_cell, typ = cells[1], cells[2], cells[3]
        m = re.search(r'<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>', document_cell, flags=re.I)
        if not m:
            continue
        href = m.group(1)
        link_text = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        filename = href.split("/")[-1] or link_text
        rows.append(
            {
                "description": re.sub(r"<[^>]+>", "", desc).strip(),
                "type": re.sub(r"<[^>]+>", "", typ).strip(),
                "href": href,
                "filename": filename,
            }
        )
    return rows


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / "acquisition-manifest.json"
    existing = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"documents": [], "failures": []}
    have = {(d.get("ticker"), d.get("accession"), d.get("filename")) for d in existing["documents"]}

    time.sleep(SLEEP)
    st, body = fetch("https://www.sec.gov/files/company_tickers.json", "application/json")
    if st != 200:
        raise SystemExit(f"ticker map failed: {st}")
    tickers = json.loads(body)
    cik_map: dict[str, tuple[str, str]] = {}
    for e in tickers.values():
        t = e["ticker"].upper()
        if t in TICKERS:
            cik_map[t] = (str(e["cik_str"]).zfill(10), e["title"])

    target_docs = 100
    acquired = len(existing["documents"])
    print(f"starting with {acquired} docs; target {target_docs}; resolved tickers {len(cik_map)}")

    for ticker in TICKERS:
        if acquired >= target_docs:
            break
        if ticker not in cik_map:
            continue
        cik, title = cik_map[ticker]
        if SKIP_TITLES.search(title or ""):
            continue
        time.sleep(SLEEP)
        st, body = fetch(f"https://data.sec.gov/submissions/CIK{cik}.json", "application/json")
        if st != 200:
            existing["failures"].append({"ticker": ticker, "stage": "submissions", "status": st})
            continue
        data = json.loads(body)
        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        accessions = recent.get("accessionNumber", [])
        dates = recent.get("filingDate", [])
        # Prefer 8-K then 10-K/10-Q
        candidates = []
        for i, form in enumerate(forms):
            if form not in ("8-K", "10-K", "10-Q"):
                continue
            candidates.append((form, accessions[i], dates[i]))
        # Cap filings inspected per issuer to diversify
        hits_this_issuer = 0
        for form, accession, filing_date in candidates[:40]:
            if acquired >= target_docs or hits_this_issuer >= 2:
                break
            acc_nodash = accession.replace("-", "")
            cik_nolead = str(int(cik))
            index_url = f"https://www.sec.gov/Archives/edgar/data/{cik_nolead}/{acc_nodash}/{accession}-index.htm"
            time.sleep(SLEEP)
            st, idx_body = fetch(index_url)
            if st != 200:
                continue
            index_html = idx_body.decode("utf-8", errors="replace")
            for row in parse_index_rows(index_html):
                blob = f"{row['description']} {row['type']} {row['filename']}"
                if not EXHIBIT_KW.search(blob):
                    continue
                ext = Path(row["filename"]).suffix.lower()
                if ext not in PROSE_EXT:
                    continue
                key = (ticker, accession, row["filename"])
                if key in have:
                    continue
                href = row["href"]
                if href.startswith("http"):
                    doc_url = href
                elif href.startswith("/"):
                    doc_url = f"https://www.sec.gov{href}"
                else:
                    doc_url = f"https://www.sec.gov/Archives/edgar/data/{cik_nolead}/{acc_nodash}/{href}"
                time.sleep(SLEEP)
                st, raw = fetch(doc_url)
                if st != 200 or len(raw) < 5000:
                    existing["failures"].append(
                        {"ticker": ticker, "accession": accession, "filename": row["filename"], "status": st, "bytes": len(raw)}
                    )
                    continue
                # Size guard — keep research extracts manageable
                if len(raw) > 8_000_000:
                    existing["failures"].append(
                        {"ticker": ticker, "accession": accession, "filename": row["filename"], "reason": "too_large", "bytes": len(raw)}
                    )
                    continue
                text = strip_html(raw.decode("utf-8", errors="replace"))
                # Require covenant-ish language to avoid junk exhibits
                if not re.search(r"Indebtedness|Restricted Payment|Permitted Lien|Available Amount|Credit Agreement", text, re.I):
                    existing["failures"].append(
                        {"ticker": ticker, "accession": accession, "filename": row["filename"], "reason": "no_covenant_signals"}
                    )
                    continue
                doc_id = f"{ticker.lower()}-{accession.replace('-', '')}-{Path(row['filename']).stem}"[:120]
                doc_dir = OUT / doc_id
                doc_dir.mkdir(parents=True, exist_ok=True)
                raw_path = doc_dir / "source.html"
                text_path = doc_dir / "extracted.txt"
                meta_path = doc_dir / "provenance.json"
                raw_path.write_bytes(raw)
                text_path.write_text(text, encoding="utf-8")
                meta = {
                    "docId": doc_id,
                    "ticker": ticker,
                    "issuer": title,
                    "cik": cik,
                    "accession": accession,
                    "filingDate": filing_date,
                    "form": form,
                    "filename": row["filename"],
                    "description": row["description"],
                    "sourceUrl": doc_url,
                    "source": "SEC EDGAR",
                    "userAgent": UA,
                    "retrievalTimestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "bodySha256": hashlib.sha256(raw).hexdigest(),
                    "bodyBytes": len(raw),
                    "extractedTextSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                    "extractedChars": len(text),
                    "parser": "scripts/basket-formula-corpus/edgar_acquire.py strip_html",
                    "phase1FixtureUntouched": True,
                }
                meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
                existing["documents"].append(
                    {
                        "docId": doc_id,
                        "ticker": ticker,
                        "issuer": title,
                        "cik": cik,
                        "accession": accession,
                        "filingDate": filing_date,
                        "form": form,
                        "filename": row["filename"],
                        "sourceUrl": doc_url,
                        "relativeDir": str(doc_dir.relative_to(ROOT)),
                        "extractedTextPath": str(text_path.relative_to(ROOT)),
                        "bodySha256": meta["bodySha256"],
                        "extractedTextSha256": meta["extractedTextSha256"],
                        "extractedChars": len(text),
                    }
                )
                have.add(key)
                acquired += 1
                hits_this_issuer += 1
                print(f"[{acquired}/{target_docs}] {ticker} {accession} {row['filename']} chars={len(text)}")
                # Persist incrementally
                existing["acquiredCount"] = acquired
                existing["distinctIssuers"] = len({d["ticker"] for d in existing["documents"]})
                existing["targetDocuments"] = target_docs
                existing["note"] = "Convenience EDGAR sample for formula research; do not claim market prevalence."
                manifest_path.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")
                if hits_this_issuer >= 2:
                    break

    existing["acquiredCount"] = len(existing["documents"])
    existing["distinctIssuers"] = len({d["ticker"] for d in existing["documents"]})
    existing["targetDocuments"] = target_docs
    existing["acquisitionComplete"] = existing["acquiredCount"] >= target_docs
    existing["note"] = "Convenience EDGAR sample for formula research; do not claim market prevalence."
    manifest_path.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"acquired": existing["acquiredCount"], "issuers": existing["distinctIssuers"], "failures": len(existing["failures"])}, indent=2))


if __name__ == "__main__":
    main()
