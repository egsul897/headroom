#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
report = Path("docs/headroom-6-recursive-legal-context/00-mission-report.md")
text = report.read_text()
lines = []
for line in text.splitlines(keepends=True):
    if line.startswith("| Ending SHA |"):
        lines.append(f"| Ending SHA | `{sha}` |\n")
    else:
        lines.append(line)
report.write_text("".join(lines))

metrics = Path("docs/headroom-6-recursive-legal-context/01-wor-before-after.json")
data = json.loads(metrics.read_text())
data["endingSha"] = sha
metrics.write_text(json.dumps(data, indent=2) + "\n")
print(sha)
