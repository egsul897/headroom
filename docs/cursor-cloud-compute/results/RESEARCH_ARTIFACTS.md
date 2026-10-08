# Research artifacts (quarantined from infra merge)

Soft gate. **NOT CERTIFIED.**

```json
{
  "status": "RESEARCH_ARTIFACTS_QUARANTINED_NOT_CERTIFIED",
  "note": "Bulky per-document research JSON removed from the infra merge surface. Summaries + checksums remain. Full CAS tarball lives in the agent artifact store.",
  "checkpointId": "phase3-2026-10-08T22-52-47-268Z-e49360ba",
  "artifactTarballSha256": "c2cb47e331e39f1ae35f7cb848b98ea7cb364108fdbd3301ba139668a523222b",
  "artifactTarballPath": "/opt/cursor/artifacts/cursor-cloud-compute/handoff-phase3-2026-10-08T22-52-47-268Z-e49360ba.tar.gz",
  "documentCount": 155,
  "distinctSourceHashes": 154,
  "checksumsPath": "docs/cursor-cloud-compute/results/phase3-handoff-checksums-e49360ba.jsonl",
  "retainedSummaries": [
    "docs/cursor-cloud-compute/measured-results.md",
    "docs/cursor-cloud-compute/measured-results-phase2.md",
    "docs/cursor-cloud-compute/measured-results-phase3.md",
    "docs/cursor-cloud-compute/results/phase3-phase3-2026-10-08T22-52-47-268Z-e49360ba.json",
    "docs/cursor-cloud-compute/results/durable-index.jsonl"
  ],
  "quarantinedFromInfraMerge": [
    "phase3-forensic-classification.json",
    "phase3-handoff-index-phase3-2026-10-08T22-52-47-268Z-e49360ba.json",
    "phase3-quality-sample-phase3-2026-10-08T22-52-47-268Z-e49360ba.json",
    "compute-assessment-2026-10-08T22-07-32-561Z-7f3ce634.json",
    "phase2-real-edgar-phase2-2026-10-08T22-26-35-340Z-7a6d213d.json"
  ]
}
```

Full forensic / quality / handoff-index JSON are retained in git history on this branch prior to quarantine commit, and the content-addressed corpus remains in the artifact tarball (sha256 above).
