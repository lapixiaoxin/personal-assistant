"""Publish one reviewed design source using the Lark draft workflow.

Requires prior authorization and skill/reference reading. Keeps receipts and
drafts so rerunning after a read failure cannot create a duplicate document.
"""

import hashlib
import json
import os
import runpy
import subprocess
import sys
from pathlib import Path
from xml.etree import ElementTree

ROOT_TOKEN = "DnYJwYk8iiijjykyqHqc4xAYnke"
ROOT_URL = "https://bytedance.larkoffice.com/wiki/" + ROOT_TOKEN
STATE_DIR = Path("data/design-publication-20260924")
STATE_DIR.mkdir(parents=True, exist_ok=True)
source = Path(sys.argv[1])
key = source.stem
receipt_path = STATE_DIR / (key + ".json")
environment = dict(os.environ, LARKSUITE_CLI_NO_UPDATE_NOTIFIER="1", LARKSUITE_CLI_NO_SKILLS_NOTIFIER="1")


def call(args, output):
    result = subprocess.run(["lark-cli", *args, "--as", "user", "--format", "json"],
                            capture_output=True, text=True, env=environment, check=False)
    output.write_text(result.stdout if result.returncode == 0 else result.stderr)
    if result.returncode != 0:
        raise RuntimeError(f"Lark command failed ({result.returncode}); inspect {output}")
    data = json.loads(result.stdout)
    if not data.get("ok"):
        raise RuntimeError(f"Lark returned failure; inspect {output}")
    return data


def normalized_text(xml):
    document = ElementTree.fromstring("<doc>" + xml + "</doc>")
    return "".join("".join(document.itertext()).split())


if receipt_path.exists():
    record = json.loads(receipt_path.read_text())
else:
    attempt_path = STATE_DIR / (key + "-create-attempt.json")
    if attempt_path.exists():
        raise RuntimeError("Previous create outcome may be unknown; reconcile the existing Wiki node before retrying.")
    decision = {
        "audience": "个人助手项目所有者与负责实现的 Agent",
        "reader_task": f"审阅 {source.stem} 的目标设计、边界和验收，确定后续 SDD 切片",
        "genre_contract": "workplace.technical_doc",
        "adapter": None,
        "presentation_mode": "normal",
        "visual_plan": {"reason": "专题精确契约及取舍使用表格和正文；概念架构图位于总纲并提供返回链接", "blocks": []},
    }
    draft_result = call(["docs", "+script", "--command", "init-draft",
                         "--presentation-decision", json.dumps(decision, ensure_ascii=False)],
                        STATE_DIR / (key + "-init.json"))
    draft = Path(draft_result["data"]["draft_path"])
    renderer = runpy.run_path("scripts/docs-to-lark.py")["render"]
    draft.write_text(renderer(source, {}, ROOT_URL, ""))
    parsed = call(["docs", "+script", "--command", "parse", "--content", "@./" + str(draft)],
                  STATE_DIR / (key + "-parse.json"))
    if parsed["data"]["assessment"]["status"] != "passed":
        raise RuntimeError(f"Draft profile failed: {draft}")
    attempt_path.write_text(json.dumps({"source": str(source), "draft": str(draft),
                                       "parent_token": ROOT_TOKEN}) + "\n")
    created = call(["docs", "+create", "--doc-format", "xml", "--content", "@./" + str(draft),
                    "--parent-token", ROOT_TOKEN], STATE_DIR / (key + "-create.json"))
    document = created["data"]["document"]
    record = {"source": source.as_posix(), "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
              "draft": str(draft), "document_id": document["document_id"],
              "url": document["url"], "created_revision": document["revision_id"]}
    receipt_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    if created["data"].get("warnings"):
        raise RuntimeError(f"Created with warnings; repair existing document {record['document_id']}")

fetched = call(["docs", "+fetch", "--doc", record["document_id"], "--detail", "full"],
               STATE_DIR / (key + "-fetch.json"))
document = fetched["data"]["document"]
expected = normalized_text(Path(record["draft"]).read_text())
actual = normalized_text(document["content"])
if record.get("navigation_verified"):
    mapping = json.loads((STATE_DIR / "url-map.json").read_text())
    for path in mapping:
        expected = expected.replace("（仓库：" + path + "）", "")
if expected != actual:
    raise RuntimeError(f"Readback text differs; inspect {key}-fetch.json and repair existing document")
record["verified_revision"] = document["revision_id"]
record["text_verified"] = True
record["text_characters_no_whitespace"] = len(actual)
receipt_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(record, ensure_ascii=False), flush=True)
