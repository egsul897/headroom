# EBITDA card — design proposal

Presentation only. This does not change the optimizer, the tracker, or the CFO loop. The interactive sample is `prototype.html` in this folder. Figures in that file are **SAMPLE DATA**.

Sources verified for this proposal:

- Engine: PR [#398](https://github.com/egsul897/headroom/pull/398), branch `cursor/clf-ebitda-optimizer` at `aca7d85c6acf7dbc33a504ef3282ec94021b6521`.
- Visual system: PR [#392](https://github.com/egsul897/headroom/pull/392), branch `cursor/cfo-visual-system-7768` at `17c33a90d7b663dce0d683c6f6730638456086fc`, `docs/DESIGN_SYSTEM.md`, `components/status-presentation.ts`, `components/home/Overview.tsx`.

## Where the card sits

The card is a full-width region in the company overview, inside `.home-regions`, directly under the four KPI cards (`Total Headroom`, `Utilization`, `Covenants at risk`, `Next test`). Those slots keep their own load state. In the prototype they stay on the shipped UNKNOWN copy (“Not available yet — we won’t invent a total.”) so the sample EBITDA figures cannot be mistaken for certified headroom.

The shell is Graphite Ledger: rail `#2a2c2e`, canvas `#f3f0eb`, card `#fffcf8`, ink `#1a1816`, muted `#5e5852`, oxblood `#54243c`, status green `#0e6b43`, amber `#7c4a00`, red `#9d2c24`. Type is Inter with tabular numerals. The sidebar tagline is “Clarity. Control. Confidence.”

## Three layers

One card. The CFO sees a deeper layer only by asking for it.

| Layer | What is on screen | The one action |
| --- | --- | --- |
| Collapsed (default) | Total EBITDA, additional available, and a count chip “N items need you” | Expand |
| Expanded list | Each add-back: name, amount, status. Confirm sits on a row only when that row has a sourced amount | Confirm, or open the row that has no amount |
| Slide-over | Source filing, clause, cap and remaining cap, capacity impact of confirming | Confirm, or Undo if this row is already in the total. Close when the amount is missing |

Whitespace does the separating. The list has no icons, no second status line, and no cap column. Caps, filings, and the leverage effect live in the sheet.

### Figures on the card

The card uses the owner’s formula. It is a view of fields the engine already computes. It does not invent a maximized EBITDA.

- **Total EBITDA** = `base` + the `amount` of each add-back the CFO has confirmed in this session.
- **Additional available** = the sum of `amount` on add-backs that are still unconfirmed and have an amount. A null `amount` is left out of the sum. When no unconfirmed row has an amount, the line reads **Needs input**. It does not read $0, and it does not fill in from `capHeadroom` or `potential`.
- **Leverage capacity** (expanded header and the sheet) follows `leverageDebtCapacity`: `maxLeverage × total − debt`, shown only because this sample has one total-leverage MAX limit and an exact debt figure. `maximum` is null, so the basis is `SUPPORTED` and the bound is `AT_LEAST`. The prototype labels this sample. It does not call the pipeline.

`base` in the sample is the core the tracker does not list (net income, interest, taxes, D&A). Discretionary rows are the tracker flags. A detected or capped amount is **not** inside the total until the CFO confirms it, because this card’s total is defined as base plus confirmed add-backs. The engine’s `supported` figure already includes detected amounts; a production wiring should say so next to the total before anyone treats the card as the optimizer output. This prototype keeps the owner’s formula so a confirm can move the number the CFO is looking at.

A missing amount, source, cap, remaining cap, or capacity impact renders as **Needs input**. An engine zero (a `capHeadroom` of `"0"`, a `COUNTED` potential) renders as $0.

### “N items need you”

The chip counts add-backs that are not yet confirmed. It is a count of rows in this card, not an alerts badge and not a status code. The bell in the header still has no count.

Confirming a row removes it from the count, adds its `amount` to the total, and reduces additional available by the same amount. Rows whose `amount` is null stay in the count. They have nothing the card is allowed to add.

### Status, mapped through StatusBadge

`presentUiStatus` is unchanged. The prototype badges the engine code. Mapped codes use the shipped row. Every other code uses the shipped fallback: unknown tone `#5e5852` on `#e8e3dc`, a humanized label, and the hint “Unmapped status. Shown as written, with no success or failure implied.” `data-status` is the engine code.

| Words we use | Engine field | Code passed to StatusBadge | Shipped label | Tone |
| --- | --- | --- | --- | --- |
| Detected | `AddBackFlag.status` | `DETECTED` | Detected | unknown (unmapped) |
| Needs CFO | `AddBackFlag.status` | `NEEDS_INPUT` | Needs input | unknown (unmapped) |
| Conditional | `AddBackFlag.status` | `CONDITIONAL` | Conditional | attention (mapped) |
| Capped | `AddBackLine.status` | `CAPPED` | Capped | unknown (unmapped) |

“Needs CFO” is the product name for `NEEDS_INPUT`. The tracker note on an unevidenced flag is “permitted by the definition; no filed movement detected — available, check with CFO”. The badge does not say “Needs CFO”, because StatusBadge humanizes `NEEDS_INPUT` to “Needs input” and must not grow a friendlier label in the view.

The list shows one badge:

- `flag.status === "CONDITIONAL"` → `CONDITIONAL`
- else if `line.status === "CAPPED"` → `CAPPED`
- else the flag status (`DETECTED` or `NEEDS_INPUT`)

A capped line is still `DETECTED` on the flag when the filing covers it. The sheet shows both badges. `CONFIRMED` is not used for a CFO click. On this engine `CONFIRMED` is a package-link tier (`ebitdaBinding.tier`), the pair of `LOWER_CONFIDENCE`.

Other codes the sheet may badge, all unmapped, all unknown tone: `LENDER_APPROVAL` (`AddBackFlag.conditional`), `LOWER_CONFIDENCE` (`bindingTier`). Confidence (`HIGH` / `MEDIUM` / `LOW`) is printed as words, not a second badge.

`potential.basis` (`CAP_HEADROOM`, `CAP_UNKNOWN`, `UNCAPPED_NEEDS_INPUT`, `COUNTED`, `SIGNED_NEEDS_INPUT`, `SHARED_CAP`) is not a row status. The sheet can name it when a cap is shared. The sample list does not add a shared-cap row; the pattern is: members show no separate remaining amount, and the room is read once from the leader (`capGroup.room`). `capRoomTotal` remains the only canonical room total in the engine. This card does not display that total as “additional available”, because room under a cap is not an evidenced add-back.

### What a confirm writes

The click stands in for `cfoRecompute`’s `BorrowerInput`: `{ key: inputKey, value: amount, source }`. The prototype enables it only when `amount` is an integer and a source filing is on the flag. That matches the loop’s refusals: “no source document named”, “value is not an integer amount”. A conditional flag in the real tracker has `concepts` cleared, so `sources` is empty and `amount` is null. The sample severance row behaves that way. Confirm stays off. The clause excerpt still shows the consent language that set `conditional: "LENDER_APPROVAL"`. `conditionText` lives on `AddBackLine` and is not copied onto `AddBackFlag`; the sheet does not invent it.

Undo removes that input from the session total. It is a view action. The engine has no undo status.

### Empty and processing

Before a package is read, the hero is **Needs input**. There is no additional-available figure and no count chip. The one action is to load the package. The prototype’s button (“Use sample package”) stands in for the upload that already exists on the company. After that, the card shows skeleton bars and no digits, then the collapsed totals. A production card fills from `xbrl.ebitda` and `xbrl.addBackTracker` when the pipeline finishes. It does not poll and it does not estimate a total while the read is in progress.

### Sample rows

The issuer is a sample package, not a customer. Binding on every derived figure: `LOWER_CONFIDENCE`, relationship `AMENDS`, resolution `DETERMINISTIC_CHRONOLOGICAL_PREDECESSOR` (the package-graph method that returns `REVIEW_REQUIRED`).

| Row | Flag status | Line status | Amount | What confirm does |
| --- | --- | --- | --- | --- |
| Restructuring charges | `DETECTED` | `CLAIMED` | $18,000,000 from `RestructuringCharges` | Adds that amount. Remaining cap $7,000,000 stays on the sheet and is not added |
| Stock compensation | `DETECTED` | `CAPPED` | $12,000,000 from `ShareBasedCompensation` | Adds the capped figure. Remaining cap is $0 |
| Run-rate synergies | `NEEDS_INPUT` | `NEEDS_INPUT` | null | No confirm. Cap text contains `[***]`; cap amount is null (`CAP_UNKNOWN`) |
| Severance | `CONDITIONAL` | `NEEDS_INPUT` | null | No confirm. Date-tiered cap text is shown; `conditional` is `LENDER_APPROVAL` |

Sample base $150,000,000. Sample debt $620,000,000. Sample max leverage 4.50. Capacity at the starting total is $55,000,000. Confirming restructuring moves the total to $168,000,000, additional available to $12,000,000, and capacity to $136,000,000 (4.50 × $18,000,000 = $81,000,000 of capacity).

## Interaction patterns

These are the reusable motions for Headroom. Durations are short. Nothing bounces. The financing surface stays still; only the object the person touched moves.

### 1. Three-layer disclosure

Use when a region has one answer and a list behind it.

- Layer one is a single button with `aria-expanded`. It shows the answer, the secondary figure, and a count when a person still has rows to clear.
- Layer two is a list of names, one figure, one status. Rows that cannot be acted on open the next layer. Rows that can be acted on show the action beside the name.
- Layer three is a sheet, not a new page.

Collapsed is the default every time the overview is opened.

### 2. One action in each state

| State | The action | What is absent |
| --- | --- | --- |
| Empty | Use sample package (production: the existing upload) | Totals, list, confirm |
| Processing | None. The region is `aria-busy` | Digits |
| Collapsed | Expand | List, confirm, sheet |
| Expanded, amount present | Confirm | A second primary button |
| Expanded, amount missing | Open the row | Confirm |
| Sheet, amount present | Confirm | A form |
| Sheet, already confirmed | Undo | Confirm |
| Sheet, amount missing | Close | Confirm, and any typed guess |
| Toast visible | Undo | A second toast |

Oxblood is reserved for that one action. Status color is never the button color.

### 3. Figure count-up

Use when a confirmed input changes a figure the person is already looking at.

- Tween the displayed integer from the old value to the new one over 520ms, ease-out cubic (`1 - (1 - t)³`).
- Keep `font-variant-numeric: tabular-nums` so columns do not wobble.
- Update a polite live region once, when the tween finishes, with the final sentence (“Total EBITDA $168,000,000”).
- Do not tween a null. If the secondary figure becomes Needs input, swap the words at the end of the other tweens.

### 4. Hover lift

Use on the collapsed card, the object that expands.

- 180ms ease. `translateY(-2px)`. Shadow from `0 1px 2px rgba(26, 24, 22, 0.06)` to `0 10px 28px rgba(26, 24, 22, 0.07)`.
- List rows change background only (`color-mix` of ink at 4% on the card). They do not lift.
- The confirm control tints on hover. It does not jump.

### 5. Undo toast

Use after an inline confirm.

- One toast, bottom center, graphite `#2a2c2e`, stone text `#f4f1ec`. Copy is the row name plus “added to the total”, then Undo.
- Undo reverses the last confirm, tweens the figures back, and returns the count.
- The toast dismisses after 6 seconds. Undo remains on that row’s sheet after the toast is gone.
- A second confirm replaces the toast. Only the latest action is undone from the toast. Earlier confirms stay until their own sheet is undone.

### 6. Slide-over sheet

Use for source, clause, and cap. Do not use it for the list.

- Fixed to the right, 440px, card color, a 1px line on the left, shadow `-16px 0 48px rgba(26, 24, 22, 0.08)`.
- 340ms, `cubic-bezier(.2, .8, .2, 1)`. Scrim `rgba(26, 24, 22, 0.18)` over 200ms.
- `role="dialog"`, `aria-modal="true"`, focus moves inside, and focus returns to the control that opened it.
- Escape or the scrim closes it. The clause is set as a quotation with a graphite rule, the same information tone as a citation (`#2a2c2e` on `#e6e1da` is the info badge; the rule is the same graphite).

### 7. Keyboard

The overview already uses ⌘K for Jump to. These keys belong to the card when it is on screen and the person is not typing in a field.

| Key | Action |
| --- | --- |
| `E` | Expand or collapse. Ignored while the sheet is open |
| `↑` / `↓` | Move through the list once it is open |
| `Enter` | Activate the focused control (expand, open, confirm) |
| `C` | Confirm the focused row, or the row in the sheet, when a sourced amount exists |
| `U` | Undo the toast, or the open sheet when that row is in the total |
| `Esc` | Close the shortcut list, else the sheet, else collapse |
| `?` | Shortcut list |

### 8. Reduced motion

When `prefers-reduced-motion: reduce` matches:

- No transitions and no transforms. Expand, sheet, toast, and hover appear in their final place.
- Figures snap to the new integer.
- The processing state is still skeleton bars, with no shimmer.
- Toasts still appear and still dismiss on a timer, because the timer is information, not decoration.

Ship this as one helper, `motionOk()`, read once and on `change` of the media query. Every pattern above calls it. Do not fork a second visual design.

### 9. Needs input

Any figure whose engine value is null is the words “Needs input” in muted type, at the same size as the figure it replaces. Do not substitute an em dash, a zero, or a cap. Do not hide the row.

### 10. StatusBadge, and nothing beside it

Row status always goes through the badge component: tone class, human label, `data-status`, hint in `title`. A new engine code arrives as an unknown badge until `status-presentation.ts` gets a row. Adding that row is a presentation change. It is not part of this prototype.

## Screens

Open `prototype.html` and use the hash to land on a state: `#empty`, `#collapsed`, `#expanded`, `#item`, `#confirmed`.

| File | State |
| --- | --- |
| `01-collapsed-dashboard.png` | Collapsed card in the overview grid |
| `02-expanded-list.png` | Name, amount, and status |
| `03-item-open.png` | Slide-over for one add-back |
| `04-after-confirm.png` | Totals after confirm, with the undo toast |
| `05-empty.png` | Before the agreement is read |

## What this leaves alone

The optimizer, `trackAddBacks`, `cfoRecompute`, basket math, and stored covenants are untouched. The prototype does not parse an uploaded PDF. The sample package button only reveals the labeled sample.
