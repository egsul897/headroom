# Headroom — Master Product Architecture

**Status: PHASE A (customer workspace shell + Dashboard rename + prototype
UX restoration) SHIPPED AND DEPLOYED. Phases B–G (contract compiler,
evaluation harness, premium dashboard redesign, Ask Headroom, full
Simulate/Compare experience) ARE NOT STARTED.** This document is both the
product north star for the full 98-section master build and an honest
record of what currently exists. Do not read any section below as "done"
unless its own text says so.

## A. Product north star

Headroom's intended long-run experience: a customer logs in, is resolved to
their own workspace, and lands directly on a Dashboard that already
reflects their financial and contractual position — gathered autonomously
from ERP/treasury/document/public sources plus manual uploads. From there
they can ask questions, model transactions, and trace every answer back to
its source. See the originating task's own §0/§98 for the full narrative;
this document does not restate it.

## B. Customer workspace model (SHIPPED)

`Company.tenantKind` (new enum: `CUSTOMER` | `EVALUATION`,
`prisma/migrations/20260826020000_add_company_tenant_kind`) is the one
thing app code may condition on to decide what a normal customer-facing
surface may show. `lib/dashboard-service.ts`'s `listCustomerCompanies()`
filters to `CUSTOMER` only.

`app/page.tsx` is now a **workspace resolver**, not a company picker:

- Zero `CUSTOMER` companies → "Welcome to Headroom / Connect your company"
  (first-time provisioning, §5).
- Exactly one → redirects straight to that company's `/dashboard` (or
  `/onboarding` if still provisioning). This is the normal, steady-state
  path.
- More than one → a plain "Your organizations" list, in customer language,
  never mentioning tenancy/admin/evaluation concepts.

**Known limitation (honest, not glossed over):** there is no
authentication/session layer in this product. "Exactly one CUSTOMER
company" is a deliberate, narrow stand-in for "resolve the logged-in user's
organization" — it is not real per-user tenant resolution. The moment real
auth exists, `app/page.tsx`'s resolver must be rewritten to look up the
authenticated user's own organization rather than counting rows. This is
flagged as the top item in §AH (recommended next phase).

## C. Tenant isolation

Existing tenant isolation (every table already scoped by `companyId`,
enforced by the existing onboarding/connectors/extraction layers) is
unchanged and was not touched by this phase. `tenantKind` is a
classification on top of that existing isolation, not a replacement for
it — a `CUSTOMER` company and an `EVALUATION` company are isolated from
each other exactly as any two companies always have been.

## D. Customer vs. legal entity

Not addressed by Phase A. The product still has one `Company` row per
onboarded entity, with no explicit parent/subsidiary/guarantor entity graph
inside a single customer workspace. `lib/solver/types.ts`'s `EntityClass`/
`GuarantorStatus` concepts exist at the covenant-engine layer already (used
by `buildSolverContext`), but there is no UI or ingestion path yet for a
customer to declare "this workspace contains these legal entities." Deferred
to a later phase (§AH).

## E. Dashboard architecture (PARTIAL)

`/[companyId]/dashboard` (renamed from `/overview` — "the main landing page
is officially Dashboard, never Overview") still renders the same
data-accurate, zero-fabrication content the prior Overview page did:
position stat grid, near-term maturities, covenant/headroom summary, legal
review status — all read straight from `getCompanyDashboard()`, no
calculation in the page itself. This is functionally solid but is **not**
yet the premium, progressive-disclosure command-center surface described in
the task's §11–§24 (no Ask Headroom, no capacity utilization bars, no
maturity timeline visualization, no clickable drill-down, no Needs
Attention/Recent Changes sections). That redesign is Phase F, not started.

## F. Ask Headroom

Not started. No LLM-mediated query interface exists yet. See §AH.

## G. Simulation UX (PARTIAL — sliders restored)

The original single-company prototype (`app/simulate/SimulateClient.tsx`)
used `<input type="range">` sliders bound directly to component state, with
the underlying deterministic function re-evaluated on every change. The
generalized, multi-company rewrite (`app/[companyId]/simulate/SimulateClient.tsx`)
had regressed this to plain number inputs with an explicit "Run scenario"
button — functionally correct but not the "flagship" feel the task calls
for. This phase restored the slider interaction on the generalized version:

- A shared `SliderField` component pairs a `<input type="range">` with a
  synced `<input type="number">` for the same state value.
- The scenario now **recomputes live** (`useEffect` keyed on the derived
  `ScenarioAction`) exactly as slider values change — the same pure,
  client-side `runScenarioWithInputs()` call as before, no fetch/DB
  round-trip, no fake client-side arithmetic.
- Ranges are generous fixed ceilings (matching the original prototype's own
  pattern: 0–8000 for its single amount slider) rather than derived from a
  specific facility's principal — `ScenarioInputs.facilities` carries
  Prisma `Decimal` fields that do not survive the server→client boundary as
  usable numbers in this component, so a fixed, honest range was the
  correct choice over a fragile derived one.

**Not done:** Current-vs-Pro-Forma side-by-side comparison table, scenario
A/B comparison, a dedicated simulation drawer/panel invocable from
Dashboard/Capacity, mobile full-screen simulation mode. These remain Phase F.

### G.1 Prototype preservation audit (task §83)

| Prototype concept (`app/simulate`, `app/position`) | Classification | Disposition |
| --- | --- | --- |
| Slider-driven amount input, live recompute | **PRESERVE** | Ported into the generalized `SimulateClient.tsx` this phase (see above). |
| Dual slider + typed-number entry | **PRESERVE** | `SliderField` component implements both. |
| Explicit "Run scenario" button, no live recompute (generalized version's prior state) | **REPLACE** | Replaced by live recompute — reason: task §26/§29 explicitly require slider movement to recompute immediately. |
| Per-document `<details>` explainability drill-down (binding provision, permissions considered, alternatives rejected, review items) | **PRESERVE** | Already present in the generalized `SimulateClient.tsx`'s `DocumentExplainability`; untouched this phase — it already satisfies a real slice of task §31 (Why?/traceability). |
| Before → transaction → after comparison table | **IMPROVE (not done this phase)** | Functionally present (`result.before`/`result.after` table) but not the polished Current-vs-Pro-Forma layout task §28 describes. Deferred to Phase F. |
| Plain stat-grid Overview dashboard | **IMPROVE (not done this phase)** | Data-accurate, not premium. See §E. Deferred to Phase F. |
| Company-switcher header everywhere | **REPLACE** | Now shown only for EVALUATION-tenant companies (admin/internal mode); a CUSTOMER-tenant company's header shows only its own name. See §B. |
| Root "Companies" list + "Legacy views" links | **REPLACE (moved, not deleted)** | Moved verbatim to `/admin`, unlinked from any customer surface — nothing was discarded, per task's own "may retain/refactor rather than blindly delete." |

Nothing in the original prototype was classified DISCARD — every real
interaction concept found was either already preserved by the earlier
generalization work or restored/relocated this phase.

## H. Design system

Not touched this phase. `app/globals.css`'s existing card/row/stat-tile/chip/
button/field vocabulary was reused as-is (see §33's own hard requirement
against arbitrary one-off styling) — no new premium visual language was
introduced. A real design-system pass (typography hierarchy, utilization
bars, maturity timeline, drill-down panels) is Phase F/G work.

## I. Autonomous sources

Unchanged from the existing autonomous-retrieval architecture
(`docs/autonomous-information-retrieval-v1.md`,
`docs/vercel-ai-gateway-extraction.md`) — EDGAR connector, CSV financial
connector, upload connector, ingestion pipeline, reconciliation. Not
extended this phase.

## J. CanonicalCompanyState

Unchanged (`lib/company-state/canonical-state.ts`). Dashboard/Simulate/
Capacity already derive from the same underlying engines
(`lib/dashboard-service.ts` composing `lib/covenant-engine.ts`/
`lib/financial-core/**`) rather than each independently reconstructing the
company — this was already true before this phase and remains true; no
regression was introduced.

## K–T. Contract ontology, document/defined-term/cross-reference graphs, compilation stages, validators, coverage engine, provenance

**Not started.** See `docs/comprehensive-contract-compiler-v1.md` for the
full target design — that document is a specification for future phases,
not a report of completed work.

## U. Review workflow

Unchanged (`lib/onboarding/review.ts`, the exception-first
`ExtractionCandidate` review flow). Now reachable as a top-level customer
nav item ("Review", pointing at the existing `/onboarding/review` page)
rather than being buried under an "Onboarding" umbrella for an ACTIVE
company — see §CompanyNav below.

## V–Y. Evaluation harness, metrics, false-affirmative results, error taxonomy

Not started — these apply to the contract compiler, which was not built
this phase.

## Z–AA. Coherent / Matthews regression

Both remain fully intact and reachable. `Company.tenantKind` for both was
backfilled to `EVALUATION` by this phase's migration (see the migration's
own comment: every pre-existing company as of this migration is
EVALUATION, never silently reclassified as a customer). Both golden
harnesses re-verified unchanged after this phase (26/3/1/0 and 2/4/10/2 —
see the final report).

## AB. Mobile behavior

Not specifically addressed this phase beyond what `app/globals.css` already
provided (the existing stat-grid/card layout already reflows reasonably on
narrow viewports; this was not verified against a real device this phase -
honest gap, not a claim).

## AC. Security

No new attack surface: `tenantKind` is read-only classification data, never
user-supplied except via the existing `/companies/new` form (which already
required no auth before this phase and still doesn't - this phase does not
change or worsen that). No credentials, confidential document content, or
stack traces are newly exposed; the new `app/[companyId]/error.tsx` boundary
specifically exists to STOP a raw provider/Prisma error from reaching a
customer (see §82/§E below).

## AD. Performance/cost

Not addressed this phase (no compiler work was done, so no new model-call
cost surface exists).

## AE. Production deployment

Committed, pushed, migrated via the established hosted-Neon GitHub Actions
mechanism, deployed to Vercel. Exact SHAs are in the final report delivered
alongside this document, not duplicated here (this document is not a
running commit log).

## AF. Real AI Gateway verification

Unchanged from the prior task's finding: `VERCEL_AI_GATEWAY` provider
selection is proven live and correct end-to-end, but actual paid inference
remains blocked on the Vercel team's AI Gateway billing/payment-method
requirement (`customer_verification_required`, a 403 from Gateway itself —
see `docs/vercel-ai-gateway-extraction.md`). This phase did not touch
extraction/Gateway code and did not re-attempt the live call (no compiler
work exists yet that would need it).

## AG. Known limitations (read this before claiming anything is "done")

1. **No real authentication.** The workspace resolver in §B is an honest,
   narrow placeholder, not multi-tenant auth.
2. **No contract compiler.** Everything in §K–Y is a design spec, not code.
3. **No Ask Headroom.** No LLM-mediated query surface exists.
4. **Dashboard is functional, not premium.** No utilization bars, maturity
   timeline, drill-down, Needs Attention, or Recent Changes sections.
5. **Simulate lacks Current-vs-Pro-Forma comparison and a drawer/panel
   invocation from other pages** — sliders were restored, the surrounding
   comparison UX was not built.
6. **`/admin` has no access control.** It is simply unlinked from customer
   surfaces. A real deployment needs this gated before it is internet-facing.
7. **Mobile was not device-tested this phase.**
8. **`/companies/new` is still the only company-creation path** — a real
   customer workspace is provisioned by filling out the same form an
   internal admin uses (with `tenantKind` defaulted correctly), not by any
   sales/ops-driven provisioning flow.

## AH. Recommended next phase

In priority order:

1. Real authentication + per-user tenant resolution, replacing §B's
   placeholder — this is the correctness-critical gap everything else in
   the "customer experience" north star depends on.
2. Phase F: Dashboard redesign (Ask Headroom, capacity cards with
   utilization bars, maturity timeline, Needs Attention/Recent Changes,
   drill-down/Why? traceability) — the highest-leverage visible product
   change once real data exists to show.
3. Phase B/C: begin the contract compiler per
   `docs/comprehensive-contract-compiler-v1.md`, starting with the
   structural pass and defined-term graph on a small, blind (unseen)
   evaluation set — before any dashboard integration work depends on it.
4. Re-attempt real Gateway inference once Vercel billing is resolved.
