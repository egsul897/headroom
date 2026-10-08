/**
 * Dependency coordination stubs for Definition Encyclopedia, Dependency Atlas,
 * Negative Covenant Exception Database, and Covenant Knowledge Factory.
 *
 * Those products are not yet shipped in-repo. This module records required
 * dependency classes and what can be resolved from local source text alone.
 * A formula is never marked executable here.
 */

export type DependencySystem =
  | "DEFINITION_ENCYCLOPEDIA"
  | "DEPENDENCY_ATLAS"
  | "NEGATIVE_COVENANT_EXCEPTION_DATABASE"
  | "COVENANT_KNOWLEDGE_FACTORY"
  | "ARCHITECTURE_REMEDIATION_LEGAL_CORE"
  | "FINANCIAL_DEFINITIONS_PRECEDENT";

export interface DependencySystemStatus {
  system: DependencySystem;
  availableInRepo: false;
  coordinationMode: "INTERFACE_ONLY";
  note: string;
}

export const DEPENDENCY_SYSTEM_STATUS: DependencySystemStatus[] = [
  {
    system: "DEFINITION_ENCYCLOPEDIA",
    availableInRepo: false,
    coordinationMode: "INTERFACE_ONLY",
    note: "No Definition Encyclopedia corpus exists in-repo; controlling defined terms are listed as unresolved term refs from source text.",
  },
  {
    system: "DEPENDENCY_ATLAS",
    availableInRepo: false,
    coordinationMode: "INTERFACE_ONLY",
    note: "No Dependency Atlas exists; cross-clause/shared-pool edges are recorded as unresolved atlas dependencies.",
  },
  {
    system: "NEGATIVE_COVENANT_EXCEPTION_DATABASE",
    availableInRepo: false,
    coordinationMode: "INTERFACE_ONLY",
    note: "No Negative Covenant Exception Database exists; exception/proviso gates are captured from local spans only.",
  },
  {
    system: "COVENANT_KNOWLEDGE_FACTORY",
    availableInRepo: false,
    coordinationMode: "INTERFACE_ONLY",
    note: "Knowledge Factory not shipped; import contract knowledge-factory-import.basket-formula.v1 is the integration surface.",
  },
  {
    system: "ARCHITECTURE_REMEDIATION_LEGAL_CORE",
    availableInRepo: false,
    coordinationMode: "INTERFACE_ONLY",
    note: "Architecture Remediation / Legal Core interfaces are coordinated only; no competing schema or independent SEC download path.",
  },
  {
    system: "FINANCIAL_DEFINITIONS_PRECEDENT",
    availableInRepo: false,
    coordinationMode: "INTERFACE_ONLY",
    note: "Financial Definitions Precedent not bound; EBITDA/ratio inputs remain unresolved financial dependencies.",
  },
];

export interface FormulaDependencyReport {
  candidateId: string;
  controllingDefinitions: string[];
  provisos: string[];
  financialInputs: string[];
  sharedPools: string[];
  amendments: string[];
  entityRestrictions: string[];
  unresolved: Array<{ system: DependencySystem | "LOCAL_SOURCE"; key: string; reason: string }>;
  executable: false;
}

export function buildDependencyReport(input: {
  candidateId: string;
  financialInputs: string[];
  conditions: string[];
  sharedCapacityDependencies: string[];
  entityScope: string;
  notes: string;
  governingCovenant: string;
}): FormulaDependencyReport {
  const termLike = new Set<string>();
  const termRe = /\b(Consolidated (?:EBITDA|Net Income|Total Assets|Interest Expense)|Applicable EBITDA|LTM EBITDA|Available Amount|Available RP Capacity Amount|Payment Conditions|Fixed Incremental Amount|Ratio Incremental Amount|General Lien Basket|Qualified Stock|Excluded Contributions?|Test Period|Reference Date|First Lien (?:Net )?Leverage Ratio|Secured Net Leverage Ratio|Total (?:Net )?Leverage Ratio|Interest Coverage Ratio|Fixed Charge Coverage Ratio)\b/g;
  const corpus = [
    input.governingCovenant,
    input.notes,
    ...input.financialInputs,
    ...input.conditions,
    ...input.sharedCapacityDependencies,
    input.entityScope,
  ].join("\n");
  let m: RegExpExecArray | null;
  while ((m = termRe.exec(corpus)) !== null) termLike.add(m[1]!);

  const unresolved: FormulaDependencyReport["unresolved"] = [];
  for (const t of termLike) {
    unresolved.push({
      system: "DEFINITION_ENCYCLOPEDIA",
      key: t,
      reason: "Definition Encyclopedia unavailable; term meaning not encyclopedia-resolved",
    });
  }
  for (const pool of input.sharedCapacityDependencies) {
    unresolved.push({
      system: "DEPENDENCY_ATLAS",
      key: pool,
      reason: "Dependency Atlas unavailable; shared-pool edge not atlas-resolved",
    });
  }
  for (const cond of input.conditions) {
    unresolved.push({
      system: "NEGATIVE_COVENANT_EXCEPTION_DATABASE",
      key: cond.slice(0, 160),
      reason: "Exception DB unavailable; proviso/condition retained as local text only",
    });
  }
  if (/non-Guarantor|Foreign Subsidiary|Loan Party|Restricted Subsidiar/i.test(input.entityScope)) {
    unresolved.push({
      system: "LOCAL_SOURCE",
      key: input.entityScope,
      reason: "Entity-specific limit stated in source but not bound to a certified entity graph",
    });
  }
  unresolved.push({
    system: "COVENANT_KNOWLEDGE_FACTORY",
    key: input.candidateId,
    reason: "Not imported/verified by Covenant Knowledge Factory",
  });
  unresolved.push({
    system: "ARCHITECTURE_REMEDIATION_LEGAL_CORE",
    key: input.governingCovenant.slice(0, 160) || input.candidateId,
    reason: "Legal Core parent-covenant binding not certified via Architecture Remediation interfaces",
  });
  for (const fi of input.financialInputs) {
    unresolved.push({
      system: "FINANCIAL_DEFINITIONS_PRECEDENT",
      key: fi.slice(0, 160),
      reason: "Financial Definitions Precedent unavailable; metric/input not precedent-resolved",
    });
  }

  return {
    candidateId: input.candidateId,
    controllingDefinitions: [...termLike],
    provisos: [...input.conditions],
    financialInputs: [...input.financialInputs],
    sharedPools: [...input.sharedCapacityDependencies],
    amendments: [],
    entityRestrictions: [input.entityScope],
    unresolved,
    executable: false,
  };
}
