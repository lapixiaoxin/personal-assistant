"""Check repository Markdown links and SPEC-0001 design traceability."""

import ast
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlparse
from xml.etree import ElementTree

root = Path.cwd()
files = [root / "README.md", root / "AGENTS.md"]
files += sorted((root / "docs").rglob("*.md"))
files += sorted((root / "specs").rglob("*.md"))
errors = []
link_count = 0
for path in files:
    text = path.read_text()
    # Templates contain non-existent example links; fenced examples are not links.
    visible = re.sub(r"```.*?```", "", text, flags=re.S)
    for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", visible):
        if urlparse(target).scheme or target.startswith("#"):
            continue
        local = unquote(target.split("#")[0])
        link_count += 1
        if not (path.parent / local).exists():
            errors.append(f"{path.relative_to(root)}: missing {local}")

spec_dir = root / "specs/0001-action-boundary"
spec = (spec_dir / "spec.md").read_text()
tasks = (spec_dir / "tasks.md").read_text()
evidence = (spec_dir / "evidence.md").read_text()
for number in range(1, 12):
    if f"FR-{number:03d}" not in spec:
        errors.append(f"SPEC-0001: missing FR-{number:03d}")
for number in range(1, 11):
    if f"AC-{number:03d}" not in spec:
        errors.append(f"SPEC-0001: missing AC-{number:03d}")
    if f"T-{number:02d}" not in tasks:
        errors.append(f"SPEC-0001: missing T-{number:02d}")
evidence_status = re.search(r"^状态：(.+?)。", evidence, flags=re.MULTILINE)
if not evidence_status or evidence_status.group(1) not in {
    "not_run",
    "passed / locally verified",
}:
    errors.append("SPEC-0001 evidence status must be explicitly reviewed")
if evidence_status and evidence_status.group(1).startswith("passed") and "| not_run |" in evidence:
    errors.append("SPEC-0001 passed evidence still contains not_run entries")
for path in (root / "docs/design").glob("*.md"):
    if "Proposed" not in path.read_text():
        errors.append(f"{path.relative_to(root)}: status changed; review design baseline")
for path in (root / "scripts").glob("*design-doc.py"):
    ast.parse(path.read_text(), filename=str(path))
ast.parse((root / "scripts/docs-to-lark.py").read_text())
ElementTree.parse(root / "docs/design/assets/closed-loops.svg")
result = {"markdown_files": len(files), "local_links_checked": link_count,
          "spec_requirements": 11, "spec_acceptance_criteria": 10, "spec_tasks": 10,
          "errors": errors, "status": "passed" if not errors else "failed"}
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(bool(errors))
