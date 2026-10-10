# Corpus quality gate

Read-only audits after massive corpus expansion. **Does not write Neon.**

```bash
npm run kf:neon-quality-gate
npm run kf:neon-quality-gate -- --skip-network
```

| Artifact | Purpose |
|---|---|
| `relationship-audit.json` | Edge precision / duplicates / self-loops |
| `operative-audit.json` | Governing-document resolution gold cases |
| `retrieval-completeness.json` | Independent covenant questions |
| `diversity-dry-run.json` | ABL / IC / guarantee discovery (no persist) |
| `database-effects.json` | Inserted vs skipped / storage |
| `financing-package-registry-PROPOSAL.md` | Additive package identity design |
| `summary.json` | Roll-up metrics + safety concerns |
| `MISSION-REPORT.md` | Full gate report |
