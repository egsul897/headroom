# Core-four role lock (founder PARALLEL EXECUTION COORDINATION)

**Status:** BINDING for the four named product roles  
**Coordinator:** WS-PAR — contracts/ledgers only; must not rewrite the four components  
**Pack:** `docs/architecture/parallel-agents/`

## Role ownership

| Role | Workstream | Owns | Must not |
| --- | --- | --- | --- |
| Knowledge factory | **WS-CKF** | acquisition + corpus creation; KF Prisma; SEC scheduler impl (`lib/knowledge-factory/**`) | second compiler; paid AI; cert edits |
| Cloud compiler | **WS-VIC** | model adapters, inference orchestration, compilation benchmarks (`lib/extraction/providers/**`) | rewrite existing compiler unnecessarily; paid calls without auth |
| Compute assessment | **WS-CCA** | infrastructure measurements + cost analysis (`lib/cursor-cloud-compute/**`) | provision/pay for GPUs or other paid infra |
| Gibraltar Pass B cost | **WS-GIB** | cost analysis of **existing** Pass B pipeline (`docs/gibraltar-pass-b-cost/**`) | launch paid inference; absorb Track D pipeline ownership |

## Independence

Every role continues via published contracts (`02`, `04`–`07`) or the SEC scheduler mock (`scripts/parallel-agents/mocks/sec-scheduler-mock.ts`) when blocked.

## Anti-duplication

See `09-dependency-map.md`. One SEC scheduler, one corpus registry (CKF), one adapter SPI owner (VIC), one compute harness owner (CCA).

## Merge sequence

See `07-integration-gates.md` §Merge sequence. No merges / paid infra / certification changes without authorization.
