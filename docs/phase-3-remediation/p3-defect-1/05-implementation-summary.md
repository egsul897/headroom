# Implementation summary

**No production code was changed.**

§11 asks for "the smallest generic production change that safely increases promotion
coverage". The smallest safe change is none: the causal map establishes that production
already compiles every eligible discovered candidate, with no cap, and that all 20 target
cases fail for reasons outside that seam.

Widening intake further would mean removing the only exclusion that exists
(`REPRESENTATION` boilerplate) - which increases cost on every package and cannot fix a
single target case, because no target case is a `REPRESENTATION`.

## What was built instead

| | |
|---|---|
| `scripts/p3-defect-1/evidence.ts` | computes every fact in the artifacts from frozen run artifacts and production source |
| `scripts/p3-defect-1/classification.ts` | the §2 per-case classification, with the first stop point named for each |
| `scripts/p3-defect-1/build-artifacts.ts` | deterministic generator for artifacts 01-12 |
| `tests/phase-3-remediation/p3-defect-1-promotion.test.ts` | 14 assertions locking the finding |

The tests are the durable part. They assert the production intake expression verbatim, so
a future edit that introduces a cap breaks them; they pin the harness numbers, so the
30-of-2,687 fact cannot be lost; and they record that discovery genuinely found every
target provision, so "the system never saw it" cannot be re-derived from the packets alone.

## Why there is no red baseline

§3 asks for tests that fail before the fix "for the intended reason". The intended reason
does not exist. Writing a test that fails against a defect that is not there, in order to
satisfy the shape of the process, would put a false claim in the repository.
