/**
 * Recursive defined-term dependency closure — company-agnostic, fail-closed on cycles.
 */

import type {
  ContractualFinancialDefinition,
  DefinitionDependencyClosure,
  DefinitionDependencyNode,
} from "./types";

export function buildDefinitionDependencyClosure(
  root: ContractualFinancialDefinition,
  byTermName: ReadonlyMap<string, ContractualFinancialDefinition>,
): DefinitionDependencyClosure {
  const nodes: DefinitionDependencyNode[] = [];
  const unresolvedTerms: string[] = [];
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (termName: string, depth: number, path: string[]): void => {
    if (visiting.has(termName)) {
      const at = path.indexOf(termName);
      cycles.push([...path.slice(at), termName]);
      nodes.push({
        termName,
        definitionId: byTermName.get(termName)?.definitionId ?? null,
        metricKind: byTermName.get(termName)?.metricKind ?? null,
        depth,
        status: "CYCLE",
        reason: `Cycle detected: ${[...path.slice(at), termName].join(" → ")}`,
      });
      return;
    }
    if (visited.has(termName)) return;

    const def = byTermName.get(termName);
    if (!def) {
      unresolvedTerms.push(termName);
      nodes.push({
        termName,
        definitionId: null,
        metricKind: null,
        depth,
        status: "UNRESOLVED",
        reason: "No instrument-scoped definition supplied for this term",
      });
      return;
    }

    if (def.sufficiency === "UNSUPPORTED" || def.calculationExpression === null) {
      nodes.push({
        termName,
        definitionId: def.definitionId,
        metricKind: def.metricKind,
        depth,
        status: "UNSUPPORTED",
        reason:
          def.sufficiencyReasons[0] ??
          (def.calculationExpression === null
            ? "Definition has no calculationExpression"
            : "Definition sufficiency is UNSUPPORTED"),
      });
    } else {
      nodes.push({
        termName,
        definitionId: def.definitionId,
        metricKind: def.metricKind,
        depth,
        status: "RESOLVED",
      });
    }

    visiting.add(termName);
    for (const dep of def.dependsOnTerms) {
      visit(dep, depth + 1, [...path, termName]);
    }
    visiting.delete(termName);
    visited.add(termName);
  };

  // Root always recorded first
  visit(root.termName, 0, []);
  // Ensure root's own dependsOnTerms are walked even if root term map key differs
  for (const dep of root.dependsOnTerms) {
    if (!visited.has(dep) && !visiting.has(dep)) visit(dep, 1, [root.termName]);
  }

  const executable =
    cycles.length === 0 &&
    unresolvedTerms.length === 0 &&
    root.calculationExpression !== null &&
    (root.sufficiency === "COMPLETE" || root.sufficiency === "PARTIAL") &&
    !nodes.some((n) => n.status === "UNSUPPORTED" || n.status === "UNRESOLVED" || n.status === "CYCLE");

  return {
    rootDefinitionId: root.definitionId,
    rootTermName: root.termName,
    nodes,
    unresolvedTerms: [...new Set(unresolvedTerms)].sort(),
    cycles,
    executable,
  };
}

/** Index definitions by termName within one instrument (last write wins; callers should dedupe). */
export function indexDefinitionsByTerm(
  defs: readonly ContractualFinancialDefinition[],
): Map<string, ContractualFinancialDefinition> {
  const m = new Map<string, ContractualFinancialDefinition>();
  for (const d of defs) m.set(d.termName, d);
  return m;
}
