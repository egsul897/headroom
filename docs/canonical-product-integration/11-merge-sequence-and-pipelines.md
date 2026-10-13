# Canonical product integration — merge sequence & pipelines

**Authoritative integration PR:** #312 `cursor/canonical-product-integration-2670`  
**Base main:** post-#306 `67027b8f`  
**Does not authorize self-merge.** Production activation BLOCKED. No production Neon writes.

## Exact tips (reconcile)

| PR | Role | Tip (refresh at merge time) |
|---|---|---|
| #310 | Compiler + discovery + provision-identity + VE provider-free | `57adade3` (absorbed into this PR) |
| #312 | **Authoritative** operative package → canonical capacity → Position | *(this tip)* |
| #313 | Competing canonical pipeline | **SUPERSEDED by #312** — close without merge |
| #307 | Fixed-dollar discovery | **SUPERSEDED** via #310/`57adade3` absorb |
| #311 | CFO workflow + access gates | Merge after #312; preserve auth |
| #308 | Verified remaining + financial approval provenance | Independent; keep APPROVED provenance gate |
| #294 | Persistence | Independent / parallel-safe vs product slice |
| #304 | Restricted slice honesty | Ancestor / absorbed via #310 stack |

## Minimal human merge order

1. **#304** → main (if not already absorbed)
2. **#310** → main (or land via #312 which absorbs `57adade3`)
3. **#312** → main (**authoritative** discovery→compile→Position path)
4. **#308** → main (financial approval provenance; capacity CI paths)
5. **#294** → main (persistence; parallel-safe)
6. **#311** → main last (CFO UI + access; resolve Position page vs #312)
7. **Close #307 and #313** as superseded — do not dual-merge

## Authoritative execution path (one)

```
authentic documents
  → discoverFixedDollarCandidates* / compileOperativeCovenantPackage (#310)
  → canonicalCapacityFromOperativePackage (#312)
  → operative-package-position-feed (#312)
  → Position / Simulate via SeparatedCapacityClaims (#311 capacity-state)
```

Publication partitions (fail-closed):

- `SOURCE_BACKED_GROSS_CONTRACTUAL` → claimKind `GROSS_CONTRACTUAL`
- `MODELED_HYPOTHETICAL` → claimKind `HYPOTHETICAL` (never GROSS)
- Verified remaining / AVAILABLE → blocked without completeness + trusted issuer

## Remediations absorbed into #312 tip

- #310 `57adade3`: provision-identity-only `authorityForUnit`; VE no `process.env` mutation
- #310 `95cbfbc0`: #307 fixed-dollar discovery → single pipeline
- #312 `83a2ee00`: MODELED_HYPOTHETICAL ≠ GROSS_CONTRACTUAL

## Not done

- Self-merge / production Neon / trusted-identity activation
- #311 Position page conflict resolution at human merge time
