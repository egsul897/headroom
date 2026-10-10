# Frozen challenge protocol

## PP001 baseline (unchanged)

MTN Tenth A&R package remains under `docs/product-proof/001/sources/mtn-2026-tenth-ar-credit-agreement/`.  
PP002 uses it only as a **regression fixture** via `manifests/mtn-regression.json` (relative paths into `../001/...`).

No PP001 artifact was rewritten for PP002 scoring.

## Holdout freeze (before legal reference)

Package: Mohawk Industries, Inc. Credit Agreement (SEC EDGAR accession `0001104659-26-060295`).

| Field | Value |
|---|---|
| Frozen at | 2026-10-10T12:00:00Z |
| Raw HTML SHA-256 | `6ee4abf323f03c509df295d82601baaeb3d40956105f2c18fd94add7af5f9784` |
| Extracted text SHA-256 | `f0210a431fef015a008e8821e1655407d618ec5984cb9899ced83a8679ddb12c` |
| Manifest | `sources/mhk-2026-credit-agreement/freeze-manifest.json` |

Freeze note (recorded at freeze time): *Frozen BEFORE independent legal reference and before inspecting expected covenant structure for scoring.*

## Rules

1. Holdout freeze precedes independent legal reference authoring.
2. Pipeline run uses the same issuer-agnostic entry point as MTN regression — no holdout-specific production branches.
3. No silent truth-set rewriting after scoring.
4. Manual annotations, if any, are recorded in `07-human-interventions.md` and excluded from autonomous-success metrics.
