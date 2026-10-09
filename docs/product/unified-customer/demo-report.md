# Unified customer product — demo report

- Company: `coherent`
- Generated: 2026-10-09T22:26:29.752Z
- Shared state fingerprint: `5387d65b23a798e7febd33cc`
- Authority: LEGACY_ENGINE
- Cost: $0 (no paid provider calls)

## Engine integration

- Position fingerprint match: true
- Ask handoff href: `/coherent/simulate?kind=SECURED_DEBT&amount=100&secured=1&date=2026-08-01&currency=USD&handoff=handoff_mv1jbp2j_ml76732f&stateFp=ec395938981090b57ee06cbd&q=Can+we+incur+%24100+million+of+secured+debt+on+2026-08-01%3F`
- Amount 100→250 fingerprint change: true
- Stale state rejected: true (STATE_FINGERPRINT_MISMATCH)

## Outcomes

- Position: **CONDITIONAL_OR_REVIEW_REQUIRED** — Position shows modeled capacity and thresholds from the shared engine. Affirmative permission requires a Simulate/Ask transaction with every applicable constraint clearing — not capacity figures alone.
- Simulate $100M: **SUPPORTED_PERMISSION** — All 8 tested governing constraint(s) clear for this scenario.
- Simulate $250M: **SUPPORTED_PERMISSION** — All 8 tested governing constraint(s) clear for this scenario.

## Provenance sample

- (no binding provision on this run)
