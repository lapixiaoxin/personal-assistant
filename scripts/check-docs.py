"""Check current repository documentation links and SVG syntax."""

import json
import re
from pathlib import Path
from urllib.parse import unquote, urlparse
from xml.etree import ElementTree

root = Path.cwd()
files = [root / "README.md", root / "AGENTS.md"]
files += sorted((root / "docs").rglob("*.md"))
files += sorted((root / "specs").glob("*.md"))
errors = []
link_count = 0

for path in files:
    text = path.read_text()
    visible = re.sub(r"```.*?```", "", text, flags=re.S)
    for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", visible):
        if urlparse(target).scheme or target.startswith("#"):
            continue
        local = unquote(target.split("#")[0])
        link_count += 1
        if not (path.parent / local).exists():
            errors.append(f"{path.relative_to(root)}: missing {local}")

for path in sorted((root / "docs").rglob("*.svg")):
    try:
        ElementTree.parse(path)
    except ElementTree.ParseError as error:
        errors.append(f"{path.relative_to(root)}: invalid SVG: {error}")

current_spec = root / "specs/0017-repository-simplification.md"
if not current_spec.exists() or "状态：" not in current_spec.read_text():
    errors.append("SPEC-0017 must record an explicit status")

result = {
    "markdown_files": len(files),
    "local_links_checked": link_count,
    "errors": errors,
    "status": "passed" if not errors else "failed",
}
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(bool(errors))
