# Package-wide covenant coverage matrix

**Audit tip:** `8374fa2a` (`main`)  
**Scope:** Production compiler / verified rulebook / capacity graph / ledger / simulation engine — **not docs alone**.  
**Classification vocabulary (exactly one per domain):** `EXECUTABLE` | `PARTIAL` | `EVIDENCE_BLOCKED` | `UNSUPPORTED` | `NOT_IMPLEMENTED`  
**Fail-closed rule:** Never classify `EXECUTABLE` merely because a synthetic fixture passes. Prefer live/seed authentic packages (Coherent, Matthews) and authentic-source VE pins (MHK, Chewy, Conmed) over invented lab fixtures.

**Primary production entry points audited:**

| Layer | Paths |
|---|---|
| Legacy engine | `lib/covenant-engine.ts` — `evaluateProvision`, `computeCovenantPosition`, `simulateDebtIncurrence`, `simulateRestrictedPayment`, `simulateAssetSale`, `computeRemainingCapacityAfterDebtIncurrence`, `loadCompanyCovenantData` |
| Solver | `lib/solver/{service,election,coverage,graph,shared-usage,types}.ts` — `runSolver`, `evaluateElection`, `assessIndependentLienCoverageForDebtLeg`, `computeSharedConstraintCurrentUsage` |
| Capacity / remaining | `lib/capacity/{utilization-resolver,verified-remaining,utilization-authority,utilization-evidence-reconstruction}.ts` — `resolveUtilization`, `computeVerifiedRemaining` |
| Contract IR / runtime | `lib/contract-model/{ir,runtime/capacity,runtime/transaction,compiler/discovery,compiler/amendment,compiler/evaluator-registry}.ts` |
| Product composition | `lib/product/cross-domain-transaction.ts`, `lib/product/verified-transaction-execution/**`, `lib/product/north-star-workflow/**`, `lib/product/contractual-computation.ts` |

**PAI-01–12 (preservation):** Fixed on production paths in PR #330 (`docs/parallel-adversarial-intelligence/05-defect-closure-status.md`). Focused adversarial / home / capacity tests still encode PAI-01–12 behaviors at tip (as-of operative docs, RESOLVED-only tip edges, UNKNOWN scope fail-closed, utilization default UNKNOWN / VERIFIED_EMPTY opt-in, headroom withheld without `PRODUCTION_AUTHORITATIVE`, CI as-of vs effectiveness, entity omission ≠ SATISFIED, GROSS labeling, missing `pctEbitda` → `review_required`, empty atlas → AMBIGUOUS, no delivery from period asOf, governing-provision `targetDocumentId`).

**NS-4 integration (brief):** Product binder lives in `lib/product/north-star-workflow/` (`approved-financial-inputs.ts`, `authoritative-capacity.ts`, `certified-transaction.ts`, FCE certificate actions). APPROVED certificate snapshots can bind financial inputs; attributed ledger + completeness certificates gate remaining. Host trusted-issuer / IdP activation remains **BLOCKED** (`lib/capacity/trusted-issuer-host.ts`, VTE `classifyProductionAuthority` always blocks production authority). Live Position/Simulate remaining is stamped `NOT_PRODUCTION_AUTHORITATIVE` (`computeRemainingCapacityAfterDebtIncurrence`).

---

## Summary table

| # | Domain | Classification | One-line rationale |
|---|---|---|---|
| 1 | Debt incurrence and refinancing | **PARTIAL** | Live `simulateDebtIncurrence` (+ solver-native) clears/blocks configured packages; refinancing maturity / permitted-refinancing continuity not first-class. |
| 2 | Liens and secured debt | **PARTIAL** | Secured capacity + independent/auto-linked lien coverage in solver; automatic-link-only and priority/intercreditor gaps remain review/UNKNOWN. |
| 3 | Restricted payments and available amount | **PARTIAL** | RP waterfall + `BUILDER_BASKET`/`RATIO_GATE` execute on configured docs; Chewy builder pin held; attribution/remaining not certified. |
| 4 | Investments and acquisitions | **PARTIAL** | Investment = RP waterfall kind only; no separate Permitted Acquisition engine; intercompany unsupported. |
| 5 | Asset sales and proceeds application | **PARTIAL** | Excess-proceeds / offer trigger when `assetSale` configured; proceeds restore/repay requires explicit authority ref. |
| 6 | Affiliate transactions | **UNSUPPORTED** | Discovery + action ontology only; no solver grant, no simulation, no capacity consume path. |
| 7 | Guarantees | **PARTIAL** | Guarantor entity-scope / `GUARANTOR_CONDITION` on debt paths; standalone guarantee covenants not transaction-executable. |
| 8 | Financial maintenance covenants | **PARTIAL** | Ratio room / FCCR / contractual metrics on seed/live packages; springing and certificate-driven maintenance incomplete. |
| 9 | Subsidiary designation and structural restrictions | **UNSUPPORTED** | Actions/IR edges/types exist; redesignation records never applied; no designation simulator. |
| 10 | Cross-document shared capacity | **PARTIAL** | Cross-doc min binding + solver `SharedConstraint` + Phase 4C shared nodes; implicit stacking without express cap refused. |
| 11 | Amendments and operative versions | **PARTIAL** | Operative as-of / restatement chain / date-scoped load (PAI); no product auto-recompile of IR from amendment text. |
| 12 | Utilization, reclassification and historical transactions | **PARTIAL** | Fail-closed utilization/remaining + Phase 4C reclass elections; production issuer activation blocked; empty ≠ zero. |

**Counts:** EXECUTABLE 0 · PARTIAL 9 · EVIDENCE_BLOCKED 0 · UNSUPPORTED 2 · NOT_IMPLEMENTED 0

---

## 1. Debt incurrence and refinancing

**Classification: PARTIAL**

### A. Discovered contractual provisions
- Pass A signals: `covenant_verb` (`incur`…), `refinancing`, `ratio_expression`, `greater_lesser_of` — `lib/contract-model/compiler/discovery/pass-a-signals.ts:26–40`.
- Headline family `Indebtedness|Debt` — same file `:43`.
- Prisma `CovenantFamily.INDEBTEDNESS` — `prisma/schema.prisma:2104–2105`.
- Solver `GrantType.DEBT_INCURRENCE` — `lib/solver/types.ts:83`.
- Contract action `INCUR_DEBT` — `lib/contract-model/types.ts` / `action-ontology.ts:69`.

### B. Source-backed interpretation and operative authority
- Legacy provisions evaluated by `evaluateProvision` (`lib/covenant-engine.ts:339–461`).
- Solver-native `Permission` with `sourceProvision` citations (`lib/solver/types.ts:160–180`).
- Operative amendment lineage for IR rules via `OperativeLineageRef` (`lib/contract-model/ir/types.ts:120–126`).
- VTE operative authority adapters: `lib/product/verified-transaction-execution/adapters/operative-authority.ts` (`evaluateOperativeSourceAuthority`).

### C. Generalized executable representation
- Formula types: `FLAT_*`, `GREATER_OF_*`, `LEVERAGE_RATIO_ROOM`, `COVERAGE_RATIO_ROOM` (`lib/covenant-engine.ts:70–78`).
- Document `capacityFormulas` trees (`CapacityExpr` SUM/MIN/MAX/REF) — `:184–193`.
- Solver elections / paths: `runSolver` (`lib/solver/service.ts`), `evaluateElection` (`lib/solver/election.ts:517`).
- Product composition: `evaluateCrossDomainTransaction` debt leg (`lib/product/cross-domain-transaction.ts:300+`).

### D. Required financial and nonfinancial inputs
- Financial: EBITDA, cash, interest, total/secured debt, optional totalAssets, assumedNewDebtRatePct (`FinancialSnapshotInput`, `lib/covenant-engine.ts:233–247`).
- Nonfinancial: secured flag, amount, optional `SolverNativeCompanyContext` (entity classes, guarantor status, collateral, activation state) — `:926+`, `simulateDebtIncurrence` `:1135–1141`.
- Explicit transaction assumptions required on cross-domain path (`refuseWithoutAssumptions`, `cross-domain-transaction.ts:194–207`).

### E. Dependencies and shared-capacity relationships
- Cross-document binding via `combineCrossDocument` min (`covenant-engine.ts:622–646`).
- Solver stacking: `CONCURRENT_*`, `ALTERNATIVE`, `MUTUALLY_EXCLUSIVE`, `AUTOMATIC_LINKED_PERMISSION`, `SHARED_CONSTRAINT_PARTICIPATION` (`lib/solver/types.ts:203–212`).
- `SharedConstraint.followsRefinancing` field exists (`types.ts:250`) but refinancing continuity is not a first-class simulation effect.

### F. Ledger and historical utilization requirements
- Legacy remaining after debt: modeled subtract / solver recompute — **always** `utilizationRemainingAuthority: "NOT_PRODUCTION_AUTHORITATIVE"` (`covenant-engine.ts:1463–1466`).
- Product remaining requires `resolveUtilization` + completeness (`lib/capacity/verified-remaining.ts:86+`).
- Cross-domain **always withholds** verified remaining (`remainingAllowed` → false, `cross-domain-transaction.ts:216–218`).

### G. Supported transaction effects
- Clear / blocked / review_required / not_tested debt tests (`simulateDebtIncurrence`).
- Pro forma leverage & FCCR (`DebtIncurrenceProForma`, `:819–823`).
- Post-transaction remaining query (`computeRemainingCapacityAfterDebtIncurrence`, `:1322`).
- VTE / Phase 4D: `CONSUME_CAPACITY`, `CHANGE_METRIC` via recipes (`transaction-effect-recipes.ts`).

### H. Unsupported or ambiguous contractual conditions
- Refinancing maturity walls / permitted-refinancing identity not separately enforced (explicit package limitation, `cross-domain-transaction.ts:516–518`).
- Eligibility kinds without mechanical eval → UNKNOWN (`evaluatePermissionEligibility`, `election.ts:455–467`): ratings, intercreditor joinder, MFN, LCA freeze.
- First-lien-only / instrument-specific netting bases called out as unsupported in coverage inventory (`cross-domain-transaction.ts:125`).

### I. Actual tests against real financing documents
| Package | Nature | Evidence |
|---|---|---|
| **Coherent** | Live DB + seed authentic | `tests/solver/coherent-stacking-conclusions.test.ts`, `tests/solver/live-integration.test.ts`, `tests/product/cross-domain-transaction.test.ts` (uses `COHERENT_DATA` seed) |
| **Matthews** | Minimal package + authentic EBITDA evidence; live solver-native elsewhere | `cross-domain-scenarios.ts:139–195`, `docs/matthews-international-onboarding.md` shadow-run path; VE Position `tests/product/ve-position-matthews-mhk-acceptance.test.ts` |
| **MHK** | Authentic VE gross Position (fixed-dollar leaf), not full debt sim | same VE acceptance test |
| **Chewy / Conmed** | Discovery / stratified cert pins — **not** debt-sim execution | stratified-cert pins |
| Synthetic | `tests/synthetic-company.test.ts` — **not** grounds for EXECUTABLE | |

---

## 2. Liens and secured debt

**Classification: PARTIAL**

### A. Discovered contractual provisions
- Pass A: `pledge`, headline `Liens?` — `pass-a-signals.ts:35,43`.
- Family `LIENS`, roles `SECURITY_GRANT` — discovery types / normalization.
- `GrantType.LIEN` — `lib/solver/types.ts:83`.
- Action `CREATE_LIEN` — `lib/contract-model/types.ts:31`.

### B. Source-backed interpretation and operative authority
- Legal condition flags `automaticLinkOnly` / `assetScopeRestricted` — `covenant-engine.ts:137–154`.
- Lien coverage proof: `assessIndependentLienCoverageForDebtLeg` — `election.ts:176–387`.
- Collateral / priority model — `lib/solver/types.ts:278+` (`PriorityTier`, `PermissionCollateralScope`).

### C. Generalized executable representation
- Secured-side `capacityFormulas.secured` + `LEVERAGE_RATIO_ROOM(debtBasis=secured)`.
- Auto-link graph: `automaticallyLinkedPermissions` — `lib/solver/graph.ts:106–110`.
- Independent lien election members checked same-document, currency/FX fail-closed (`election.ts:207–235`).

### D. Required financial and nonfinancial inputs
- Same financial snapshot as debt; plus `Transaction.secured`, `requestedLienPriority`, collateral scopes, entity classes.
- Zero-threshold automatic-link liens cannot cover positive secured allocation without link (`election.ts:335–348`).

### E. Dependencies and shared-capacity relationships
- Debt leg requires lien path when secured (auto-link **or** proven independent lien).
- Cross-document free-riding of liens refused (`election.ts:208–211`).
- Shared secured ceilings via `SharedConstraint` when declared.

### F. Ledger and historical utilization
- Lien baskets participate in shared-usage measurement when members attributed (`shared-usage.ts:94+`).
- No separate “lien utilization” product simulator beyond shared/debt paths.

### G. Supported transaction effects
- Secured debt clear/block with lien requirements in solver-native path.
- Legacy secured capacity compare in `simulateDebtIncurrence`.

### H. Unsupported or ambiguous
- Automatic-link-only without independent ceiling → review / fail (`ProvisionLegalConditionFlags`).
- Intercreditor joinder / priority condition kinds often UNKNOWN.
- Product cross-domain marks `LIENS_SECURED_CAPACITY` **PARTIAL** (`cross-domain-transaction.ts:128–132`, `:432–434`).

### I. Tests
| Package | Nature |
|---|---|
| **Coherent** | Live: linked lien threshold 0, coverage traces — `coherent-stacking-conclusions.test.ts:70+`; adversarial `tests/solver/secured-debt-lien-adversarial.test.ts`, `secured-capacity-adversarial-matrix.test.ts` |
| **Conmed** | Stratified **discovery pin** §7.3(m) LIENS — `pin-candidate-conmed-liens.test.ts` (eligible pin, **not** solver execution) |
| Synthetic | Gate0 / fixture solver-native tests |

---

## 3. Restricted payments and available amount

**Classification: PARTIAL**

### A. Discovered contractual provisions
- Pass A: `builder_language` (`Available Amount`, `builder basket`, CNI) — `pass-a-signals.ts:39`.
- Family `RESTRICTED_PAYMENTS`; discovery role `BUILDER`.
- `GrantType.RESTRICTED_PAYMENT` — solver types.
- Action `PAY_DIVIDEND` — contract-model types.

### B. Source-backed interpretation and operative authority
- Document `rpWaterfall` JSON — schema `Document.rpWaterfall`, engine `RpWaterfallConfig` (`covenant-engine.ts:197–202`).
- Builder components cite section refs (`starterSectionRef`, `cniSectionRef`, `equitySectionRef`) — `:122–127`, evaluated `:412–447`.

### C. Generalized executable representation
- `BUILDER_BASKET`, `RATIO_GATE`, flat/greater-of steps in waterfall.
- `simulateRestrictedPayment` — `covenant-engine.ts:1513–1608`.
- IR may represent builder feeding via `BASKET_FEEDING` edges (`ir/types.ts` / validate acyclic set).

### D. Required financial and nonfinancial inputs
- EBITDA, cumulativeNetIncome, equityProceedsSinceIssue, leverage for ratio gate.
- PAI-09: missing `pctEbitda` on builder → `review_required` (`evaluateProvision` `:414–419`).
- Document id with configured waterfall; kind `dividend` | `investment`.

### E. Dependencies and shared-capacity
- Dividend and investment **share one ledger pool** (`restrictedPaymentPoolUsed`, `:1497–1501`).
- Not Permission-attributed shared constraint by default (coverage inventory `:138–139`).

### F. Ledger and historical utilization
- Legacy ledger DEBIT on `DIVIDEND`/`INVESTMENT` reduces waterfall before sim.
- Verified remaining still requires attributed utilization + completeness (not this path).

### G. Supported transaction effects
- Waterfall allocation steps + ratio-gate unlimited when open.
- Status clear/blocked/review_required.

### H. Unsupported or ambiguous
- Builder elections beyond configured CNI/equity params.
- Declined prepayments / Retained ECF limbs often discovery-only.
- Chewy §6.01(b)(4)(a)(i) BUILDER pin **eligible:false HOLD** — not shippable executable.

### I. Tests
| Package | Nature |
|---|---|
| **Coherent** | Seed RP waterfall scenarios — `cross-domain-transaction.test.ts:87–93`; `tests/ledger-regression.test.ts` |
| **Chewy** | Authentic source pin HOLD — `pin-candidate-chewy-builders-hold.test.ts`; semantic compiler replays `chewy-6-08-*.test.ts` (compile/discovery, not RP sim) |
| Synthetic | `synthetic-company.test.ts` RP cases |

---

## 4. Investments and acquisitions

**Classification: PARTIAL**

### A. Discovered contractual provisions
- Families `INVESTMENTS`, `ACQUISITIONS` — `prisma/schema.prisma:2108–2109`.
- Pass A verbs `make … Investment`; action `MAKE_INVESTMENT` — `action-ontology.ts:70`.
- `GrantType.INVESTMENT` — solver types.

### B. Source-backed interpretation and operative authority
- Product path treats acquisition investment leg as RP waterfall `kind=investment` (`cross-domain-scenarios.ts:46–48`, `cross-domain-transaction.ts:364–365`).
- No separate certified Permitted Acquisition basket interpreter in legacy engine.

### C. Generalized executable representation
- Same `simulateRestrictedPayment(..., "investment")`.
- VTE `TransactionType` includes `INVESTMENT` | `ACQUISITION` (`verified-transaction-execution/types.ts:47–51`) — orchestration only when verified package supplied.
- Solver can hold `INVESTMENT` permissions when populated; product debt+investment composition is the main multi-family path.

### D. Required inputs
- Same as RP + entity-scope assumptions for acquisitions.
- Target joining restricted group stated in assumptions only — not simulated (`cross-domain-transaction.ts:495–497`).

### E. Dependencies
- Shares RP Available Amount pool with dividends.
- Debt-funded acquisition also depends on debt/lien/ratio domains.

### F. Ledger / utilization
- `INVESTMENT` ledger basket; attribution rules same fail-closed remaining story.

### G. Supported effects
- Investment draw on RP waterfall; composed debt+investment scenario status.

### H. Unsupported
- Unrestricted subsidiary redesignation as acquisition structure.
- Guarantee scoping for targets.
- `INTERCOMPANY_TRANSFER` → domain slice `UNSUPPORTED` (`cross-domain-transaction.ts:521–535`).
- Separate PA ratio/size tests beyond provision leaves.

### I. Tests
| Package | Nature |
|---|---|
| **Coherent** | Debt-funded acquisition scenario — `cross-domain-transaction.test.ts:66–85` (seed) |
| **Conmed** | Discovery pin investments — `pin-candidate-conmed-investments.test.ts` |
| Intercompany | Explicit fail-closed unsupported — same cross-domain test `:110–116` |

---

## 5. Asset sales and proceeds application

**Classification: PARTIAL**

### A. Discovered contractual provisions
- Pass A / headlines: `Asset Sales?|Dispositions?` — `pass-a-signals.ts:43–49`.
- Families `ASSET_SALES`, `DISPOSITIONS`, `SALE_LEASEBACKS`.
- Action `SELL_ASSET`; discovery notes heading ≠ sealed family.

### B. Source-backed interpretation and operative authority
- Document `assetSale: { thresholdCode, reinvestmentWindowDays }` — `covenant-engine.ts:204–208`.
- Recipes refuse silent proceeds restore without `contractualAuthorityRef` — `transaction-effect-recipes.ts:7,200`.

### C. Generalized executable representation
- `simulateAssetSale` — `covenant-engine.ts:1628–1677` (excess proceeds / offer trigger).
- Phase 4D effects: metrics/events + optional `CONSUME_CAPACITY` / `RESTORE_CAPACITY` with explicit refs — `transaction-effect-recipes.ts:427+`.

### D. Required inputs
- Net proceeds, reinvest boolean, configured threshold provision, financials for pro forma leverage.
- Missing `assetSale` config → `not_tested`.

### E. Dependencies
- Threshold provision capacity; optional debt repayment / basket restore edges when authority encoded.
- Reinvestment may consume investment capacity (recipe).

### F. Ledger / utilization
- Legacy `ASSET_SALE` ledger basket exists; sim itself does not auto-post.
- Restore requires existing usage identity (`transaction-effect-recipes.ts:208`).

### G. Supported effects
- Excess proceeds amount; `offerTriggered`; pro forma TNL; status clear/review/not_tested (**never** “blocked” — sale itself not prevented, `:1619`).

### H. Unsupported
- Full proceeds-application waterfalls when not configured.
- Mandatory prepay offer mechanics beyond threshold boolean.
- Many authentic packages lack `assetSale` JSON → not_tested.

### I. Tests
| Package | Nature |
|---|---|
| **Coherent** | Seed asset-sale scenario — `cross-domain-transaction.test.ts:95–99` |
| **Chewy** | Stratified asset-sales pin — `pin-candidate-chewy-asset-sales.test.ts` (discovery/cert pin) |
| Synthetic | `synthetic-company.test.ts` |

---

## 6. Affiliate transactions

**Classification: UNSUPPORTED**

### A. Discovered contractual provisions
- Pass A headline `Affiliate Transactions?` — `pass-a-signals.ts:43`.
- Family `AFFILIATE_TRANSACTIONS` — Prisma `:2119`, NCEDB, knowledge-factory, coverage-audit signals.
- Action `ENTER_AFFILIATE_TRANSACTION` — `action-ontology.ts:76`, `lib/contract-model/types.ts:39`.
- Evaluation-v2 signals `TRANSACT_WITH_AFFILIATE` — `evaluation-v2/signals.ts:227,280`.

### B. Source-backed interpretation and operative authority
- Precedent-comparison / intelligence corpora can classify affiliate clauses.
- **No** operative solver `GrantType` for affiliate transactions (only DEBT/LIEN/RP/INVESTMENT).

### C. Generalized executable representation
- **None** in `simulate*` APIs, solver elections, or Phase 4D default product paths.
- IR may carry family/action if compiled; `evaluator-registry.ts` registers only `FIXED_AMOUNT` and `RATIO_TEST` — no affiliate evaluator.

### D. Required inputs
- Would need arm’s-length / fairness / board-approval facts — not modeled as runtime inputs.

### E–G. Dependencies / ledger / effects
- Intelligence exercise library asks affiliate questions (`exercise-library.ts:477–479`) — retrieval, not execution.
- No capacity consume/restore for affiliate baskets in production engine.

### H. Unsupported or ambiguous
- Entire execution surface: arm’s-length tests, ordinary-course exceptions, approval thresholds, non-cash consideration.

### I. Tests
| Package | Nature |
|---|---|
| DSGR / CONMED / CHWY | Coverage **discovery** noted in `docs/neon-corpus-flywheel/covenant-coverage-matrix.md` (Pass A) — **not** executable tests |
| Precedent benchmarks | Synthetic drafting pairs — `precedent-comparison/benchmark/scenarios.ts` |
| **No** Coherent/Matthews/Chewy/Conmed/MHK transaction-execution test for affiliate clear/block | |

---

## 7. Guarantees

**Classification: PARTIAL**

### A. Discovered contractual provisions
- Families `GUARANTEES`, `GUARANTOR_REQUIREMENTS` — Prisma `:2120–2121`.
- Discovery role `GUARANTEE_OBLIGATION` — `discovery/types.ts:45`, normalization catch for guarantor/keepwell.
- Document types `GUARANTEE`, `GUARANTEE_AND_SECURITY_AGREEMENT` — Prisma DocumentType.
- Action `GUARANTEE_DEBT` — `action-ontology.ts:49,69`, `types.ts:44`.

### B. Source-backed interpretation and operative authority
- Solver requirement class `GUARANTOR_CONDITION` — `types.ts:192`; evaluated via entity-scope in `evaluatePermissionEligibility` (`election.ts:392–399`).
- PAI-07: missing entities ≠ SATISFIED (adversarial locks).

### C. Generalized executable representation
- Entity-class filters on permissions (`EntityClass` includes `GUARANTOR_RS`, `NON_GUARANTOR_RS`, … — `types.ts:99–110`).
- **No** `simulateGuarantee` / guarantee-capacity formula path in `covenant-engine.ts`.
- Guarantee agreements participate in package graph as documents, not as executable baskets by default.

### D. Required inputs
- `guarantorStatus`, `entityClasses`, incurring entity on solver context.
- Cross-domain acquisition notes guarantee admission **not simulated** (`:495–497`).

### E. Dependencies
- Secured debt / collateral often co-dependent with guarantee topology (CONMED G&C) — discovery/package-graph, not engine math.

### F. Ledger / utilization
- No dedicated guarantee utilization basket in legacy `LedgerBasket` enum.

### G. Supported effects
- Fail closed when entity scope excludes incurring entity.
- Non-guarantor solver contexts exercised in Coherent tests (`coherent-stacking-conclusions.test.ts` non-guarantor case).

### H. Unsupported
- Standalone guarantee limitations, contribution/subrogation, keepwell sizing, upstream guarantee restricted-payment interaction as executable math.
- Intercompany guarantee chains (`INTERCOMPANY_TRANSFER`).

### I. Tests
| Package | Nature |
|---|---|
| **Coherent** | Guarantor vs non-guarantor solver routing — live stacking tests |
| **Conmed** | Package graph / G&C document identity (phase-2f3 comments in schema) — structural, not guarantee sim |
| Affiliate/guarantee intelligence | Exercise library only |

---

## 8. Financial maintenance covenants

**Classification: PARTIAL**

### A. Discovered contractual provisions
- Families `FINANCIAL_COVENANTS`, `SPRINGING_COVENANTS` — Prisma `:2113,2127`.
- Pass A: `financial_metric`, `cure_or_trigger` (springing) — `pass-a-signals.ts:36–37`.
- Coherent CA §6.11 seeded as maintenance TNL / IC — `prisma/seed-data.ts:197–212` (and defined-term notes `:593–606`).

### B. Source-backed interpretation and operative authority
- Compiler evaluator registry: `RATIO_TEST` = maintenance comparison needing live ratio — `evaluator-registry.ts:65–71,80–84`.
- Contractual EBITDA derivation / metrics — `lib/product/contractual-computation.ts` (`computeContractualCovenantMetrics`).
- NS-4 / FCE certificate path for authenticated metrics — `lib/financial-certificate-engine/**`, `north-star-workflow/fce-certificate-actions.ts`.

### C. Generalized executable representation
- Legacy encodes maintenance thresholds as `LEVERAGE_RATIO_ROOM` / `COVERAGE_RATIO_ROOM` provisions used in position + `buildDebtRatioTests` (`covenant-engine.ts:731–812`) and debt simulation.
- `computeLeverageMetrics` — `:281+`.
- IR Phase 4A expression evaluation for certified packages; registry honesty: greater-of etc. often `MISSING_EVALUATOR` at compiler stage.

### D. Required inputs
- EBITDA, debt, cash, interest, assumed rate for coverage room.
- Certificate delivery / cutoff for NS-4 approved binding (`certificate-deliveries.ts`, PAI-11).

### E. Dependencies
- Cross-document maintenance often tighter than indenture incurrence (Coherent golden notes in seed).
- Springing activation predicates exist in solver activation model but incomplete product wiring.

### F. Ledger / utilization
- Maintenance is ratio compliance, not basket draw; utilization machinery orthogonal.
- Empty/missing financials → `MISSING_FINANCIALS` (`contractual-computation.ts`).

### G. Supported effects
- Pre/post transaction ratio clear/block on debt sim.
- Gross ratio-room capacity (explicitly `ratioCapacityIsGrossOnly: true`).

### H. Unsupported / ambiguous
- True quarterly maintenance monitoring / cure rights / springing revolver tests without financial inputs stay missing (coverage inventory `:160`).
- Independent Coherent $1,700M build-up often supporting/reported only (`:161`).
- Maintenance vs incurrence conflation in legacy formula types.

### I. Tests
| Package | Nature |
|---|---|
| **Coherent** | Seed + golden + live position/sim; cross-domain contractual EBITDA |
| **Matthews** | Authentic FCE certificate fixture + independent EBITDA derivation; SSNL block scenario |
| **Chewy / Conmed** | Stratified financial-covenant **pins** — discovery/cert, not live maintenance engine |
| NS-4 e2e | `tests/product/ns4-approved-capacity-simulation.e2e.test.ts`, `ns4-secured-acquisition-scenario.e2e.test.ts` |

---

## 9. Subsidiary designation and structural restrictions

**Classification: UNSUPPORTED**

### A. Discovered contractual provisions
- Family `SUBSIDIARY_DESIGNATIONS`, `ENTITY_SCOPE_RESTRICTIONS` — Prisma `:2128–2129`.
- Pass A verbs `designate|redesignate` — `pass-a-signals.ts:35`.
- Actions `DESIGNATE_UNRESTRICTED_SUBSIDIARY`, `REDESIGNATE_RESTRICTED_SUBSIDIARY` — `types.ts:42–43`.
- IR relationship `REDESIGNATES_TO` — `ir/validate.ts:195`.

### B. Source-backed interpretation and operative authority
- Entity-scope guard / atoms include `UNRESTRICTED_SUB` — `ir/types.ts:176`.
- Legal-reasoning exercises ask designation questions — `exercise-factory.ts:34,123` — **not** execution.
- Contractual representation explicitly: redesignation “not executable without certification” — `contractual-representation.ts:71`, `cross-covenant.ts:142`.

### C. Generalized executable representation
- `RedesignationRecord` exists on `HistoricalState` — `lib/solver/types.ts:472–496`.
- Financial-core solver adapter **always supplies empty** `redesignations: []` — `lib/financial-core/solver-adapter.ts:135`.
- No `simulateDesignation` / state transition applying redesignation in production product path.
- Phase 4C reclassification ≠ subsidiary redesignation (basket usage move only).

### D–G. Inputs / deps / ledger / effects
- Would require investment capacity, RP gates, restricted-group graph — missing as executable wiring.
- Cross-domain lists unrestricted redesignation as unsupported under investments (`:146`).

### H. Unsupported
- Full designation/redesignation mechanics, immaterial/securitization sub exceptions as executable filters beyond static entityScope tags when authored.

### I. Tests
| Package | Nature |
|---|---|
| Intelligence / precedent | Question banks and drafting pairs only |
| **No** authentic-package designation execution test (Coherent/Matthews/Chewy/Conmed/MHK) | |

---

## 10. Cross-document shared capacity

**Classification: PARTIAL**

### A. Discovered contractual provisions
- Pass A `shared_cap` signal — `pass-a-signals.ts:40`.
- Discovery role `SHARED_CAP`; IR / Prisma `SHARES_CAPACITY_WITH`.
- Solver `SharedConstraint` / `SHARED_CONSTRAINT_PARTICIPATION` — `types.ts:241–276,211`.

### B. Source-backed interpretation and operative authority
- Shared constraint carries `sourceProvision` citation.
- Phase 4C capacity graph builds shared nodes only from explicit resources — unquantified `SHARES_CAPACITY_WITH` → `SHARED_CAPACITY_NOT_QUANTIFIED` (`runtime/capacity/graph.ts:287–311`).

### C. Generalized executable representation
- Legacy: per-document formulas + `combineCrossDocument` tightest-document binding (`covenant-engine.ts:622–646`).
- Solver: `computeSharedConstraintCurrentUsage` (`shared-usage.ts:94`).
- Phase 4C: `evaluateCapacityState` shared pool remaining (`runtime/capacity/state.ts:327+`).
- VTE selected paths may include `sharedCapacityIds` (`verified-transaction-execution/types.ts:89–93`).

### D. Required inputs
- Member permissions / external instrument balances; measurement basis; completeness certificate for authoritative usage.
- Aggregation rules: `NAMED_MEMBER_CLAUSES` | `EXTERNAL_INSTRUMENT_BALANCE` | `ENTITY_CLASS_FILTER`.

### E. Dependencies
- Cross-doc debt sim binding document selection.
- False-favorable clamp: solver must not beat legacy capacityFormulas (`computeRemainingCapacityAfterDebtIncurrence` `:1352–1373`, package authoritative `:1453–1461`).

### F. Ledger / utilization
- Shared pool usage must be attributed; `ZERO_NO_ATTRIBUTED_USAGE` not verified empty (PAI-04).
- `currentUsageAuthoritative` only with approved completeness (`types.ts:270–274`).

### G. Supported effects
- Shared constraint consumption on elections; cross-doc min capacity; Phase 4D consume against shared nodes when path selected.

### H. Unsupported
- Implicit stacking across documents without express shared cap (coverage inventory `:168`).
- Entity-class aggregation usage often `ENTITY_CLASS_USAGE_UNAVAILABLE`.

### I. Tests
| Package | Nature |
|---|---|
| **Coherent** | Live stacking / false-favorable / cross-doc capacity — solver + golden |
| **Chewy** | Shared-cap stratified pin — `pin-candidate-chewy-shared-cap.test.ts` |
| Product | `tests/product/cross-document-*.test.ts`, unified-position completeness |

---

## 11. Amendments and operative versions

**Classification: PARTIAL**

### A. Discovered contractual provisions
- Family `AMENDMENT_WAIVER_CONSENT`; document types `AMENDMENT`, `AMENDED_AND_RESTATED_AGREEMENT`, `SUPPLEMENTAL_INDENTURE`.
- Amendment pipeline / effects — `lib/contract-model/compiler/amendment/**`.
- Pass A supersession status on candidates — `pass-a-signals.ts:65–78`.

### B. Source-backed interpretation and operative authority
- `computeOperativeDocument` — `amendment/chain.ts:125` (**PAI-01** as-of filter `:166–173`).
- `computeOperativeContractState` — `operative-state.ts:593`.
- VTE `evaluateOperativeSourceAuthority` / governing provision overlay (**PAI-03, PAI-12**).
- Product customer-intelligence operative resolution / amendment-package modules.

### C. Generalized executable representation
- Date-scoped `loadCompanyCovenantData` / `loadCompanySolverStaticData` (`covenant-engine.ts:1771+`, effectiveFrom/To).
- Permission `effectiveFrom`/`effectiveTo` in coverage (`lib/solver/coverage.ts:38`).
- IR `OperativeLineageRef` conflict → CONFLICTED sufficiency — not silently authoritative.

### D. Required inputs
- asOf date; restatement effect graph with effective dates; base document id; structural index.
- Undated edges with asOf → fail closed (`chain.ts:167–183`).

### E. Dependencies
- Downstream discovery, semantic compile, capacity evaluation must consume operative text — not superseded base.
- PAI-02: RESOLVED-only tip edges.

### F. Ledger / utilization
- Amendments do not auto-mutate ledger; amendment recipes refuse silent graph mutate (coverage inventory `:173`).

### G. Supported effects
- Operative document/provision resolution; supersession index for candidates; date-filtered provisions/permissions.

### H. Unsupported
- Auto-recompile of IR from amendment text on product path (`cross-domain-transaction.ts:175`).
- Some package restatement chains remain UNRESOLVED / REVIEW_REQUIRED (Batch 1 notes for CONMED Seventh A&R).

### I. Tests
| Package | Nature |
|---|---|
| Adversarial | `tests/adversarial-intelligence/document-lifecycle-stress.test.ts`, `cross-phase-semantic-consistency.test.ts` (PAI-01/02/06) |
| Package graph | `tests/contract-model/post-3f2-package-graph-restatement.test.ts` |
| Authentic packages | Operative resolution in VE/Matthews/MHK feeds — gross compile, not full amendment rewrite |

---

## 12. Utilization, reclassification and historical transactions

**Classification: PARTIAL**

### A. Discovered contractual provisions
- Reclassification rights as `RECLASSIFIABLE_TO` / `RECLASSIFICATION_RULE` — Prisma `ContractRuleType`, IR deps.
- Historical utilization reconstruction event kinds — `utilization-evidence-reconstruction.ts:25+`.
- Debt event types include `RECLASSIFICATION` — Prisma schema.

### B. Source-backed interpretation and operative authority
- Completeness certificates + trusted issuer auth — `utilization-authority.ts`, `completeness-issuer-auth.ts`.
- PAI-04: default UNKNOWN; VERIFIED_EMPTY opt-in only.
- Production authority shared by product `resolveUtilization` and solver bridge.

### C. Generalized executable representation
- `resolveUtilization` — `lib/capacity/utilization-resolver.ts:113`.
- `computeVerifiedRemaining` — `verified-remaining.ts:86`.
- Phase 4C ledger index + `applyCapacityStateTransition` — `runtime/capacity/ledger.ts`, `reclassification.ts:74`.
- Phase 4D `APPLY_RECLASSIFICATION` / `SUPERSEDE_LEDGER_USAGE` / `RESTORE_CAPACITY` — `runtime/transaction/simulate.ts`, recipes.
- VTE utilization gate adapter — `verified-transaction-execution/adapters/utilization.ts`.

### D. Required inputs
- Attributed usage records (path-identified), asOf, currency, APPROVED completeness cert, trusted issuer context for production remaining.
- Reclass elections: electionId, source/dest rule ids, positive amount, currency, effectiveAsOf, provenance (`reclassification.ts:62–71`).

### E. Dependencies
- Shared capacity remaining claims; RP pool legacy ledger vs attributed 4C ledger (two layers — must not conflate).
- NS-4 certificate basket lines → attributed usages (`certificate-actions.ts:149+`).

### F. Ledger and historical utilization requirements
- Empty ledger ≠ verified zero without VERIFIED_EMPTY.
- Duplicate usage ids quarantined; unresolved paths fail closed (`ledger.ts:9–15,74–86`).
- Reconstruction never treats `UNKNOWN_HISTORICAL_ACTIVITY` as zero (`utilization-evidence-reconstruction.ts` / docs).
- Legacy `LedgerEntry` ACTIVE-only in `loadCompanyCovenantData` (`:1784–1787`).

### G. Supported transaction effects
- Hypothetical consume/restore/reclass when elections and edges explicit.
- Supersede ledger entries (product status SUPERSEDED).
- Publication labels GROSS / SUPPORTED_REMAINING / AVAILABLE only under gates.

### H. Unsupported / blocked
- `TRUSTED_ISSUER_ACTIVATION` **BLOCKED** — host IdP not production-wired.
- VTE `classifyProductionAuthority` returns `PRODUCTION_AUTHORITY_BLOCKED` even when local gates pass (`execute.ts:148–165`).
- Intra-batch reclass chaining forbidden; missing semantic fields → `RECLASSIFICATION_NOT_EXECUTABLE`.
- Rule-evaluator Phase 4A still notes reclassification `NOT_IMPLEMENTED_IN_PHASE_4A` on evaluateRule path (`rule-evaluator.ts:34,100`) — execution lives in 4C/4D, not 4A rule eval.

### I. Tests
| Package | Nature |
|---|---|
| Capacity / PAI | `tests/contract-model/runtime/capacity/capacity-state.test.ts`, home overview PAI-05, adversarial false-confidence |
| Ledger | `tests/ledger-regression.test.ts`, `tests/ledger/supersede-ledger-entry.test.ts` |
| NS-4 | approved capacity / secured acquisition e2e (certificate-backed; production authority still blocked) |
| Synthetic | utilization resolver unit tests with labeled synthetic hatch |

---

## Cross-cutting honesty notes

1. **Static inventory vs this audit:** `covenantDomainCoverage()` in `lib/product/cross-domain-transaction.ts:117–191` claims `EXECUTABLE` for debt, RP, and financial ratio domains. This matrix **downgrades** those to `PARTIAL` under the mission rule (refinancing gaps, utilization/authority gates, Chewy builder hold, maintenance/springing holes, and no EXECUTABLE from synthetic-only proof).
2. **Discovery ≠ execution:** Stratified cert pins for Chewy/Conmed prove operative source identity / eligibility for certification workflows — they do **not** alone prove package-wide transaction executability.
3. **Two engines:** Legacy `covenant-engine` + optional solver-native routing vs Phase 3/4 verified IR runtime. Product unification (`executeUnifiedVerifiedTransaction`, `attemptCertifiedTransaction`) still fail-closed for production authority.
4. **Authentic package coverage heat-map (execution):**

| Domain | Coherent | Matthews | Chewy | Conmed | MHK |
|---|---|---|---|---|---|
| 1 Debt/refi | Live/seed sim | Minimal + live solver elsewhere | Pin/discovery | Pin/discovery | VE gross leaf |
| 2 Liens | Live solver | Partial | — | LIENS pin | — |
| 3 RP/AA | Seed waterfall | — | Builder HOLD | — | — |
| 4 Investments | Seed composition | — | — | Investments pin | — |
| 5 Asset sales | Seed sim | — | Asset-sale pin | — | — |
| 6 Affiliates | — | — | Discovery only | Discovery only | — |
| 7 Guarantees | Entity-scope | — | — | G&C structure | — |
| 8 Financial maint | Seed §6.11 + ratios | FCE + SSNL | FC pin | FC pin | — |
| 9 Subsidiaries | — | — | — | — | — |
| 10 Cross-doc shared | Live | Partial | Shared-cap pin | Limited | Multi-package VE |
| 11 Amendments | Operative/PAI | Operative VE | Single-doc | Restatement gaps | Operative VE |
| 12 Utilization/reclass | Machinery + seed ledger | NS-4 cert path | — | — | Remaining refused |

---

## PAI-01–12 & NS-4 (status at tip `8374fa2a`)

| Item | Status |
|---|---|
| PAI-01–12 | Preserved FIXED behaviors; adversarial + home + capacity tests still assert fail-closed semantics |
| NS-4 financial bind | Integrated on product/dashboard paths via APPROVED snapshots + FCE |
| NS-4 remaining / production authority | Still largely **blocked** pending trusted issuer / IdP activation; gross modeled capacity may show; AVAILABLE remaining must not |

---

*End of coverage matrix.*
