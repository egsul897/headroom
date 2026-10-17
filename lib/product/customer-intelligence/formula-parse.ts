/**
 * Pure formula parsing for counsel-accepted interpretations.
 * Kept free of prisma imports so it is unit-testable in isolation
 * (same reason as grant-types.ts / shared-cap.ts). Moved here from
 * compile-accepted.ts so the exception-based review classifier
 * (routine-review.ts) can use it without pulling in the Prisma
 * client. compile-accepted.ts re-exports the public helpers.
 */
import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";
import { parseMoneyMillions, parsePctOf, parseRatio } from "./money";
import { grantTypesForItem, resolveDefinedTermCap } from "./grant-types";

export interface ParsedFormula {
  formulaType:
    | "FLAT_AMOUNT"
    | "GREATER_OF_FLAT_OR_PCT_EBITDA"
    | "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS"
    | "GREATER_OF_FLAT_OR_PCT_NET_WORTH"
    | "LEVERAGE_RATIO_ROOM"
    | "RATIO_GATE"
    | "BUILDER_BASKET"
    | "NONE_UNCAPPED"
    | "SECTION_STEM"
    | "PCT_OF_CNTA"
    | "GREATER_OF_FLAT_OR_PCT_CNTA"
    | "PCT_OF_COST"
    | "PCT_OF_CONSIDERATION"
    | "UTILIZATION_GATE"
    | "VALUE_CAP";
  thresholdValue: number;
  params?: Record<string, unknown>;
  amountKind: "FIXED" | "INCURRENCE_BASED";
  measurementBasis: "CUMULATIVE_INCURRED" | "CURRENTLY_OUTSTANDING";
  notes: string[];
  modelingStatus: "MODELED" | "KNOWN_NOT_MODELED";
  missingFields: string[];
}

export function parseFormulaFromItem(item: CovenantSummaryItem): ParsedFormula {
  // Formula representation (step 3): a section stem whose operative
  // sub-clauses are separately present as items is determinate as
  // a stem — its clauses carry the terms with per-clause
  // provenance, and nothing is minted from the stem itself
  // (compile returns SKIPPED for it). The determination applies
  // only when the stem carries NO terms of its own: a stem whose
  // own fields already price a formula (or resolve a defined-term
  // cap) keeps that parse — the stem state must never remove a
  // mintable formula the item already had. Counsel-EDITED items
  // are exempt: counsel supplied controlling text for the item,
  // so it parses as an ordinary item below.
  if (item.reviewerDecision !== "EDITED" && (item.sectionStemChildRefs?.length ?? 0) > 0) {
    const stemOwnText = [
      ...(item.materialBasketsThresholds ?? []),
      ...(item.permissions ?? []),
      ...(item.conditions ?? []),
      item.operativeLanguageExcerpt ?? "",
    ].join("\n");
    // Rule 192 still binds a truncated stem: never quick-price
    // from a partial excerpt — the stem state (mints nothing) is
    // the only determination a truncated stem gets here.
    const stemOwn = item.operativeExcerptTruncated ? null : scanBranches(stemOwnText, "RETURN");
    if (stemOwn) return stemOwn;
    const stemDefined = resolveDefinedTermCap(item);
    if (stemDefined != null && stemDefined >= 0.001) {
      return {
        formulaType: "FLAT_AMOUNT",
        thresholdValue: stemDefined,
        amountKind: "FIXED",
        measurementBasis: /outstanding amount at any time|currently outstanding/i.test(stemOwnText)
          ? "CURRENTLY_OUTSTANDING"
          : "CUMULATIVE_INCURRED",
        notes: ["Compiled fixed-dollar basket from a defined-term cap resolved against the document's definitions"],
        modelingStatus: "MODELED",
        missingFields: [],
      };
    }
    if (stemDefined != null && stemDefined > 0) {
      return {
        formulaType: "FLAT_AMOUNT",
        thresholdValue: 0,
        amountKind: "FIXED",
        measurementBasis: "CUMULATIVE_INCURRED",
        notes: [
          `Suspected unit misread: the defined-term cap of $${Number((stemDefined * 1_000_000).toFixed(2)).toLocaleString("en-US")} is below $1,000 — no real basket is that small (a dropped scale is the likely cause). Not modeled; counsel to confirm the amount from the source text.`,
        ],
        modelingStatus: "KNOWN_NOT_MODELED",
        missingFields: ["thresholdValue"],
      };
    }
    return {
      formulaType: "SECTION_STEM",
      thresholdValue: 0,
      params: { childSectionRefs: [...(item.sectionStemChildRefs ?? [])] },
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: [
        `Section stem: this item is the section's introductory text; its operative clauses are separate items (${(item.sectionStemChildRefs ?? []).join(", ")}) and carry the terms. No Permission is minted from the stem — that would double-count the clause items.`,
      ],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }
  // Rule 192: the item's excerpt is a PREFIX of a longer operative
  // span (4000-char cap) — tail clauses are missing. A formula
  // parsed from it would attribute an early clause's amount to
  // the whole section (Aon 6.11 minted a FLAT $5M LIEN Permission
  // from an early clause while the (t) greater-of basket sat
  // beyond the cap). Fail closed: no formula from a truncated
  // excerpt. EDITED items are exempt — counsel supplied the
  // controlling text, so the analyzer's excerpt is not what
  // the formula parses.
  //
  // Step 3 narrows the gate WITHOUT loosening it: two reference
  // legs may still resolve a truncated item, because neither can
  // attribute a stray amount to the item —
  //   (1) a defined-term cap referenced in the available text
  //       (prefix excerpt, or the full span when attached),
  //       resolved by Rule 197's bare-dollar resolver against the
  //       item's attached definitions;
  //   (2) for CLAUSE-LEVEL items only, a scan of the full span
  //       restricted to cap-framed windows (amounts outside a
  //       cap frame — minimum denominations, thresholds of other
  //       tests — never enter the scan). A section-level span
  //       covers sibling clauses with independent caps, so it
  //       gets leg (1) only.
  // The summary/display excerpt and the Rule 192 disclosure on
  // the item are unchanged, and a truncated item NEVER becomes
  // routine via these legs (the routine gate keeps its own
  // truncated-excerpt exception).
  if (item.operativeExcerptTruncated && item.reviewerDecision !== "EDITED") {
    // The reference legs serve grant-bearing items only: a
    // definitions-article entry (Rule 204: never grants) or other
    // non-grant item gains nothing from a resolved cap — its span
    // IS a definition or a test, not a basket.
    const hasGrants = grantTypesForItem(item).length > 0;
    const definedCap = !hasGrants
      ? null
      : (resolveDefinedTermCap(item) ??
        (item.operativeFullSpan
          ? resolveDefinedTermCap({ ...item, operativeLanguageExcerpt: item.operativeFullSpan })
          : null));
    if (definedCap != null && definedCap >= 0.001) {
      return {
        formulaType: "FLAT_AMOUNT",
        thresholdValue: definedCap,
        amountKind: "FIXED",
        measurementBasis: "CUMULATIVE_INCURRED",
        notes: [
          "Compiled fixed-dollar basket from a defined-term cap referenced in the item's available text and resolved against the document's definitions. The stored excerpt is a truncated prefix (Rule 192 disclosure unchanged); the cap reference itself is inside the available text.",
        ],
        modelingStatus: "MODELED",
        missingFields: [],
      };
    }
    if (definedCap != null && definedCap > 0) {
      // Sub-$1k defined-term cap on a truncated item: the P4
      // unit-misread guard applies exactly as on the full parse.
      return {
        formulaType: "FLAT_AMOUNT",
        thresholdValue: 0,
        amountKind: "FIXED",
        measurementBasis: "CUMULATIVE_INCURRED",
        notes: [
          `Suspected unit misread: the defined-term cap of $${Number((definedCap * 1_000_000).toFixed(2)).toLocaleString("en-US")} is below $1,000 — no real basket is that small (a dropped scale is the likely cause). Not modeled; counsel to confirm the amount from the source text.`,
        ],
        modelingStatus: "KNOWN_NOT_MODELED",
        missingFields: ["thresholdValue"],
      };
    }
    if (
      hasGrants &&
      item.operativeFullSpan &&
      (item.operativeNodeType === "CLAUSE" || item.operativeNodeType === "SUBSECTION") &&
      // A span containing a defined-term introduction ("“ Specified
      // Communications ” has the meaning …") is (partly) a
      // definitions fragment, not an operative clause — amounts
      // inside it are not this item's basket (hand-audit finding:
      // Solaris 7.03(iv) is such a fragment and its span sweeps a
      // neighboring amount into a cap frame).
      !/["“][^"”]{1,80}["”]\s+(?:has the meaning|means|shall mean)/.test(item.operativeFullSpan)
    ) {
      const spanParsed = scanBranches(capFramedWindows(item.operativeFullSpan), "NULL");
      if (spanParsed && spanParsed.modelingStatus === "MODELED") {
        return {
          ...spanParsed,
          params: { ...(spanParsed.params ?? {}), spanSource: "FULL_SPAN" },
          notes: [
            ...spanParsed.notes,
            "Compiled from the item's full operative span under cap-frame discipline (only amounts inside a cap frame were scanned); the stored excerpt is a truncated prefix and the Rule 192 disclosure on the item is unchanged.",
          ],
        };
      }
    }
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: ["Operative excerpt truncated — tail clauses not visible; no formula minted from a partial excerpt."],
      modelingStatus: "KNOWN_NOT_MODELED",
      missingFields: ["thresholdValue", "formulaType", "operativeExcerptTruncated"],
    };
  }
  // Narration trust boundary: this scan is the sole input to every
  // formula extractor below, and extractors take the FIRST figure
  // they find — so the scan may contain ONLY contract-derived text.
  // item.plainEnglish is analyzer-GENERATED narration and is
  // excluded: it republishes full-excerpt (<=4000 char) extractions
  // while operativeLanguageExcerpt below is only a 700-char prefix,
  // it carries extractBaskets' canonical REFORMATS of greater-ofs
  // (a rewrite, not a quote), and one narration-carried condition
  // clip already severed "$10,000,000" into "$10,000,0…" in the
  // corpus — a string that parses as $100,000, a figure nowhere in
  // the contract (narration audit, 2026-10-17: 0/1,688 corpus items
  // compile from narration today, but counterfactual narration
  // mutations mint MODELED Permissions, so the channel is closed,
  // not merely unused). Conditions and restriction text used to
  // reach this scan ONLY through that narration; conditions are
  // now an explicit scanned field — they are verbatim excerpt
  // clips with signal prefixes (extractConditionsAndExceptions),
  // i.e. contract text. item.restriction is deliberately NOT
  // scanned: its operative branches are excerpt clips already
  // reachable via the fields above, and its GENERAL_PROHIBITION
  // fallback interpolates the section heading into template text,
  // so the field as a whole cannot be certified figure-free.
  // Narration remains in use everywhere else it belongs — posture /
  // conditions context in the review gates and customer
  // disclosure; only this formula scan excludes it.
  const basketText = [
    ...(item.materialBasketsThresholds ?? []),
    ...(item.permissions ?? []),
    ...(item.conditions ?? []),
    item.operativeLanguageExcerpt ?? "",
  ].join("\n");

  const notes: string[] = [];
  const missingFields: string[] = [];
  const money = parseMoneyMillions(basketText);
  // Grower %s are base-attached: the % modifying EBITDA / Total
  // Assets — never the first % anywhere in the text (an unrelated
  // "50% ownership" in the same section is not the grower).
  const pctEbitda = parsePctOf(basketText, "EBITDA");
  const pctAssets = parsePctOf(basketText, "TOTAL_ASSETS");
  const pctNetWorth = parsePctOf(basketText, "NET_WORTH");
  const pctCnta = parsePctOf(basketText, "CNTA");
  const ratio = parseRatio(basketText);
  const greaterOf = /greater of/i.test(basketText);
  const ebitdaBase = /EBITDA/i.test(basketText);
  const assetsBase = /Total Assets|Consolidated Total Assets/i.test(basketText);
  const netWorthBase = /Net Worth/i.test(basketText);
  const cntaBase = /Net Tangible Assets/i.test(basketText);
  const builder = /Available Amount|builder basket|Cumulative Credit/i.test(basketText);
  const outstanding = /outstanding amount at any time|currently outstanding/i.test(basketText);

  // P4 (Egzon ruling, 2026-10-17): no real basket is below
  // $1,000 — a parsed money threshold under $1,000 is a UNIT
  // MISREAD (a dropped scale: "$30 million" / "$30,000,000" read
  // as $30), never a real basket. Fail closed: model nothing
  // from it and name the suspected cause, so the item surfaces
  // to counsel as NEEDS_INPUT instead of minting a $30
  // Permission or auto-accepting. A ratio-driven item is exempt
  // — its threshold is the ratio, and an incidental small
  // amount in its text is not its threshold.
  const ratioDriven = ratio != null && /leverage|incurrence|ratio debt|pro forma/i.test(basketText);
  if (money != null && money > 0 && money < 0.001 && !ratioDriven) {
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: [
        `Suspected unit misread: the parsed amount of $${Number((money * 1_000_000).toFixed(2)).toLocaleString("en-US")} is below $1,000 — no real basket is that small (a dropped scale, e.g. "$30 million" read as $30, is the likely cause). Not modeled; counsel to confirm the amount from the source text.`,
      ],
      modelingStatus: "KNOWN_NOT_MODELED",
      missingFields: ["thresholdValue"],
    };
  }

  if (builder && money != null) {
    const cniMentioned = /net income|CNI/i.test(basketText);
    const cniShare = parsePctOf(basketText, "CNI");
    return {
      formulaType: "BUILDER_BASKET",
      thresholdValue: money,
      params: {
        // Rule 58: never invent percentages. An unparseable
        // grower % is undefined + missingFields, NOT 0 (which
        // silently zeroes the grower) and NOT 0.5 for CNI
        // (which ADDED 0.5 × max(0, CNI) of invented capacity).
        pctEbitda: ebitdaBase && pctEbitda != null ? pctEbitda : undefined,
        cniSharePct: cniShare ?? undefined,
        includeEquityProceeds: /equity/i.test(basketText),
      },
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: ["Compiled builder/available-amount starter from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [
        ...(ebitdaBase && pctEbitda == null ? ["builder pct of EBITDA"] : []),
        ...(cniMentioned && cniShare == null ? ["builder cni share %"] : []),
      ],
    };
  }

  if (greaterOf && money != null && ebitdaBase && pctEbitda != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: money,
      params: { pctEbitda },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled greater-of flat / % EBITDA basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && assetsBase && pctAssets != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      thresholdValue: money,
      params: { pctTotalAssets: pctAssets },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: [
        "Compiled greater-of flat / % Consolidated Total Assets basket from counsel-accepted analysis",
      ],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && assetsBase) {
    // Grower % present in structure but not parseable — model floor only; require counsel % completion.
    notes.push(
      "Grower component (% of Consolidated Total Assets) referenced but percentage not parsed; fixed-dollar floor modeled only.",
    );
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes,
      modelingStatus: "MODELED",
      missingFields: ["grower_%_total_assets"],
    };
  }

  // Rule 186: greater-of flat / % Consolidated Net Worth (the
  // Aon 6.16(l) / 6.11(t) shape: "greater of $1,000,000,000 or
  // ten percent (10%) of Consolidated Net Worth"). Previously
  // fell through to a silent FLAT_AMOUNT — the grower leg was
  // dropped with no disclosure, understating capacity whenever
  // Net Worth made the % leg the larger one.
  if (greaterOf && money != null && netWorthBase && pctNetWorth != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_NET_WORTH",
      thresholdValue: money,
      params: { pctNetWorth },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled greater-of flat / % Consolidated Net Worth basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && netWorthBase) {
    // Same floor-only fallback as the Total Assets branch.
    notes.push(
      "Grower component (% of Consolidated Net Worth) referenced but percentage not parsed; fixed-dollar floor modeled only.",
    );
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes,
      modelingStatus: "MODELED",
      missingFields: ["grower_%_net_worth"],
    };
  }

  // Step 4: greater-of flat / % Consolidated Net Tangible Assets —
  // same shape family as the Net Worth branch (Rule 186 pattern);
  // without it the item fell through to a silent FLAT_AMOUNT and
  // dropped the CNTA grower leg.
  if (greaterOf && money != null && cntaBase && pctCnta != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_CNTA",
      thresholdValue: money,
      params: { pctCnta },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled greater-of flat / % Consolidated Net Tangible Assets basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && cntaBase) {
    notes.push(
      "Grower component (% of Consolidated Net Tangible Assets) referenced but percentage not parsed; fixed-dollar floor modeled only.",
    );
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes,
      modelingStatus: "MODELED",
      missingFields: ["grower_%_cnta"],
    };
  }

  if (ratio != null && /leverage|incurrence|ratio debt|pro forma/i.test(basketText)) {
    return {
      formulaType: /unlimited|so long as/i.test(basketText) ? "RATIO_GATE" : "LEVERAGE_RATIO_ROOM",
      thresholdValue: ratio,
      params: { debtBasis: /secured|first.?lien/i.test(basketText) ? "secured" : "total" },
      amountKind: "INCURRENCE_BASED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: ["Compiled ratio permission/gate from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (money != null) {
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled fixed-dollar basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  // Rule 197: the clause caps by a defined term whose definition is
  // a bare dollar amount (Strata 6.01(k): "not exceeding the
  // Threshold Amount" + "Threshold Amount means $ 750,000.").
  // Resolve it to a FLAT_AMOUNT. A formula/conditional
  // definition does not resolve — fail closed below.
  const definedCap = resolveDefinedTermCap(item);
  if (definedCap != null && definedCap > 0 && definedCap < 0.001) {
    // P4: same unit-misread floor for a defined-term cap — a
    // "Threshold Amount" of $750 is a dropped scale, not a cap.
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: [
        `Suspected unit misread: the defined-term cap of $${Number((definedCap * 1_000_000).toFixed(2)).toLocaleString("en-US")} is below $1,000 — no real basket is that small (a dropped scale is the likely cause). Not modeled; counsel to confirm the amount from the source text.`,
      ],
      modelingStatus: "KNOWN_NOT_MODELED",
      missingFields: ["thresholdValue"],
    };
  }
  if (definedCap != null) {
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: definedCap,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled fixed-dollar basket from a defined-term cap resolved against the document's definitions"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  // ── Step 4: narrow vocabulary ──────────────────────────────────
  // Determinate shapes the priced branches do not cover. All are
  // reached only when no dollar amount priced the item.
  if (!greaterOf && cntaBase && pctCnta != null) {
    return {
      formulaType: "PCT_OF_CNTA",
      thresholdValue: pctCnta,
      params: { pctCnta },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: [
        "Compiled percentage-of-Consolidated Net Tangible Assets basket. Determinate at parse; evaluation requires the CNTA input (the financial snapshot does not carry it).",
      ],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  const utilizationMatch = basketText.match(
    /utilization\s+percentage\s+shall\s+be\s+(?:less\s+than\s+or\s+equal\s+to|not\s+(?:to\s+)?exceed(?:ing)?|at\s+or\s+below)\s*(\d+(?:\.\d+)?)\s*%/i,
  );
  if (utilizationMatch) {
    const gate = Number(utilizationMatch[1]) / 100;
    return {
      formulaType: "UTILIZATION_GATE",
      thresholdValue: gate,
      params: { measure: "UTILIZATION_PERCENTAGE", comparator: "LTE", pct: gate },
      amountKind: "INCURRENCE_BASED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: [
        "Compiled utilization gate: the clause conditions the permission on the Utilization Percentage being at or below the stated level. A gate, not a basket cap — determinate at parse; evaluation requires the utilization input at transaction time.",
      ],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  const pctCostMatch = basketText.match(/(\d+(?:\.\d+)?)\s*%\s+of the (?:aggregate )?cost of/i);
  if (pctCostMatch) {
    const pct = Number(pctCostMatch[1]) / 100;
    return {
      formulaType: "PCT_OF_COST",
      thresholdValue: pct,
      params: { pctOfCost: pct, basis: "COST_OF_FINANCED_ASSETS" },
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: [
        "Compiled percentage-of-cost cap: the amount is limited to the stated percentage of the cost of the assets being financed. Determinate at parse; evaluation requires the specific assets' cost.",
      ],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  const pctConsiderationMatch = basketText.match(/(\d+(?:\.\d+)?)\s*%\s+of the aggregate consideration/i);
  if (pctConsiderationMatch) {
    const pct = Number(pctConsiderationMatch[1]) / 100;
    return {
      formulaType: "PCT_OF_CONSIDERATION",
      thresholdValue: pct,
      params: { pctOfConsideration: pct },
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: [
        "Compiled percentage-of-consideration cap. Determinate at parse; evaluation requires the specific transaction's aggregate consideration.",
      ],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  const valueCapMatch = basketText.match(
    /(?:does not exceed|shall not exceed|not (?:to )?exceed(?:ing)?)\s+(?:the\s+)?(cost or fair market value|fair market value|cost|purchase price)\b/i,
  );
  if (valueCapMatch) {
    const basisRaw = (valueCapMatch[1] ?? "cost").toLowerCase();
    const capBasis =
      basisRaw === "cost or fair market value"
        ? "COST_OR_FAIR_MARKET_VALUE"
        : basisRaw === "fair market value"
          ? "FAIR_MARKET_VALUE"
          : basisRaw === "purchase price"
            ? "PURCHASE_PRICE"
            : "COST";
    return {
      formulaType: "VALUE_CAP",
      thresholdValue: 0,
      params: { capBasis },
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: [
        `Compiled value cap: the amount is limited to the ${basisRaw} of the financed property — an explicit NON-NUMERIC cap (never a number). Determinate at parse; evaluation requires the specific property's value.`,
      ],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  // Formula representation (step 3): the clause's own text priced
  // nothing and Rule 197 did not resolve — try the parent section's
  // chapeau as an explicit contract field. A cap stated in the stem
  // can govern its clauses (Asure 2.16(e)'s $30M incremental cap
  // lives in the §2.16 stem, a permission stem: "may establish
  // Incremental Facilities ... not to exceed $30,000,000"). The
  // clause's own text always wins — this runs only after it
  // failed — and a chapeau-compiled formula carries its provenance
  // in params.
  //
  // GUARD — prohibition-trigger stems do NOT feed: when the stem
  // is a prohibition whose amount is its TRIGGER ("Enter into any
  // transaction ... with a fair market value in excess of the
  // greater of $12,500,000 and 2.5% of EBITDA ..., other than:"),
  // the sub-clauses are EXCEPTIONS to the prohibition, not baskets
  // capped by the threshold (Solaris/Tenable §7.07 affiliate
  // transactions). Stamping the trigger onto each exception would
  // invent a cap the exception does not carry. Such clauses stay
  // KNOWN_NOT_MODELED with the named reason chapeauCap (below).
  const chapeau = (item.parentChapeau ?? "").trim();
  const chapeauHasCapLanguage =
    chapeau.length > 0 &&
    (parseMoneyMillions(chapeau) != null ||
      /greater of/i.test(chapeau) ||
      parsePctOf(chapeau, "EBITDA") != null ||
      parsePctOf(chapeau, "TOTAL_ASSETS") != null ||
      parsePctOf(chapeau, "NET_WORTH") != null ||
      parsePctOf(chapeau, "CNTA") != null ||
      parseRatio(chapeau) != null ||
      /\bnot\s+(?:to\s+)?exceed/i.test(chapeau) ||
      /\bexceeding\b/i.test(chapeau) ||
      /\bmaximum aggregate\b/i.test(chapeau) ||
      /\bin excess of\s+(?:the\s+greater\s+of|\$)/i.test(chapeau));
  const chapeauProhibitionTrigger = hasProhibitionTrigger(chapeau);
  if (chapeau && !chapeauProhibitionTrigger && grantTypesForItem(item).length > 0) {
    const chapeauParsed = scanBranches(chapeau, "NULL");
    if (chapeauParsed && chapeauParsed.modelingStatus === "MODELED") {
      return {
        ...chapeauParsed,
        params: { ...(chapeauParsed.params ?? {}), capSource: "CHAPEAU" },
        notes: [
          "Cap text is in the section chapeau (stem) governing this clause, not in the clause's own text.",
          ...chapeauParsed.notes,
        ],
      };
    }
  }

  // ── Affirmative UNCAPPED determination (formula-representation
  // step 1) ──────────────────────────────────────────────────────
  // Every priced branch above failed: the scanned contract text
  // carries no parseable amount, percentage-of-base, ratio, builder
  // amount, or resolvable defined-term cap. For a grant-bearing
  // item in a PERMISSION posture, that absence can itself be the
  // determinate answer — many carve-outs genuinely grant without a
  // numeric ceiling (intercompany debt, tax liens, Cash
  // Equivalents, guarantees of permitted debt) — but ONLY when the
  // text affirmatively grants and points at no cap anywhere else.
  // The determination is never a default: any cap language, cap
  // structure, or reference to a cap outside the clause keeps the
  // item KNOWN_NOT_MODELED (with the named reason referenceExternal
  // when the clause points at the cap's location).
  // The uncapped screens read the clause's text AND its governing
  // chapeau (each text separately — a screen must match inside one
  // text, never across the join boundary): a cap stated in the
  // stem means the clause is governed, not uncapped.
  const uncapped = uncappedEvaluation(item, basketText, chapeau, {
    builder: builder || /Available Amount|builder basket|Cumulative Credit/i.test(chapeau),
  });
  if (uncapped.kind === "UNCAPPED" && chapeauHasCapLanguage) {
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: [
        ...notes,
        "The clause is governed by a cap stated in its section stem (chapeau) that the clause-level compile cannot adopt as the clause's own cap (a prohibition threshold, or a stem cap in a form the scan could not price). It stays KNOWN_NOT_MODELED with missing field chapeauCap — never defaulted to uncapped.",
      ],
      modelingStatus: "KNOWN_NOT_MODELED",
      missingFields: ["chapeauCap", "thresholdValue", "formulaType"],
    };
  }
  if (uncapped.kind === "UNCAPPED") {
    return {
      formulaType: "NONE_UNCAPPED",
      thresholdValue: 0,
      params: { qualitativeConditions: [...(item.conditions ?? [])] },
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: [
        ...notes,
        "No finite cap in this clause: the operative text affirmatively grants the permission without a numeric ceiling — no amount, percentage-of-base, ratio, builder amount, or cap reference appears in the clause's contract text. Determinate as NONE_UNCAPPED; the clause's stated qualitative conditions (attached) and the agreement's other clauses still apply.",
      ],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }
  if (uncapped.kind === "REFERENCE_EXTERNAL") {
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: [
        ...notes,
        `The clause points at a cap outside its own text (${uncapped.label}). It stays KNOWN_NOT_MODELED with missing field referenceExternal until reference-following resolves the pointed-to cap — never defaulted to uncapped.`,
      ],
      modelingStatus: "KNOWN_NOT_MODELED",
      missingFields: ["referenceExternal", "thresholdValue", "formulaType"],
    };
  }

  missingFields.push("thresholdValue", "formulaType");
  return {
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 0,
    amountKind: "FIXED",
    measurementBasis: "CUMULATIVE_INCURRED",
    notes: ["Could not parse a numeric basket/threshold — not minting MODELED Permission"],
    modelingStatus: "KNOWN_NOT_MODELED",
    missingFields,
  };
}

/**
 * True when the text phrases an amount as a prohibition TRIGGER
 * ("...with a fair market value in excess of $100,000,000 for any
 * individual transaction, other than:") rather than as a cap
 * ("by an aggregate amount not in excess of $30,000,000" — the
 * negated form is the standard not-to-exceed cap and must NOT
 * trip this check).
 */
function hasProhibitionTrigger(text: string): boolean {
  const re = /in excess of\s+(?:the\s+greater\s+of|\$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 10), m.index);
    if (/not\s+(?:be\s+)?$/i.test(before)) continue;
    return true;
  }
  return false;
}

/**
 * The priced branch logic over an arbitrary contract text — used
 * for the two step-3 auxiliary scans (the parent chapeau, and a
 * truncated item's cap-framed full-span windows). The item's OWN
 * text keeps the original inline path in parseFormulaFromItem;
 * this helper mirrors its branch order and return shapes exactly.
 * Returns null when the text prices nothing. The P4 unit-misread
 * guard returns the fail-closed KNM object for the primary scan
 * ("RETURN") and null for auxiliary scans ("NULL") — a suspect
 * amount in a chapeau or span must not mint, but it also must not
 * poison the item's own evaluation.
 */
function scanBranches(text: string, onUnitMisread: "RETURN" | "NULL"): ParsedFormula | null {
  const notes: string[] = [];
  const money = parseMoneyMillions(text);
  const pctEbitda = parsePctOf(text, "EBITDA");
  const pctAssets = parsePctOf(text, "TOTAL_ASSETS");
  const pctNetWorth = parsePctOf(text, "NET_WORTH");
  const pctCnta = parsePctOf(text, "CNTA");
  const ratio = parseRatio(text);
  const greaterOf = /greater of/i.test(text);
  const ebitdaBase = /EBITDA/i.test(text);
  const assetsBase = /Total Assets|Consolidated Total Assets/i.test(text);
  const netWorthBase = /Net Worth/i.test(text);
  const cntaBase = /Net Tangible Assets/i.test(text);
  const builder = /Available Amount|builder basket|Cumulative Credit/i.test(text);
  const outstanding = /outstanding amount at any time|currently outstanding/i.test(text);

  const ratioDriven = ratio != null && /leverage|incurrence|ratio debt|pro forma/i.test(text);
  if (money != null && money > 0 && money < 0.001 && !ratioDriven) {
    if (onUnitMisread === "NULL") return null;
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: [
        `Suspected unit misread: the parsed amount of $${Number((money * 1_000_000).toFixed(2)).toLocaleString("en-US")} is below $1,000 — no real basket is that small (a dropped scale, e.g. "$30 million" read as $30, is the likely cause). Not modeled; counsel to confirm the amount from the source text.`,
      ],
      modelingStatus: "KNOWN_NOT_MODELED",
      missingFields: ["thresholdValue"],
    };
  }

  if (builder && money != null) {
    const cniMentioned = /net income|CNI/i.test(text);
    const cniShare = parsePctOf(text, "CNI");
    return {
      formulaType: "BUILDER_BASKET",
      thresholdValue: money,
      params: {
        pctEbitda: ebitdaBase && pctEbitda != null ? pctEbitda : undefined,
        cniSharePct: cniShare ?? undefined,
        includeEquityProceeds: /equity/i.test(text),
      },
      amountKind: "FIXED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: ["Compiled builder/available-amount starter from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [
        ...(ebitdaBase && pctEbitda == null ? ["builder pct of EBITDA"] : []),
        ...(cniMentioned && cniShare == null ? ["builder cni share %"] : []),
      ],
    };
  }

  if (greaterOf && money != null && ebitdaBase && pctEbitda != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: money,
      params: { pctEbitda },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled greater-of flat / % EBITDA basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && assetsBase && pctAssets != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      thresholdValue: money,
      params: { pctTotalAssets: pctAssets },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled greater-of flat / % Consolidated Total Assets basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && assetsBase) {
    notes.push(
      "Grower component (% of Consolidated Total Assets) referenced but percentage not parsed; fixed-dollar floor modeled only.",
    );
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes,
      modelingStatus: "MODELED",
      missingFields: ["grower_%_total_assets"],
    };
  }

  if (greaterOf && money != null && netWorthBase && pctNetWorth != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_NET_WORTH",
      thresholdValue: money,
      params: { pctNetWorth },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled greater-of flat / % Consolidated Net Worth basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && netWorthBase) {
    notes.push(
      "Grower component (% of Consolidated Net Worth) referenced but percentage not parsed; fixed-dollar floor modeled only.",
    );
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes,
      modelingStatus: "MODELED",
      missingFields: ["grower_%_net_worth"],
    };
  }

  if (greaterOf && money != null && cntaBase && pctCnta != null) {
    return {
      formulaType: "GREATER_OF_FLAT_OR_PCT_CNTA",
      thresholdValue: money,
      params: { pctCnta },
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled greater-of flat / % Consolidated Net Tangible Assets basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (greaterOf && money != null && cntaBase) {
    notes.push(
      "Grower component (% of Consolidated Net Tangible Assets) referenced but percentage not parsed; fixed-dollar floor modeled only.",
    );
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes,
      modelingStatus: "MODELED",
      missingFields: ["grower_%_cnta"],
    };
  }

  if (ratio != null && /leverage|incurrence|ratio debt|pro forma/i.test(text)) {
    return {
      formulaType: /unlimited|so long as/i.test(text) ? "RATIO_GATE" : "LEVERAGE_RATIO_ROOM",
      thresholdValue: ratio,
      params: { debtBasis: /secured|first.?lien/i.test(text) ? "secured" : "total" },
      amountKind: "INCURRENCE_BASED",
      measurementBasis: "CUMULATIVE_INCURRED",
      notes: ["Compiled ratio permission/gate from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  if (money != null) {
    return {
      formulaType: "FLAT_AMOUNT",
      thresholdValue: money,
      amountKind: "FIXED",
      measurementBasis: outstanding ? "CURRENTLY_OUTSTANDING" : "CUMULATIVE_INCURRED",
      notes: ["Compiled fixed-dollar basket from counsel-accepted analysis"],
      modelingStatus: "MODELED",
      missingFields: [],
    };
  }

  return null;
}

/**
 * Cap-frame discipline for a truncated item's full span: build
 * the scan text from cap-frame SEGMENTS only — for each cap frame
 * (not exceed / exceeding / greater of / lesser of / up to /
 * maximum), the text from the frame up to its first money amount
 * (or a bounded tail when the frame's payload is a percentage or
 * ratio; a greater-of segment keeps both legs). Amounts outside a
 * cap frame — minimum denominations ("not less than $5,000,000",
 * "integral multiple of $1,000,000"), other tests' thresholds —
 * never enter the scan, and the first segment in document order
 * carries the clause's own cap. This is what keeps the full-span
 * leg from repeating the Rule 192 misattribution on a longer
 * text: an early NON-cap amount cannot win, because it is never
 * scanned.
 */
function capFramedWindows(text: string): string {
  const re = /not\s+(?:to\s+)?exceed|exceeding|greater of|lesser of|up to|maximum/gi;
  const segments: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const isGreaterOf = /greater of|lesser of/i.test(m[0]);
    // A greater-of segment keeps both legs. Any other frame keeps
    // only its payload window (64 chars): the frame's own amount
    // or term sits there ("not to exceed $X", "not exceeding the
    // Threshold Amount"), while a LONGER tail would swallow the
    // next sentence's amounts — e.g. the denomination sentence
    // after a ratio frame ("...shall not exceed 3.75:1.00. Each
    // Incremental Facility shall be in an integral multiple of
    // $1,000,000...", the $ ~85 chars past the frame), which is
    // how a minimum denomination would otherwise mint as the
    // clause's cap.
    const bound = Math.min(text.length, start + (isGreaterOf ? 340 : 64));
    let end = bound;
    if (!isGreaterOf) {
      const moneyMatch = /\$[\d,]+(?:\.\d+)?/.exec(text.slice(start, bound));
      if (moneyMatch) end = start + moneyMatch.index + moneyMatch[0].length + 6;
    }
    segments.push(text.slice(start, end));
  }
  return segments.join("\n");
}

type UncappedEvaluation =
  | { kind: "UNCAPPED" }
  | { kind: "REFERENCE_EXTERNAL"; label: string }
  | { kind: "NOT_UNCAPPED" };

/**
 * Screens for the affirmative-uncapped determination. All evidence
 * comes from the item's scanned contract text (the same basketText
 * the priced extractors saw) plus the analyzer's posture, the
 * extracted permission phrases, and grant detection. Fail-closed:
 * every ambiguity resolves to NOT_UNCAPPED or REFERENCE_EXTERNAL.
 */
function uncappedEvaluation(
  item: CovenantSummaryItem,
  basketText: string,
  chapeauText: string,
  flags: { builder: boolean },
): UncappedEvaluation {
  // Screens run over each text SEPARATELY: a pattern must match
  // inside one text, never across the boundary between the
  // clause's text and its chapeau (a permission phrase ending
  // "...permitted pursuant to" joined to a chapeau beginning
  // "Section ..." would otherwise fabricate a reference).
  const texts = chapeauText ? [basketText, chapeauText] : [basketText];
  const anyText = (re: RegExp): boolean => texts.some((t) => re.test(t));
  // (a) The item must actually grant, and the analyzer must have
  // extracted an affirmative permission phrase — keyword-derived
  // grants over a fragment are not an affirmative grant statement.
  if (grantTypesForItem(item).length === 0) return { kind: "NOT_UNCAPPED" };
  if ((item.permissions ?? []).length === 0) return { kind: "NOT_UNCAPPED" };
  // (e) Permission postures only: a prohibition-only or maintenance
  // item never becomes an uncapped permission.
  if (item.posture !== "ENUMERATED_PERMISSION" && item.posture !== "CONDITIONAL_PERMISSION") {
    return { kind: "NOT_UNCAPPED" };
  }
  // A "[reserved]" clause grants nothing — it is not an uncapped
  // permission (grant detection flagging it is a precision issue
  // handled elsewhere; the parse must not bless it).
  const permissionTexts = item.permissions ?? [];
  if (
    permissionTexts.length > 0 &&
    permissionTexts.every((p) => /\[reserved\]/i.test(p) && p.replace(/\[reserved\]/gi, "").replace(/\([a-z0-9]+\)/gi, "").trim().length < 12)
  ) {
    return { kind: "NOT_UNCAPPED" };
  }

  // (d) References to a cap outside the clause's own text. Any hit
  // keeps the item KNOWN_NOT_MODELED with the named reason.
  const referenceScreens: { re: RegExp; label: string }[] = [
    {
      // Rule 197's shape, enumeration-tolerant: the term cap exists
      // but its definition did not resolve to a bare dollar amount.
      re: /not\s+(?:to\s+)?exceed(?:ing)?\s+(?:\([a-z0-9]+\)\s+)?(?:the\s+)?[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,5}/,
      label: "a defined-term cap the engine could not resolve to a bare amount",
    },
    {
      re: /\b(?:set forth|listed|described|specified)\s+(?:in|on)\s+(?:Schedule|Exhibit)\b/i,
      label: "amounts set forth in a schedule or exhibit",
    },
    {
      re: /\bexisting on the (?:Closing Date|date hereof|Effective Date)\b/i,
      label: "a permission for an existing closing-date set, whose amounts live in the closing balances or a schedule",
    },
    {
      re: /does not increase the[^.]{0,60}amount/i,
      label: "a refinancing self-cap (the amount being refinanced)",
    },
    {
      re: /not\s+(?:to\s+)?exceed(?:ing)?\s+the\s+(?:aggregate\s+)?(?:principal\s+)?amount\s+of\s+(?:the\s+)?(?:Indebtedness|Obligations|Loans|debt)\s+being/i,
      label: "a refinancing self-cap (the amount being refinanced)",
    },
    {
      re: /face amount of (?:such|the|any|a)\s+Letter of Credit/i,
      label: "the face amount of a Letter of Credit",
    },
    {
      re: /permitted\s+(?:under|pursuant\s+to|by)\s+(?:this\s+)?(?:Section|clause|Article)\s/i,
      label: "a permission granted by reference to another provision, whose own caps govern",
    },
  ];
  for (const screen of referenceScreens) {
    if (anyText(screen.re)) return { kind: "REFERENCE_EXTERNAL", label: screen.label };
  }
  // A builder reference with no parseable amount: the cap is the
  // Available Amount / Cumulative Credit balance, a defined-term
  // construct governed by its definition — external to this clause.
  if (flags.builder) {
    return { kind: "REFERENCE_EXTERNAL", label: "an Available Amount / builder balance defined elsewhere in the agreement" };
  }

  // The clause incorporates conditions "set forth in this clause"
  // that the item does not carry: the operative conditions are
  // unexamined, so the grant is not affirmatively uncapped — the
  // unseen conditions may contain the cap (the narration audit's
  // conduit pin: with the conditions field removed, the item must
  // stay KNOWN_NOT_MODELED).
  if (
    (item.conditions ?? []).length === 0 &&
    /subject to (?:satisfaction of )?the conditions (?:precedent )?(?:set forth|specified|contained) in (?:this|such) (?:clause|Section)/i.test(basketText)
  ) {
    return { kind: "NOT_UNCAPPED" };
  }

  // (c) Cap language or cap structure present but unquantified,
  // anywhere in the scanned contract text (a proviso stating a
  // percentage-of-assets limit is a cap statement, not a mere
  // gate): the clause states a ceiling the extractors could not
  // price — it is not uncapped, it is unparsed.
  const capLanguage =
    /\bnot\s+(?:to\s+)?exceed/i.test(basketText) ||
    /\bexceeding\b/i.test(basketText) ||
    /\bno more than\b/i.test(basketText) ||
    /\bmaximum aggregate\b/i.test(basketText) ||
    /greater of/i.test(basketText) ||
    parsePctOf(basketText, "EBITDA") != null ||
    parsePctOf(basketText, "TOTAL_ASSETS") != null ||
    parsePctOf(basketText, "NET_WORTH") != null ||
    parsePctOf(basketText, "CNI") != null ||
    parseRatio(basketText) != null;
  if (capLanguage) return { kind: "NOT_UNCAPPED" };

  return { kind: "UNCAPPED" };
}

const INDEPENDENT_REQUIREMENT_RE =
  /\bno\s+(?:default|event\s+of\s+default)\b|\bpro\s+forma\s+compliance\b|\brepresentation|\bwarrant|\bsolvency|\bsolvent\b|\bno\s+(?:breach|violation)\b|\bcompliance\s+with\s+(?:the\s+)?(?:covenants?|terms|provisions)/i;

export function isCapRestatementCondition(text: string, thresholdValue: number | null): boolean {
  if (thresholdValue == null) return false;
  // Rule 206 tightening: a mixed condition (cap + an independent
  // requirement) is not a pure cap restatement — keep it.
  if (INDEPENDENT_REQUIREMENT_RE.test(text)) return false;
  const capVerb = /\b(?:not\s+exceed(?:ing)?|does\s+not\s+exceed|shall\s+not\s+exceed|up\s+to\s+\$|maximum\b[^.]{0,40}\$|no\s+more\s+than\s+\$|capped\s+at\s+\$)/i.test(text);
  if (!capVerb) return false;
  const amounts = text.match(/\$\s*[\d,]+(?:\.\d+)?/g) ?? [];
  return amounts.some((a) => {
    const v = parseMoneyMillions(a);
    return v != null && Math.abs(v - thresholdValue) < 1e-6;
  });
}

/**
 * Veto content for the mechanical-proviso filter: the
 * INDEPENDENT_REQUIREMENT_RE alternatives OTHER than the two
 * mechanical provisos themselves (no-Default / pro forma
 * compliance), plus delivery-of-evidence markers. A condition
 * carrying any of these is a substantive requirement counsel
 * must resolve, never a mechanical proviso.
 */
const MECHANICAL_PROVISO_VETO_RE =
  /\brepresentation|\bwarrant|\bsolvency|\bsolvent\b|\bno\s+(?:breach|violation)\b|\bcompliance\s+with\s+(?:the\s+)?(?:covenants?|terms|provisions)|\bcertificates?\b|\bopinions?\b|\bdeliver\w*\b|\bfurnish\w*\b|\bevidence\s+of\b|\bevidencing\b/i;

/**
 * The standard no-Default proviso core: a negated Default /
 * Event of Default plus its state verb. The terse fragment
 * "no Default has occurred" does NOT qualify on its own — the
 * completeness check below additionally requires the
 * continuing / would-result / shall-exist element that makes
 * the proviso the complete, fixed-meaning eligibility test.
 */
const NO_DEFAULT_PROVISO_CORE_RE =
  /^(?:provided\s*,?\s*(?:however\s*,?\s*)?that\s*[:,]?\s*)?(?:so\s+long\s+as\s+)?no\s+(?:default|event\s+of\s+default)(?:\s+or\s+(?:default|event\s+of\s+default))?\s+(?:shall\s+have\s+occurred|has\s+occurred|have\s+occurred|shall\s+exist|exists?|is\s+continuing)/i;

const NO_DEFAULT_PROVISO_COMPLETE_RE = /\bcontinuing\b|\bwould\s+result\b|\bshall\s+exist\b|\bexists\b/i;

/**
 * Words that may appear AFTER the no-Default core in the
 * standard proviso ("... and be continuing or would result
 * from the incurrence of such Indebtedness after giving effect
 * thereto"). Any other word in the residue means the condition
 * says more than the mechanical proviso — fail closed.
 */
const NO_DEFAULT_TAIL_WORDS = new Set([
  "and", "or", "be", "is", "was", "continuing", "would", "will",
  "result", "results", "resulting", "therefrom", "thereof",
  "thereto", "herefrom", "after", "before", "giving", "effect",
  "effects", "to", "the", "a", "an", "incurrence", "incurring",
  "incurred", "of", "such", "indebtedness", "debt", "loans",
  "loan", "extensions", "extension", "credit", "on", "date",
  "at", "time", "in", "connection", "with", "as", "immediately",
  "prior", "from", "by", "reason",
]);

function isNoDefaultProviso(body: string): boolean {
  const core = body.match(NO_DEFAULT_PROVISO_CORE_RE);
  if (!core) return false;
  if (!NO_DEFAULT_PROVISO_COMPLETE_RE.test(body)) return false;
  const residue = body.slice(core[0].length).replace(/[.\s]+$/, "");
  if (!residue.trim()) return true;
  const words = residue
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/g, ""))
    .filter(Boolean);
  return words.every((w) => NO_DEFAULT_TAIL_WORDS.has(w));
}

function isProFormaComplianceProviso(body: string): boolean {
  const m = body.match(
    /^(?:provided\s*,?\s*(?:however\s*,?\s*)?that\s*[:,]?\s*)?pro\s+forma\s+compliance\s+with\s+([\s\S]+)$/i,
  );
  if (!m) return false;
  const object = m[1] ?? "";
  // The object names the test complied with (a covenant, ratio,
  // or section). A second clause (semicolon, or a fresh
  // Borrower-shall obligation) is a separate requirement.
  if (/;/.test(object)) return false;
  if (/\b(?:and|or)\s+(?:the\s+)?(?:borrower|company)\s+shall\b/i.test(object)) return false;
  return true;
}

/**
 * P1: a MECHANICAL proviso — a condition whose entire content is
 * one of the two fixed-meaning eligibility provisos of leveraged
 * finance: (a) no Default / Event of Default continuing (or
 * would-result), or (b) pro forma compliance with a named test.
 * Condition strings are stored as "<signal>: <excerpt>"; the
 * signal prefix is stripped and the remaining text must be
 * SOLELY the proviso — no veto content (representations,
 * solvency, certificates, opinions, delivery/furnishing duties,
 * evidence-of markers), nothing left over.
 *
 * Safety basis: the condition text is fully extracted and
 * quoted, and compile carries it verbatim onto the Permission
 * as an eligibility condition the solver already fails closed
 * on at evaluation (an UNKNOWN predicate is never cleared).
 * Filtering it from the remaining-conditions gate asserts only
 * the INTERPRETATION (this basket's proviso is the standard
 * one), never that the proviso is satisfied. Anything that is
 * not recognizably the complete standard proviso — including
 * the terse fragment "no Default has occurred" — stays a
 * remaining condition for counsel (fail closed).
 */
export function isMechanicalProvisoCondition(text: string): boolean {
  const body = String(text).replace(/^[a-z_]+(?:,[a-z_]+)*:\s*/i, "").trim();
  if (!body) return false;
  if (MECHANICAL_PROVISO_VETO_RE.test(body)) return false;
  return isNoDefaultProviso(body) || isProFormaComplianceProviso(body);
}

/**
 * The SHARED remaining-conditions computation for the review
 * gate (isRoutineItem) and the proposer (proposeReviewDecision):
 * an item's conditions minus pure cap restatements (Rule 206)
 * and mechanical provisos (P1). Both consumers MUST use this
 * one function so the gate and the proposal can never disagree
 * about what is left for counsel to resolve.
 */
export function remainingConditionsForItem(item: CovenantSummaryItem): string[] {
  const parsed = parseFormulaFromItem(item);
  return (item.conditions ?? []).filter(
    (c) =>
      !isCapRestatementCondition(String(c), parsed.thresholdValue) &&
      !isMechanicalProvisoCondition(String(c)),
  );
}

export function parseCounselFormulaForTest(item: CovenantSummaryItem) {
  return parseFormulaFromItem(item);
}
