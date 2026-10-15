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

Three palettes were rendered on the same unloaded screens. The one that shipped is **cool precision**.

| Option | Field | Why it did or did not ship |
| --- | --- | --- |
| Paper, refined | Warm `#f6f5f0`, amber darkened to `#7c4a00` so the badge passes WCAG AA | Closest to the previous skin. Still reads as a document, and the warm field competes with amber. |
| Cool precision | Canvas `#f4f6f8`, card white, ink `#12151a`, navy `#1a365d` | **Shipped.** A financing decision needs a quiet field. Green, amber, and red are then the only saturated signals. Navy is selection and information, never a status pass. |
| Ink rail | Light canvas, sidebar `#1b2430` | Bolder, and it splits the product. A dark rail next to red and green status makes the chrome compete with the answer. |

Status pairs are measured for normal text (WCAG AA, 4.5:1) against their soft backgrounds:

| Tone | Ink / soft | Ratio | Meaning for a CFO |
| --- | --- | --- | --- |
| clear | `#0e6b43` / `#e5f4ec` | 5.77 | This check is in a good state. Read the hint. Green is not "borrow this," and it is not the nav selection color. |
| attention | `#7c4a00` / `#fbf3df` | 6.69 | A person has to finish something before the number can be relied on. The previous amber `#96690f` on `#f4ecdb` was 4.13 and failed AA. |
| stop | `#9d2c24` / `#fdeceb` | 6.52 | Do not treat this as allowed. |
| info | `#1a365d` / `#e8eef6` | 10.40 | Context. Not a pass and not a failure. |
| unknown | `#3e4651` / `#eef1f4` | 8.81 | Nothing was invented. |

Body muted `#4a5360` on canvas `#f4f6f8` is 7.19. A prohibition clause stays navy, not red. The clause restricts; that is not the same as a breach.

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

`companyNavItems()` is unchanged. The sidebar used to show every item at equal weight, which hid the question the workspace answers. Three patterns were mocked on the same screen: a five-item sidebar plus Jump to, a top tab bar plus command palette, and a primary row with a permanent sub-tab strip. The sidebar won. A CFO's first scan is vertical and short. Top tabs spend the width the tables need. A permanent sub-tab strip asks a second question before the first one is answered.

The shell that shipped:

- Sidebar — Overview, Covenants, Capacity, Simulate, Ask. Capacity was already a route and was missing from the primary list.
- Header — Jump to (⌘K) and an Alerts bell with no count. A count would be an invented figure.
- Command palette — every `companyNavItems` href, plus Capacity, Certificates, All tools, and Switch company.
- Contextual tabs, only on the section you are in — Covenants / Rulebook / Intelligence, or Capacity / Ledger / Certificates.
- Finish setup — only while `companyNavItems` includes Onboarding. The palette still says Onboarding.

Active state is navy on a navy tint. Status green is never used for selection. Below 860px the sidebar is an off-canvas drawer. The company card still shows the database name and returns to the chooser.

| Item | Before | After |
| --- | --- | --- |
| Overview | Sidebar | Sidebar |
| Upload | Sidebar | Palette |
| Analyze | Sidebar | Palette |
| Review | Sidebar | Palette |
| Position | Sidebar | Palette |
| Simulate | Sidebar | Sidebar |
| Audit | Sidebar | Palette |
| Covenants | Sidebar | Sidebar, and the contract tabs |
| Rulebook | Sidebar | Palette and the contract tabs |
| Intelligence | Sidebar | Palette and the contract tabs |
| Ledger | Sidebar | Palette and the capacity tabs |
| Evidence | Sidebar | Palette |
| Ask | Sidebar | Sidebar |
| Alerts | Sidebar | Header bell and palette. No badge count. |
| Onboarding | Sidebar while setup remains | Finish setup in the sidebar, Onboarding in the palette |
| Capacity | Tools index only | Sidebar |
| All tools | Tools index | Palette |
| Switch company | Company card | Company card and palette |

### Company chooser

The question is "Which company are you opening?" One primary button per row: Open. Delete is a quiet text button so it cannot be mistaken for the way in. Connect a company is the page-level primary. The research corpus stays reachable and is labeled as not operative authority — hiding that caveat would be a trust failure.

### Menus

Native `<select>` elements differed by browser and looked unfinished next to the rest of the product. `components/Select.tsx` is one listbox: button trigger, arrow keys, Home/End, typeahead, Escape, and a hidden input so form posts keep the same `name` and value. `components/ActionMenu.tsx` holds secondary links (exports, certificates, corpus) so each view has one obvious next step.

### Tables

Headers are small, uppercase, muted. Numeric columns are right-aligned with tabular figures. Rows alternate on a cool tint of the canvas and highlight with the navy tint on hover, so the eye can track one covenant across status and headroom.

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
| Fourteen equal sidebar rows | They hid Overview, Covenants, Capacity, Simulate, and Ask. The other routes stay one keystroke away. |
| Alerts as a nav row with no count | A bell in the header is the signal. A number on it would invent an alert count. |
| Warm paper field | It competed with amber. The canvas is now neutral so status color means something. |
| Sidebar that wrapped into a second row on a phone | It pushed the answer below a pile of links. The drawer stays closed until asked. |

Locked overview regions, empty-state copy, and every computed value are unchanged. Loading skeletons are bars with no digits. Motion is limited to color, transform, and the skeleton shimmer, and it is off when `prefers-reduced-motion` is set.
