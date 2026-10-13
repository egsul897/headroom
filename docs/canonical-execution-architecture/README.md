# Canonical execution architecture

Authoritative spine vs supporting cross-domain modeling.

| Doc | Contents |
|---|---|
| `00-caller-map.md` | Production callers + outputs of both paths |
| `01-integration-plan.md` | Canonical modules, adapters, retirees, PR sequence |

## Reproduce gates

```bash
npx vitest run tests/product/canonical-execution-authority.test.ts tests/product/cross-domain-transaction.test.ts
```
