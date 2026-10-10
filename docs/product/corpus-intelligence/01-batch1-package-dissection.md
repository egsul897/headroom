# Batch 1 — Package dissection (source-backed)

Authority labels: **SOURCE** (document text) · **DISCOVERY** · **REPRESENTATION** · **EXECUTION** · **VERIFICATION**  
None of the below is CERTIFIED legal permission.

---

## Package 1 — Coherent (Indenture + Credit Agreement)

| Layer | Finding |
|-------|---------|
| SOURCE | Indenture MILA secured SSNL ≤ 3.00x room at seed financials = **$4,041M**; CA TNL ≤ 4.25x = **$5,129M** (unsecured-shaped). Permitted Liens cl.(6) auto-lien covers only §3.3(b)(i)/(b)(iv), not Ratio Debt. |
| DISCOVERY | Seed capacityFormulas + solver elections model both instruments. |
| REPRESENTATION | Pre-fix solver could free-ride SCF auto-lien → false-favorable Indenture secured / package min. |
| EXECUTION | After merge-gate: per-debt-leg lien coverage **and** independent-lien capacity/entity/shared-cap sufficiency; package `MODELED_CROSS_DOCUMENT` binds to $4,041 secured. |
| VERIFICATION | Independent arithmetic + adversarial synthetic package + election free-ride tests. Still **MODELED / EVALUATION_SEED_NOT_NS4_APPROVED**. |

**Material failure class closed:** false-favorable secured capacity; ratio Debt inheriting foreign auto-lien; COUNTED fixed+ratio double-count.

---

## Package 2 — CONMED 2025 credit facility

| Layer | Finding |
|-------|---------|
| SOURCE | Doc A = Eighth A&R CA (2025-06-10) operative base. Doc B = Guarantee & Collateral (same date). Doc C = Second Amendment (2022) to **Seventh** A&R — **not** Doc A. Doc D = First Omnibus Amendment (2026) amends A+B, adds $450M Term A-2. Art. VII: 7.2 Indebtedness (19 baskets), 7.3 Liens (16), 7.1 maintenance ratios (SSNL 3.75x / TNL 5.50x / ICR 2.75x), 7.6 RP incl. uncapped at SSNL ≤ 3.50x. |
| DISCOVERY | Fixture ground truth in `human-ground-truth.ts` (authored from source, not engine). |
| REPRESENTATION | Risk: treating Doc C as amending Doc A (same-name “Credit Agreement” heuristic) → wrong operative hierarchy. |
| EXECUTION | Unified product can run verified paths only with VEP+REQUIRE; CONMED seed permissions are not asserted as complete solver coverage here. |
| VERIFICATION | Package facts pkg-1…pkg-8 are independent SOURCE facts. Neon live package graph not re-queried this session. |

**Material omission / risk to track:** amendment-target identity must use explicit prior agreement identity (Seventh vs Eighth), not title similarity. Aligns with PR #246 SON fail-closed theme.

**Debt∩lien interaction (SOURCE):** 7.2(c) debt secured by Liens permitted under 7.3(g) requires pro forma 7.1 compliance — lien existence without financial-test clearance is insufficient (same class as election sufficiency hardening).

---

## Package 3 — Chewy 2026 Credit Agreement

| Layer | Finding |
|-------|---------|
| SOURCE | Single EX-10.1 CA dated 2026-06-23 (CIK 0001766502), ~288 pages; hash-pinned fixture. Contains Indebtedness/Liens limitations, Incremental Facility, First Lien Leverage Ratio tests, ABL interaction definitions. |
| DISCOVERY | Manifest only — not fully covenant-extracted in this batch. |
| REPRESENTATION | No customer-authoritative Chewy capacity model claimed on #250 tip. |
| EXECUTION | Suitable **unseen** stress for next extraction/election batch once Neon/auth available. |
| VERIFICATION | File hashes in `extraction-manifest.json`; no paid inference this session. |

**Next action for Chewy:** structural index §6.01/§6.02 baskets; map incremental first-lien ratio room; add adversarial election where incremental debt has no matching lien basket.

---

## Cross-package generalizable remediations

| Finding | Fix | Scope |
|---------|-----|-------|
| Lien path exists ≠ lien permits transaction | `evaluateElection` independent lien coverage pool (capacity, entity, shared headroom) | All secured elections |
| Auto-lien not transferable across debt legs | Per-debt-leg auto-link check (#231) | All secured elections |
| COUNTED fixed+ratio sum | max(fixed-only, disregarded+ratioRoom) | All single-ratio+fixed elections |
| Amendment targets wrong base | Track for #246 / next batch (CONMED Doc C) | Operative hierarchy |

## Quantified this batch

| Metric | Value |
|--------|-------|
| Unique packages dissected | 3 |
| Neon live documents processed | 0 (auth blocked) |
| New adversarial regressions | 4 (insufficient lien, entity exclusion, exhausted shared lien cap, wrong collateral) |
| CERTIFIED promotions | 0 |
| Paid inference | $0 |
