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
for directory in ["channels", "data", "deploy", "host", "plugins", "tests"]:
    files += sorted((root / directory).rglob("README.md"))
files = sorted(set(files))
errors = []
link_count = 0

for path in files:
    text = path.read_text()
    visible = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
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

for path in sorted((root / "specs").glob("*.md")):
    if "状态：" not in path.read_text():
        errors.append(f"{path.relative_to(root)} must record an explicit status")

result = {
    "markdown_files": len(files),
    "local_links_checked": link_count,
    "errors": errors,
    "status": "passed" if not errors else "failed",
}
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(bool(errors))
