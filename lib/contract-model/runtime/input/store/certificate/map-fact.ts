/**
 * Map a certificate fact proposal → Phase 4B FinancialInput (1:1 identity).
 * Consumes frozen 4B types only; does not edit identity/resolver/snapshot modules.
 */
import { rationalFromString } from "../../../decimal";
import type { RuntimeValue } from "../../../types";
import type { FinancialInput, FinancialInputIdentity } from "../../types";
import type { CertificateFactProposal, CertificateFactValue } from "./types";

const EMPTY_LINEAGE = { exprId: null as string | null, inputKeys: [] as string[] };

function toRuntimeValue(v: CertificateFactValue, key: string): RuntimeValue {
  const lineage = { ...EMPTY_LINEAGE, inputKeys: [key] };
  switch (v.type) {
    case "MONEY":
      return { type: "MONEY", amount: rationalFromString(v.amount), currency: v.currency, lineage };
    case "NUMBER":
      return { type: "NUMBER", value: rationalFromString(v.value), lineage };
    case "RATIO":
      return { type: "RATIO", value: rationalFromString(v.value), lineage };
    case "PERCENT":
      return { type: "PERCENT", fraction: rationalFromString(v.fraction), lineage };
    case "BOOLEAN":
      return { type: "BOOLEAN", value: v.value, lineage };
    case "DATE":
      return { type: "DATE", isoDate: v.isoDate, lineage };
  }
}

/** Build 4B identity from a certificate fact proposal (1:1). */
export function factToIdentity(fact: CertificateFactProposal): FinancialInputIdentity {
  return {
    companyId: fact.companyId,
    scope: structuredClone(fact.scope),
    inputKind: fact.inputKind,
    key: fact.key,
    identityStrength: fact.identityStrength,
    period: structuredClone(fact.period),
    asOf: structuredClone(fact.asOf),
    valueType: fact.valueType,
    currency: fact.currency,
  };
}

/**
 * Encode certificate page/section/table/row into the FinancialInput note so Prisma
 * rematerialize can persist a real FactLocator (4B identity types stay unchanged).
 */
export function encodeLocatorNote(
  note: string | undefined,
  locator: CertificateFactProposal["locator"],
): string | undefined {
  const payload = {
    page: locator.page ?? null,
    section: locator.section ?? null,
    table: locator.table ?? null,
    row: locator.row ?? null,
    note: locator.note ?? null,
  };
  const encoded = `sourceLocator=${JSON.stringify(payload)}`;
  return note ? `${note}; ${encoded}` : encoded;
}

/** Recover locator JSON previously encoded by encodeLocatorNote. */
export function decodeLocatorFromNote(note: string | null | undefined): {
  page?: number | null;
  section?: string | null;
  table?: string | null;
  row?: string | null;
  note?: string | null;
} | null {
  if (!note) return null;
  const m = note.match(/sourceLocator=(\{[^;]*\})/);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]) as {
      page?: number | null;
      section?: string | null;
      table?: string | null;
      row?: string | null;
      note?: string | null;
    };
  } catch {
    return null;
  }
}

/** Build 4B FinancialInput from a certificate fact proposal. */
export function factToFinancialInput(fact: CertificateFactProposal, sourceVersion: string): FinancialInput {
  return {
    identity: factToIdentity(fact),
    value: toRuntimeValue(fact.value, fact.key),
    displayName: fact.displayName,
    sourceVersion,
    note: encodeLocatorNote(fact.note, fact.locator),
  };
}

/** Canonical identity key used for duplicate detection within a certificate. */
export function certificateIdentityKey(fact: CertificateFactProposal): string {
  return [
    fact.companyId,
    JSON.stringify(fact.scope),
    fact.inputKind,
    fact.key,
    JSON.stringify(fact.period),
    JSON.stringify(fact.asOf),
    fact.valueType,
    fact.currency ?? "-",
  ].join("::");
}
