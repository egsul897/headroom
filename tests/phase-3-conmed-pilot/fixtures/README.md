# CONMED pilot test fixtures — synthetic reconstructions

Created 2026-10-17 (test-infrastructure repair, Fix Stream C).

The phase-3 CONMED pilot harness originally read its gateway model
catalogue and prior-run tier-1 results from operator scratch files
under `/tmp/claude-0/pilot/` (`models.json`, `models-bakeoff.json`,
`run/03-tier1.json`). Those files lived outside the repo and did not
survive the operator machine, so every test that exercised the
offline plan / model-discovery / probe-set paths failed with ENOENT
on any clean checkout (12 tests across benchmark-recovery,
continuation-harness, premium-lock and resume-manifest).

These fixtures replace the lost scratch files for TEST purposes:

- `models.json` — minimal gateway catalogue (`{ data: GatewayModel[] }`).
  The locked model `deepseek/deepseek-v4-flash` carries the exact
  price the calibration constants attest ($0.13 input / $0.26 output
  per Mtok — see `scripts/p3-conmed-pilot/resume-calibration.ts`,
  whose CLI guard cross-checks the catalogue against those constants).
  Other entries are illustrative.
- `models-bakeoff.json` — catalogue shaped to exercise every
  `discoverModels` tier: PREFERRED / VIABLE / EXCLUDED_FOR_COST
  (priced above the viability ceiling, and unpriced) /
  EXCLUDED_AS_PREMIUM / EXCLUDED_FOR_CAPABILITY.
- `03-tier1.json` — prior tier-1 execution rows keyed by REAL
  discoveryIds from the sealed CONMED population (so probe selection
  joins against the same candidates the pipeline derives), with
  synthetic execution outcomes covering the history axes the probe
  set requires (two wall-clock timeouts, one zero-token provider
  stall, successes, a schema failure). The outcomes are illustrative;
  the original tier-1 results are preserved in the run artifacts
  under `docs/phase-3-conmed-population-verified/`.

Operator runs can still point the harness at a live catalogue:
`CONMED_CATALOGUE_PATH`, `CONMED_BAKEOFF_CATALOGUE_PATH` and
`CONMED_TIER1_PATH` override these fixture defaults.
