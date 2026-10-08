#!/usr/bin/env python3
"""
Faster EDGAR acquisition from curated, previously-identified exhibit URLs in-repo
plus index-driven fetches for mid-cap issuers known to have credit-agreement exhibits.

Does not modify Claude-owned fixtures. No paid APIs.
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
SLEEP = 0.15

# Direct exhibit URLs harvested from existing selection logs (metadata only; bodies fetched now).
DIRECT_URLS = [
    ("BV", "BrightView Holdings, Inc.", "https://www.sec.gov/Archives/edgar/data/1734713/000119312526206439/bv-ex10_1.htm"),
    ("CHWY_ALT", "Chewy alt exhibit ref", "https://www.sec.gov/Archives/edgar/data/1766502/000119312526281042/d43042dex101.htm"),  # may be chewy-related from selection
    ("ALKS", "Alkermes plc", "https://www.sec.gov/Archives/edgar/data/1520262/000119312526345901/alks-ex10_1.htm"),
    ("MRVI", "Maravai LifeSciences", "https://www.sec.gov/Archives/edgar/data/1823239/000182323926000049/newcreditagreement.htm"),
    ("PTON", "Peloton Interactive", "https://www.sec.gov/Archives/edgar/data/1806347/000110465926079351/tm2618568d1_ex10-1.htm"),
    ("SNOW_SEL", "Selection pool exhibit", "https://www.sec.gov/Archives/edgar/data/1822479/000119312526232585/d107933dex101.htm"),
    ("GDDY", "GoDaddy selection", "https://www.sec.gov/Archives/edgar/data/1609711/000160971126000092/ex101-73126.htm"),
    ("SUJA", "Suja Life", "https://www.sec.gov/Archives/edgar/data/1934114/000162828026058249/suja-arcreditagreement20.htm"),
    ("AEO", "American Eagle Outfitters", "https://www.sec.gov/Archives/edgar/data/919012/000119312526266017/aeo-ex10_1.htm"),
    ("AEO2", "American Eagle Outfitters", "https://www.sec.gov/Archives/edgar/data/919012/000119312526266019/aeo-ex10_1.htm"),
    ("MCK", "McKesson", "https://www.sec.gov/Archives/edgar/data/927653/000092765326000167/mck_ex101termloanagreement.htm"),
    ("CHEF", "The Chefs Warehouse selection", "https://www.sec.gov/Archives/edgar/data/785956/000143774926020193/ex_975043.htm"),
    ("RBC", "RBC selection", "https://www.sec.gov/Archives/edgar/data/1601548/000162828026039479/exhibit101-8xkxv2xxrbcxa.htm"),
    # Index pages → resolve exhibits
]

INDEX_URLS = [
    ("SSD", "Simpson Manufacturing Co., Inc.", "https://www.sec.gov/Archives/edgar/data/920371/000162828025058560/0001628280-25-058560-index.htm"),
    ("FANG", "Diamondback Energy, Inc.", "https://www.sec.gov/Archives/edgar/data/1539838/000114036125009880/0001140361-25-009880-index.htm"),
    ("CACI", "CACI International Inc", "https://www.sec.gov/Archives/edgar/data/16058/000162828025054481/0001628280-25-054481-index.htm"),
    ("BHE", "Benchmark Electronics Inc", "https://www.sec.gov/Archives/edgar/data/863436/000095017025091542/0000950170-25-091542-index.htm"),
    ("REZI", "Resideo Technologies, Inc.", "https://www.sec.gov/Archives/edgar/data/1740332/000121390026065300/0001213900-26-065300-index.htm"),
    ("ASTH", "Astrana Health, Inc.", "https://www.sec.gov/Archives/edgar/data/1083446/000110465925018221/0001104659-25-018221-index.htm"),
    ("UEIC", "Universal Electronics Inc", "https://www.sec.gov/Archives/edgar/data/101984/000010198426000037/0000101984-26-000037-index.htm"),
    ("KTB", "Kontoor Brands, Inc.", "https://www.sec.gov/Archives/edgar/data/1760965/000176096525000022/0001760965-25-000022-index.htm"),
    ("LEA", "Lear Corporation", "https://www.sec.gov/Archives/edgar/data/842162/000084216225000065/0000842162-25-000065-index.htm"),
]

# Additional mid-cap tickers likely to file CA exhibits
MIDCAPS = [
    "GPK", "TEX", "CNMD", "MATW", "ROCK", "DSGR", "FWRG", "RIOT", "SUP", "CHWY",
    "CACI", "BHE", "REZI", "ASTH", "UEIC", "KTB", "LEA", "SSD", "FANG", "AEO",
    "ALKS", "MRVI", "PTON", "MCK", "BV", "HBI", "PENN", "FYBR", "POST", "SAH",
    "GTN", "AMCX", "WW", "DBI", "GES", "ANF", "URBN", "FL", "GPS", "BKE",
    "CROX", "DECK", "SKX", "GO", "OLLI", "FIVE", "BURL", "ROST", "DG", "DLTR",
    "TSN", "HRL", "CPB", "CAG", "SJM", "MKC", "LW", "INGR", "DAR", "BG",
    "CF", "MOS", "NTR", "FMC", "EMN", "CE", "LYB", "WLK", "ASH", "RPM",
    "ATR", "SLGN", "SON", "GEF", "PKG", "WRK", "IP", "SEE", "AVY", "BERY",
]


def fetch(url: str) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=90) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read() if e.fp else b""
    except Exception as e:
        return 0, str(e).encode()


def strip_html(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    html = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    html = re.sub(r"</(p|div|tr|h[1-6]|li|br)\s*>", "\n", html, flags=re.I)
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    html = re.sub(r"<[^>]+>", " ", html)
    for a, b in [
        ("&nbsp;", " "),
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", '"'),
        ("&#39;", "'"),
        ("&mdash;", "—"),
        ("&ndash;", "–"),
        ("&rsquo;", "’"),
        ("&lsquo;", "‘"),
        ("&rdquo;", "”"),
        ("&ldquo;", "“"),
    ]:
        html = html.replace(a, b)
    return "\n".join(" ".join(l.split()) for l in html.splitlines() if l.strip())


def parse_index_rows(html: str) -> list[dict]:
    rows = []
    for row_html in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", html, flags=re.I):
        cells = re.findall(r"<td[^>]*>([\s\S]*?)</td>", row_html, flags=re.I)
        if len(cells) != 5:
            continue
        desc, document_cell, typ = cells[1], cells[2], cells[3]
        m = re.search(r'<a[^>]*href="([^"]+)"[^>]*>', document_cell, flags=re.I)
        if not m:
            continue
        href = m.group(1)
        filename = href.split("/")[-1]
        rows.append(
            {
                "description": re.sub(r"<[^>]+>", "", desc).strip(),
                "type": re.sub(r"<[^>]+>", "", typ).strip(),
                "href": href,
                "filename": filename,
            }
        )
    return rows


def save_doc(ticker: str, issuer: str, url: str, raw: bytes, existing: dict) -> bool:
    if len(raw) < 8000 or len(raw) > 12_000_000:
        return False
    text = strip_html(raw.decode("utf-8", errors="replace"))
    if not re.search(r"Indebtedness|Restricted Payment|Credit Agreement|Permitted Lien", text, re.I):
        return False
    if len(text) < 3000:
        return False
    filename = url.rstrip("/").split("/")[-1]
    accession_guess = re.search(r"/(\d{16}|\d{10}-\d{2}-\d{6})/", url)
    acc = accession_guess.group(1) if accession_guess else "unknown"
    doc_id = f"{ticker.lower()}-{re.sub(r'[^a-zA-Z0-9]+', '', acc)[:20]}-{Path(filename).stem}"[:120]
    if any(d["docId"] == doc_id for d in existing["documents"]):
        return False
    # Dedup by body hash
    body_hash = hashlib.sha256(raw).hexdigest()
    if any(d.get("bodySha256") == body_hash for d in existing["documents"]):
        return False
    doc_dir = OUT / doc_id
    doc_dir.mkdir(parents=True, exist_ok=True)
    (doc_dir / "source.html").write_bytes(raw)
    (doc_dir / "extracted.txt").write_text(text, encoding="utf-8")
    meta = {
        "docId": doc_id,
        "ticker": ticker,
        "issuer": issuer,
        "sourceUrl": url,
        "filename": filename,
        "source": "SEC EDGAR",
        "userAgent": UA,
        "retrievalTimestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "bodySha256": body_hash,
        "bodyBytes": len(raw),
        "extractedTextSha256": hashlib.sha256(text.encode()).hexdigest(),
        "extractedChars": len(text),
        "parser": "edgar_acquire_curated.py strip_html",
        "phase1FixtureUntouched": True,
        "acquisitionMode": "CURATED_URL_OR_INDEX",
    }
    (doc_dir / "provenance.json").write_text(json.dumps(meta, indent=2) + "\n")
    existing["documents"].append(
        {
            "docId": doc_id,
            "ticker": ticker,
            "issuer": issuer,
            "filename": filename,
            "sourceUrl": url,
            "relativeDir": str(doc_dir.relative_to(ROOT)),
            "extractedTextPath": str((doc_dir / "extracted.txt").relative_to(ROOT)),
            "bodySha256": body_hash,
            "extractedTextSha256": meta["extractedTextSha256"],
            "extractedChars": len(text),
        }
    )
    print(f"[{len(existing['documents'])}] {ticker} {filename} chars={len(text)}")
    return True


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / "acquisition-manifest.json"
    existing = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"documents": [], "failures": []}

    # 1) Direct URLs
    for ticker, issuer, url in DIRECT_URLS:
        time.sleep(SLEEP)
        st, raw = fetch(url)
        if st != 200:
            existing["failures"].append({"ticker": ticker, "url": url, "status": st})
            continue
        save_doc(ticker, issuer, url, raw, existing)
        manifest_path.write_text(json.dumps(existing, indent=2) + "\n")

    # 2) Index pages
    kw = re.compile(r"credit agreement|term loan|revolving credit", re.I)
    for ticker, issuer, index_url in INDEX_URLS:
        time.sleep(SLEEP)
        st, raw = fetch(index_url)
        if st != 200:
            existing["failures"].append({"ticker": ticker, "url": index_url, "status": st})
            continue
        html = raw.decode("utf-8", errors="replace")
        base = index_url.rsplit("/", 1)[0]
        for row in parse_index_rows(html):
            blob = f"{row['description']} {row['type']} {row['filename']}"
            if not kw.search(blob):
                continue
            ext = Path(row["filename"]).suffix.lower()
            if ext not in {".htm", ".html", ".txt"}:
                continue
            href = row["href"]
            if href.startswith("http"):
                doc_url = href
            elif href.startswith("/"):
                doc_url = "https://www.sec.gov" + href
            else:
                doc_url = base + "/" + href
            time.sleep(SLEEP)
            st, raw = fetch(doc_url)
            if st != 200:
                existing["failures"].append({"ticker": ticker, "url": doc_url, "status": st})
                continue
            save_doc(ticker, issuer, doc_url, raw, existing)
            manifest_path.write_text(json.dumps(existing, indent=2) + "\n")

    # 3) Mid-cap submissions sweep (limited filings each)
    time.sleep(SLEEP)
    st, body = fetch("https://www.sec.gov/files/company_tickers.json")
    tickers = json.loads(body) if st == 200 else {}
    cik_map = {}
    for e in tickers.values():
        t = e["ticker"].upper()
        if t in MIDCAPS:
            cik_map[t] = (str(e["cik_str"]).zfill(10), e["title"])

    target = 100
    for ticker in MIDCAPS:
        if len(existing["documents"]) >= target:
            break
        if ticker not in cik_map:
            continue
        cik, title = cik_map[ticker]
        time.sleep(SLEEP)
        st, body = fetch(f"https://data.sec.gov/submissions/CIK{cik}.json")
        if st != 200:
            continue
        data = json.loads(body)
        recent = data.get("filings", {}).get("recent", {})
        hits = 0
        for i, form in enumerate(recent.get("form", [])[:25]):
            if form not in ("8-K", "10-K", "10-Q"):
                continue
            if hits >= 2 or len(existing["documents"]) >= target:
                break
            accession = recent["accessionNumber"][i]
            acc_nodash = accession.replace("-", "")
            cik_nolead = str(int(cik))
            index_url = f"https://www.sec.gov/Archives/edgar/data/{cik_nolead}/{acc_nodash}/{accession}-index.htm"
            time.sleep(SLEEP)
            st, idx = fetch(index_url)
            if st != 200:
                continue
            html = idx.decode("utf-8", errors="replace")
            for row in parse_index_rows(html):
                blob = f"{row['description']} {row['type']} {row['filename']}"
                if not kw.search(blob):
                    continue
                if Path(row["filename"]).suffix.lower() not in {".htm", ".html", ".txt"}:
                    continue
                href = row["href"]
                if href.startswith("http"):
                    doc_url = href
                elif href.startswith("/"):
                    doc_url = "https://www.sec.gov" + href
                else:
                    doc_url = f"https://www.sec.gov/Archives/edgar/data/{cik_nolead}/{acc_nodash}/{href}"
                time.sleep(SLEEP)
                st, raw = fetch(doc_url)
                if st != 200:
                    continue
                if save_doc(ticker, title, doc_url, raw, existing):
                    hits += 1
                    manifest_path.write_text(json.dumps(existing, indent=2) + "\n")
                    break

    existing["acquiredCount"] = len(existing["documents"])
    existing["distinctIssuers"] = len({d["issuer"] for d in existing["documents"]})
    existing["targetDocuments"] = target
    existing["acquisitionComplete"] = existing["acquiredCount"] >= target
    existing["note"] = "Convenience EDGAR sample for formula research; do not claim market prevalence."
    existing["claudeOwnedFixturesModified"] = False
    manifest_path.write_text(json.dumps(existing, indent=2) + "\n")
    print(json.dumps({"acquired": existing["acquiredCount"], "issuers": existing["distinctIssuers"], "failures": len(existing["failures"])}, indent=2))


if __name__ == "__main__":
    main()
