# F-5.3A - dual-pass semantic ensemble: canonical union + run provenance (zero-cost architecture proof)

Starting SHA `23bb5e7fdc8071297ddd4279e2d003a392bcf6e3`. Input: the ALREADY-PAID F-5.1 v5 pair (run-A 352 items, run-B
326 items). Paid calls 0, spend $0.00. **Verdict: F5_3A_DUAL_PASS_ARCHITECTURE_READY** (architecture proof only; F-5
certification of the authoritative dual-pass output is the separate F-5.3B mission).

| # | artifact | what |
|---|----------|------|
| 02 | `02-ensemble-evaluation.json` | `scripts/f5-3a-ensemble-evaluation.ts`: policies, counts, review burden, F/B/H/A/D/G recovery, false additions, recomputed union coverage, preservation, order independence, cost model, historical controls |
| 03 | `03-recall-*.json`, `policy-*.json` | frozen 6.08 human-subset recall for INTERSECTION_ONLY / RAW_UNION / canonical union / run A / run B |
| 04 | `04-pass-b-contract-and-adjudication-comparison.json` | how Pass B and reconciliation consume support provenance; freeze semantics; union vs adjudicator |
| 05 | `05-architecture-gate.json` | the ten proof criteria |
| 06 | `06-final-summary.json` | verdict and every number |

Production: `lib/contract-model/compiler/semantic-accountability/ensemble.ts` (new; accepts two already-created
FrozenSemanticInventory objects, reconciles them under the F-5.1 identity rules, recomputes raw coverage, marks every
item CORROBORATED / SINGLE_RUN / CONFLICTED, order-independent freeze hash; no provider call) and additive types.
The orchestrator is NOT changed to spend twice; activation is F-5.3B.

Headline (frozen pair): 396 canonical items = 282 corroborated + 70 A-only + 44 B-only, 0 conflicts; 112 material
singletons (28.3% of the inventory requires support-asymmetry review); all 50 F omissions retained (45 SINGLE_RUN, 5
corroborated after canonicalization); 0 unsupported additions; unaccounted source 33/32 -> 19 (all both-run gaps);
0 values lost, 0 dangling lineage; recall 1.0 on every policy except INTERSECTION_ONLY (quantitative 0.9333); dual-pass
Pass A costs $6.88 vs $3.44 for the unit (second pass ~26% of a dual-pass full Phase 3 spend).
