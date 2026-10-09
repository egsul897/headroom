# Cycle — mass precedent expansion

**Tip:** see latest commit on `cursor/covenant-intelligence-ipv04-af81`  
**Paid inference:** 0 · **promotedToLegalTruth:** 0

## Volume (Neon after waves)

| Metric | Count |
|---|---|
| Knowledge sources with durable bytes | ~730 |
| Packages with covenantSummary | ~669+ |
| Mass-precedent-expansion refreshes | 105+ (plus force-refresh wave) |
| Neon recovered-defs targets | 12 |
| Sum summary items (across packages) | ~30k |
| Grower basket signals | ~360+ |
| Builder / Available Amount signals | ~553+ |
| Incremental path signals | ~152+ |
| Packages with both Debt + Liens categories | ~237 |

## Agreements / packages newly exercised this cycle
- Crowns 7th amendment, Live Nation amendments, Snowflake, RBC, McKesson, Peloton, Maravai, Chewy alt, Caterpillar 364-day + 3Y A&R, JetBlue indenture, Accenture CA, Oceaneering A&R pair, DSGR 2nd A&R, final-lightweight term loan / A&R, Crowne/ex4march2017 indenture, plus ~100 ehb financing docs
- Fixture validation: Riot S&R CA, LSB ABL Art. VI, FWRG Art. VI, Gibraltar, Chewy, CONMED VII

## Accuracy fixes shipped while expanding
1. `(A)/(B)` growers + spelled percents (`fifteen percent (15%)`)
2. Longer excerpts for Permitted Liens / Investments / Indebtedness / AA / Incremental defs (400→3200)
3. Attach grower/shared signals from Permitted * defs onto GP covenant items
4. Indenture `Incurrence of Indebtedness` family mapping
5. Honest secured-debt lead when only one regime is retrieved
6. Mass-precedent expansion runner (`scripts/product/expand-mass-precedent.ts`)

## Material remaining gaps
- IG CAs (Caterpillar/Accenture) often lack a classic Liens GP → dual-regime false is honest
- Indentures frequently Liens-only or debt under different taxonomy
- Suja HTML shell: many defs, almost no section candidates
- Riot Neon HTML weaker than extracted-text fixture path
- SEC live batch not run (fetch owner / live-write env unset)
- Anti-stack / reclass / full AA limb arithmetic still signals, not structured IR

## Certification
No package promoted. All writes set `promotedToLegalTruth: 0`.
