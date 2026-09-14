#!/usr/bin/env python3
"""F-6 same-root search: diff the corpus replay before/after (scripts/f6-recorded-replay.ts corpus) into docs/phase-3-remediation-f6/06-same-root-search.json."""
import json, sys
a = json.load(open(sys.argv[1])); b = json.load(open(sys.argv[2]))
ra = {(r['file'], r['pointer']): r for r in a['rows']}; rb = {(r['file'], r['pointer']): r for r in b['rows']}
rows = []
for k in ra:
    x, y = ra[k], rb[k]
    if 'error' in x:
        rows.append({'file': k[0], 'pointer': k[1], 'status': 'WIRE_PARSE_ERROR', 'classification': 'A MODEL_OUTPUT_INVALID (the recorded wire payload does not satisfy SubmitCompilationSchema; out of F-6 scope)', 'error': x['error'][:160]}); continue
    ex = {(e['owner'], e['slot']): e for e in x['expressions']}; ey = {(e['owner'], e['slot']): e for e in y['expressions']}
    repaired = []
    for kk in ex:
        if ex[kk]['ir'] != ey[kk]['ir']:
            repaired.append({'owner': kk[0], 'slot': kk[1], 'inferredTypeBefore': ex[kk]['inferredType'], 'inferredTypeAfter': ey[kk]['inferredType'], 'kindBefore': ex[kk]['ir'].split('(')[0].split(':')[0], 'kindAfter': ey[kk]['ir'].split('(')[0].split(':')[0], 'sufficiencyBefore': ex[kk]['sufficiency'], 'sufficiencyAfter': ey[kk]['sufficiency'], 'irBefore': ex[kk]['ir'][:300], 'irAfter': ey[kk]['ir'][:300]})
    rows.append({'file': k[0], 'pointer': k[1], 'status': 'REPLAYED', 'reproducedRecordedIRExactlyAtStartingSha': x['reproducedRecordedIRExactly'],
        'before': {'unsupportedLive': x['expressionStats']['unsupportedNodes'], 'nodesOnlyInAttempted': x['expressionStats']['nodesOnlyInAttemptedStructure'], 'typeErrors': x['irValidationIssuesByKind'].get('TYPE_ERROR', 0), 'ruleSufficiency': x['ruleSufficiency'], 'definitionSufficiency': x['definitionSufficiency']},
        'after': {'unsupportedLive': y['expressionStats']['unsupportedNodes'], 'nodesOnlyInAttempted': y['expressionStats']['nodesOnlyInAttemptedStructure'], 'partialCompositesKept': y['expressionStats']['partialCompositesKept'], 'typeErrors': y['irValidationIssuesByKind'].get('TYPE_ERROR', 0), 'falseCompleteness': y['irValidationIssuesByKind'].get('FALSE_COMPLETENESS', 0), 'ruleSufficiency': y['ruleSufficiency'], 'definitionSufficiency': y['definitionSufficiency']},
        'expressionsRepaired': len(repaired), 'repaired': repaired})
rep = [r for r in rows if r['status'] == 'REPLAYED']; same = [r for r in rep if r['expressionsRepaired'] > 0]
S = lambda key, sub: {k: sum(r[key][sub][k] for r in rep) for k in ['COMPLETE', 'PARTIAL', 'AMBIGUOUS', 'UNSUPPORTED']}
out = {'artifact': '06 - F-6 same-root search: every recorded compiler payload under tests/fixtures replayed through the deterministic path before vs after the fix (zero model calls)',
 'recordsFound': len(rows), 'recordsReplayed': len(rep), 'recordsWithWireParseError': len(rows) - len(rep),
 'recordsReproducedExactlyAtStartingSha': sum(1 for r in rep if r['reproducedRecordedIRExactlyAtStartingSha']),
 'recordsNotReproducedExactly': 'older runs whose recorded rules predate later provenance/lineage/identity changes - their expressions still replay deterministically and are compared before vs after on the same replay path',
 'recordsWithSameRootRepairs': len(same), 'expressionsRepaired': sum(r['expressionsRepaired'] for r in rep),
 'totals': {'before': {'unsupportedLive': sum(r['before']['unsupportedLive'] for r in rep), 'nodesOnlyInAttempted': sum(r['before']['nodesOnlyInAttempted'] for r in rep), 'typeErrors': sum(r['before']['typeErrors'] for r in rep)},
            'after': {'unsupportedLive': sum(r['after']['unsupportedLive'] for r in rep), 'nodesOnlyInAttempted': sum(r['after']['nodesOnlyInAttempted'] for r in rep), 'partialCompositesKept': sum(r['after']['partialCompositesKept'] for r in rep), 'typeErrors': sum(r['after']['typeErrors'] for r in rep), 'falseCompleteness': sum(r['after']['falseCompleteness'] for r in rep)}},
 'sufficiencyTotals': {'rulesBefore': S('before', 'ruleSufficiency'), 'rulesAfter': S('after', 'ruleSufficiency'), 'definitionsBefore': S('before', 'definitionSufficiency'), 'definitionsAfter': S('after', 'definitionSufficiency')},
 'note': 'nodesOnlyInAttempted counts IR structure that existed only inside an UNSUPPORTED wrapper sidecar (invisible to executability, reconciliation and verification); unsupportedLive rises after the fix because previously-hidden model-emitted UNSUPPORTED leaves are now live, in-place nodes. Records whose expressions changed are the same-root population; nothing outside the expression type path was touched.',
 'records': rows}
json.dump(out, open(sys.argv[3], 'w'), indent=2)
print(json.dumps({k: v for k, v in out.items() if k != 'records'}, indent=1))
