# Headroom design system

Presentation only. This document does not change covenant math, capacity, or stored data.

## Product understanding

There is no repository-root README. The product is defined by `package.json` ("covenant intelligence workspace") and the controlling architecture in `docs/headroom-north-star-v2.md`, with the earlier statement of purpose in `docs/HEADROOM-NORTH-STAR.md` and the legal-review rules in `docs/legal-review-status-model.md`.

**Who uses it.** CFOs, treasurers, controllers, finance teams, and the lawyers who have to stand behind a number. They are deciding whether a real transaction is allowed. They do not want a marketing site. They want to see, quickly, what is known, what is withheld, and why.

**The question the product answers.** Controlling mission (`docs/headroom-north-star-v2.md`): "Can we do this transaction — under which provisions, with how much capacity, on what conditions, and with what effect?" The screen a person opens first has to answer the shorter form of that: am I inside the covenants, and how much headroom is actually supported?

**Key workflows.**

1. Open one company. Nothing is remembered between visits. Evaluation companies are not customer companies.
2. Read the position: headroom, utilization, covenants at risk, and the status table. Empty means unknown, never zero.
3. Read the covenants: what the documents restrict, what is still unresolved, and which reading is only discovered.
4. Read capacity: a figure only when an executable path exists; otherwise an explicit not-determinable state.
5. Test a transaction (simulate) or ask, then trace the answer to a document, a snapshot, and the ledger.

Trust rules that the visuals have to obey: unknown is not zero and not unlimited; gross contractual is not remaining available; legal-review verified is not an engineering pass; a discovered clause is not counsel-approved.

## Decisions, each tied to that job

### Color

The existing palette stays. Paper `#f6f5f0`, ink `#1a1b17`, muted `#6e6c62`, line `#dddacf`, green `#1e6b4f`, amber `#96690f`, red `#a6392f`, navy `#22304a`, with the existing soft tints. The sidebar had drifted to nearby hexes; it now uses these tokens so the chooser and the workspace look like one instrument.

Semantic status tones are aliases of those colors, not new hues:

| Tone | Uses | Meaning for a CFO |
| --- | --- | --- |
| clear (green) | Verified, approved, satisfied, pass, ok | This check is in a good state. Read the hint. Green is not "borrow this." |
| attention (amber) | Needs input, review required, unresolved, missing | A person has to finish something before the number can be relied on. |
| stop (red) | Failed, blocked, disputed, at risk | Do not treat this as allowed. |
| info (navy) | Modeled, legacy engine, clause type, hypothetical | Context. Not a pass and not a failure. |
| unknown (muted) | Unknown, not tested, unmapped codes | Nothing was invented. |

A prohibition clause is navy, not red. The clause restricts; that is not the same as a breach.

### Type

Three pairings were considered. The product needs columns of figures that line up, and one voice so a status and a number do not look like they came from different tools.

| Pairing | What it feels like | Why it did or did not win |
| --- | --- | --- |
| Inter, tabular numerals | Stripe / Ramp / Linear. One family. | **Recommended and implemented.** A CFO scans; a second display face is noise. Inter's tabular figures keep headroom, limits, and utilization aligned. |
| IBM Plex Sans + Plex Mono | Institutional document, figures in a terminal face. | Honest for citations, but two families make the overview busier than the question it answers. |
| Geist + Geist Mono | Linear's product face, very tight. | Crisp, and slightly more "software tool" than a control room a treasurer has to trust with counsel. |

Shipped: Inter for UI and figures (`font-variant-numeric: tabular-nums`). The old Newsreader / Public Sans / Spline Sans Mono stack is retired in the shell so headings and numbers share one rhythm. Screenshots of the other two pairings are artifacts, applied on the real screens, not shipped as a switcher.

Scale: 12px meta, 14px body, 16px titles, 28px the page question and the primary figure.

### Spacing

4, 8, 12, 16, 24, 32, 48. Cards use 8px radius and a 1px line plus a one-pixel shadow. The earlier 16px pills and gradient setup banner read as a consumer app. A financing decision should feel still.

### Navigation

The route list is unchanged (`lib/home/nav.ts`). What changed is grouping, because fourteen equal rows hide the question:

- Now — Overview
- Set up — Upload, Analyze, Review, Onboarding
- Decide — Position, Simulate, Audit
- Contract — Covenants, Rulebook, Intelligence
- Record — Ledger, Evidence, Ask, Alerts

Active state is navy on the existing navy tint, not a black block. The company card still shows the database name and returns to the chooser.

### Company chooser

The question is "Which company are you opening?" One primary button per row: Open. Delete is a quiet text button so it cannot be mistaken for the way in. Connect a company is the page-level primary. The research corpus stays reachable and is labeled as not operative authority — hiding that caveat would be a trust failure.

### Menus

Native `<select>` elements differed by browser and looked unfinished next to the rest of the product. `components/Select.tsx` is one listbox: button trigger, arrow keys, Home/End, typeahead, Escape, and a hidden input so form posts keep the same `name` and value. `components/ActionMenu.tsx` holds secondary links (exports, certificates, corpus) so each view has one obvious next step.

### Tables

Headers are small, uppercase, muted. Numeric columns are right-aligned with tabular figures. Rows alternate on a warm paper tint of the existing background and highlight with the navy tint on hover, so the eye can track one covenant across status and headroom.

### Status badges

`components/StatusBadge.tsx` plus `components/status-presentation.ts`. Known codes get the plain-language label and a tone. The original code stays on `data-status` and the hint is the tooltip. Customer-workflow codes reuse `presentCustomerStatus` so the badge cannot invent a friendlier status than the contract. Unmapped codes render in the unknown tone with the words of the code and an explicit "no success or failure implied" hint. There is no `BREACH` value in this codebase; it is not in the map.

### What was removed or simplified

| Change | Why |
| --- | --- |
| Slogan under the sidebar ("Clarity. Control. Confidence.") | It does not answer compliance or capacity. |
| Chooser cards for "Connect" and "Research" as equal peers of the company list | The page has one job: open a company. Connect remains the primary action. Corpus remains a quiet link with its caveat. |
| Nine covenant buttons in a row | Upload stays visible. Exports, ask, documents, and precedent compare move into More actions. Same destinations, one primary. |
| Repeated capacity link rows on two cards | One Covenant review button and one More actions menu for certificates, ledger, ask, and upload. |
| Repeated capacity headline inside the status card | The headline is the answer under the page question. The card keeps the status badge, counts, blockers, and guidance. |
| Serif display headings and mono figures | Two extra voices. Figures stay tabular, in the same family as the labels. |
| Sidebar's separate hex palette | It made the product look assembled from two skins. |

Locked overview regions, empty-state copy, and every computed value are unchanged.
