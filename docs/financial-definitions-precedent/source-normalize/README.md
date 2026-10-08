# Source-normalize sidecars

Owned by WS-FDP. Deterministic plaintext projections of HTML fixtures used for
stable `charStart`/`charEnd`/`excerptSha256` citations.

Generation rule (must match tests):
1. `html.unescape` (Python stdlib) or equivalent full entity decode
2. strip tags via `<[^>]+>` → space
3. collapse whitespace via `\s+` → single space

Upstream fixture path remains authoritative for EDGAR HTML bytes; this file is
a citation convenience, not a second legal source of truth.
