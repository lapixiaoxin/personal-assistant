"""Replace published repository references with verified series links."""

import html
import json
import re
import subprocess
import sys
from pathlib import Path
from xml.etree import ElementTree

state = Path("data/design-publication-20260924")
key = sys.argv[1]
mapping = json.loads((state / "url-map.json").read_text())
record_path = state / (key + ".json")
record = json.loads(record_path.read_text())


def call(args, suffix):
    result = subprocess.run(["lark-cli", "docs", *args, "--as", "user", "--format", "json"],
                            capture_output=True, text=True, check=False)
    (state / f"{key}-{suffix}.json").write_text(result.stdout or result.stderr)
    if result.returncode:
        raise RuntimeError(f"Command failed: {key}-{suffix}.json")
    data = json.loads(result.stdout)
    if not data.get("ok") or data.get("data", {}).get("warnings"):
        raise RuntimeError(f"Check response: {key}-{suffix}.json")
    return data["data"]


fetched = call(["+fetch", "--doc", record["document_id"], "--detail", "full"], "before-links")
xml = fetched["document"]["content"]
root = ElementTree.fromstring("<doc>" + xml + "</doc>")
patches = []
for block in root:
    if "（仓库：" not in "".join(block.itertext()):
        continue
    block_xml = ElementTree.tostring(block, encoding="unicode")
    updated = block_xml
    for path, url in mapping.items():
        pattern = r"([^<>]*?)（仓库：" + re.escape(path) + r"）"
        updated = re.sub(pattern, lambda match, target=url: f'<a href="{html.escape(target, quote=True)}">{match[1]}</a>', updated)
    if updated == block_xml:
        continue
    if not block.get("id"):
        raise RuntimeError("Target has no direct block ID; use a narrower manual patch")
    cleaned = ElementTree.fromstring(updated)
    for element in cleaned.iter():
        for attr in ("id", "seq-marker"):
            element.attrib.pop(attr, None)
    patches.append((block.get("id"), ElementTree.tostring(cleaned, encoding="unicode")))

for number, (block_id, content) in enumerate(patches):
    patch_path = state / f"{key}-links-{number}.xml"
    patch_path.write_text(content)
    call(["+update", "--doc", record["document_id"], "--command", "block_replace",
          "--block-id", block_id, "--content", "@./" + str(patch_path), "--doc-format", "xml"],
         f"links-{number}")

final = call(["+fetch", "--doc", record["document_id"], "--detail", "full"], "fetch")
final_xml = final["document"]["content"]
for path in mapping:
    if "（仓库：" + path + "）" in final_xml:
        raise RuntimeError(f"Unlinked published reference: {path}")
before_text = "".join(root.itertext())
for path in mapping:
    before_text = before_text.replace("（仓库：" + path + "）", "")
after_text = "".join(ElementTree.fromstring("<doc>" + final_xml + "</doc>").itertext())
if "".join(before_text.split()) != "".join(after_text.split()):
    raise RuntimeError("Unexpected text change during navigation patch")
record["verified_revision"] = final["document"]["revision_id"]
record["navigation_verified"] = True
record["text_verified"] = True
record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"source": record["source"], "patched_blocks": len(patches),
                  "verified_revision": record["verified_revision"]}, ensure_ascii=False))
