# Covenant Knowledge Generalization (CKG) fixtures

Held-out evaluation dataset for Headroom covenant-knowledge coverage.

- **Not** Claude-owned acceptance fixtures.
- **Not** a certification gate.
- Labels: `SOURCE_VERIFIED` | `REVIEWER_APPROVED` | `UNLABELED` only.
- System outputs under `system-outputs/` are predictions, never ground truth.

Run:

```bash
npx tsx scripts/ckg-benchmark/run.ts
npx vitest run tests/covenant-knowledge-generalization/
```
