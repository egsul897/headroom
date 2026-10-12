# Autonomous Covenant Compilation — Mission Report (Agent 1)

## Starting conditions

| Item | Value |
|---|---|
| Local HEAD before fetch | `440dd65d42c2e9f6b92978fa4f04a92658de190c` |
| `origin/main` at start | `67027b8f499921a12cee7b9b9f04d832898b6384` |
| Integration base | PR #304 tip `26d04084777f25acf139922d9909639f3347b19f` (VE core branch-only; merge-base = main) |
| Feature branch | `cursor/autonomous-covenant-compilation-b53f` (does not overwrite #304) |
| Ending SHA | `1c48210954b4cc804bf56b2c95fa94a9726f6a65` |
| Working tree at start | clean |

### Merged vs branch-only (verified)

| Capability | On `origin/main` | On PR #304 tip |
|---|---|---|
| Structural index / package-graph / OA | yes | yes (+ #306 later-unresolved) |
| Definition/section exception catalogs | yes | yes |
| `compileFrozenDebtPackage` + fixed-dollar/greater-of VE | yes | yes |
| Matthews Position vertical slice + hand candidates | **no** | yes |
| Package-agnostic `compileVerifiedFixedDollarBridge` | **no** | yes |
| Issuer-specific Matthews/MHK candidate regexes | n/a | yes (defect) |

## What was built

### A. Generic covenant discovery (extended)

`lib/contract-model/compiler/discovery/definition-exception-catalog.ts`:

- Numbered + nested lettered catalogs: `(1)(a)/(1)(b)/(2)` (indenture Permitted* style)
- Existing lettered `(a)(b)…` and section `except:` catalogs unchanged
- `discoverRatioBasedSectionPermissions` for ratio limbs under Limitation / Indebtedness / Liens sections
- No company IDs, hardcoded section numbers, or issuer monetary thresholds

### B. Executable rule compilation

`compileOperativeCovenantPackage(packageContext)` in
`lib/contract-model/analysis/operative-covenant-package.ts`:

- Wraps `compileFrozenDebtPackage` (no parallel evaluator)
- Prefers exact catalog-clause operative text (fixes section-span pollution)
- Fixed-dollar + greater-of → existing IR / `evaluateVerifiedCapacity`
- Ratio baskets discovered but fail closed (definition/financial closure incomplete)

### C–D. Legal fidelity + capacity classes

Publication classes (never interchangeable):

| Class | When |
|---|---|
| `SOURCE_BACKED_GROSS_CONTRACTUAL` | Fixed-dollar VE fidelity PASS |
| `MODELED_HYPOTHETICAL` | Greater-of VE structure (metric-gated) |
| `VERIFIED_REMAINING` | Always null here |
| `PRODUCTION_AVAILABLE` | Never emitted (trusted-identity BLOCKED) |
| `UNSUPPORTED_OR_UNKNOWN` | Refused / incomplete |

### E. Two-issuer proof (same code path)

Document loaders only in `lib/product/autonomous-covenant-compilation/package-contexts.ts`
— no candidate-locating regexes.

## Results

### Matthews

| Item | Result |
|---|---|
| Catalog | `Permitted Debt` markers `1)(a`, `1)(b`, `2` |
| VE GROSS | `def:Permitted Debt(1)(a)` → **$1,300,000,000** `SOURCE_BACKED_GROSS_CONTRACTUAL` |
| Ratio refused | `(1)(b)` leverage; `4.09(a)` FCCR |
| Grandfather refused | `(2)` Notes $300M (no cap-role) |
| Lien restrictions | `4.10`, CA `6.01` discovered, not VE |
| Production AVAILABLE | refused |

### Mohawk (MHK)

| Item | Result |
|---|---|
| Catalogs | §7.01 `a–w` (23); §7.03 `a–l` (12) |
| VE GROSS | `7.03(f)` **$700,000,000**; `7.01(i)` **$100,000,000** |
| Greater-of VE | `7.01(u)`, `7.03(g)` → `MODELED_HYPOTHETICAL` (metric missing) |
| Production AVAILABLE | refused |

### Independent coverage / fidelity

Fixtures under `tests/fixtures/autonomous-covenant-compilation/` quote source language and parse dollars independently — not from `thresholdValue` / hand `CovenantProvisionInput` constants.

Adversarial: ratio-only package → zero GROSS; wrong-doc dollars do not become AVAILABLE; Notes grandfather is not a new-incurrence ceiling.

### Exact unsupported structures (fail closed)

1. Ratio-based incurrence permissions (FCCR, leverage limbs) — need definition closure + approved snapshots
2. Grandfathered / stated amounts without cap-role
3. Facility-difference / complex growers beyond fixed-dollar and greater-of-%-assets
4. Verified remaining / PRODUCTION AVAILABLE — utilization completeness + trusted issuer BLOCKED
5. Full leaf dashboard `CovenantProvisionInput` replacement (PR #304 leaf path still separate)

## Verdict

**`AUTONOMOUS_COVENANT_COMPILATION_PROVEN` = PARTIAL (not full PROVEN)**

Justified as PARTIAL because the same issuer-agnostic discovery→catalog→VE→capacity path compiles authentic Matthews and MHK fixed-dollar (and MHK greater-of) units with source spans and honest refusals — **not** because a single known basket was hard-wired.

Full PROVEN remains blocked until ratio executable closure and elimination of hand-encoded leaf capacity paths.

## Production files changed

- `lib/contract-model/compiler/discovery/definition-exception-catalog.ts`
- `lib/contract-model/analysis/offline-package-compile.ts`
- `lib/contract-model/analysis/operative-covenant-package.ts` (new)
- `lib/contract-model/analysis/index.ts`
- `lib/product/autonomous-covenant-compilation/*` (new)
- Tests + fixtures + this report
