# Fleet dependency map

**Status:** DRAFT  
**Owner:** WS-PAR  
**Pairs with:** `08-integration-queue.json`, `07-integration-gates.md`

## Who can proceed independently now

| Workstream | Can proceed now? | How |
| --- | --- | --- |
| WS-PAR | yes | contracts + checkers only |
| WS-CKF | yes | reuse `SourceConnector` / existing EDGAR connector; publish corpus under exclusive trees |
| WS-VIC | yes | adapters under `lib/extraction/providers/**`; offline/deterministic/replay first |
| WS-CCA | yes | measure on Cursor VM; no paid infra |
| WS-GIB | yes (when agent present) | cost analysis of existing Pass B artifacts only; no paid inference |
| WS-EHB | yes with mock | use `scripts/parallel-agents/mocks/sec-scheduler-mock.ts` until CKF scheduler lands |
| WS-DEF/BFL/NED/CDA/RCD/PCI/CKB/SCR/FDP/RAC/CRI | yes | corpus overlays under exclusive docs/lib/datasets trees; importable datasets per `06-dataset-delivery-contract.json` |

## Forbidden duplicate implementations

| Capability | Single owner | Not allowed |
| --- | --- | --- |
| SEC fair-access HTTP | WS-CKF scheduler (impl) | Peer direct flooders |
| Source registry / corpus document store | WS-CKF | Second registry in EHB/PCI/etc. |
| Model provider adapters | WS-VIC | Parallel gateway wrappers in CKF |
| Compute/cost measurement harness | WS-CCA (+ WS-GIB for Pass B cost study) | Paid provisioning by any agent |
| Ownership map / integration gates | WS-PAR | Silent peer rewrites of another agent’s contract |
| Production legal engine / Phase-3 IR | existing Phase-3 owners (out of fleet) | Any corpus agent rewrite |

## Role lock (from founder coordination message)

- **Knowledge factory (WS-CKF):** acquisition and corpus creation  
- **Cloud compiler (WS-VIC):** model adapters, inference orchestration, compilation benchmarks  
- **Compute assessment (WS-CCA):** infrastructure measurements and cost analysis, without provisioning paid services  
- **Gibraltar (WS-GIB):** cost analysis of the existing Pass B pipeline, without launching paid inference  
- **Coordinator (WS-PAR):** contracts, ownership, ledgers, gates — must not independently rewrite the above components
