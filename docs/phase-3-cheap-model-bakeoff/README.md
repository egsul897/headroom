# Cheap-model bakeoff — halted on gateway credit exhaustion

Evidence label: `LOW_COST_DIAGNOSTIC_PIPELINE`. Starting sha `a55d2bb24584d5986c45eb3546a0b2d762b56f21`.

The sequential cheapest-first bakeoff ran two complete model rows before the Vercel AI
Gateway began refusing every request with HTTP 402. Three further rows were produced
against a gateway that served nothing; they are quarantined in `04-quarantined-rows.json`
and are NOT evidence about those models.

`03-gate-matrix-admissible.json` contains only rows the gateway actually served.

Measured spend understates true spend. See `08-halt.json` for why.

## Files
- `01-starting-state.json` — 615 bytes, sha256 `3378c6b08e88c3ee…`
- `02-probe-set.json` — 3446 bytes, sha256 `93cad68e92270d4e…`
- `03-gate-matrix-admissible.json` — 1550 bytes, sha256 `d4d8e13bd559b851…`
- `04-quarantined-rows.json` — 964 bytes, sha256 `44a7be1c04cee21d…`
- `05-failure-taxonomy.json` — 1228 bytes, sha256 `659d7e7200715fc7…`
- `06-sub-cent-completion.json` — 8232 bytes, sha256 `b80271c09b6a9bdc…`
- `07-wall-clock-projection.json` — 932 bytes, sha256 `c74abd8de9097d54…`
- `08-halt.json` — 1202 bytes, sha256 `3d8ff4aac74df359…`
