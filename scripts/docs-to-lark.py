"""Render this repository's design Markdown subset to Lark XML.

This is a publication helper, not a general Markdown parser. It never writes to
Lark. Run the documented draft check and create/update workflow separately.
"""

import argparse
import html
import json
import re
from pathlib import Path
from xml.etree import ElementTree


def render(source, mapping, root_url, board):
    source = Path(source).resolve()
    lines = source.read_text().splitlines()
    root = Path.cwd().resolve()

    def inline(text):
        pattern = r"\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*"
        result, cursor = [], 0
        for match in re.finditer(pattern, text):
            result.append(html.escape(text[cursor:match.start()]))
            if match[1] is not None:
                label, target = match[1], match[2]
                if target.startswith(("https://", "http://")):
                    url = target
                else:
                    path = (source.parent / target.split("#")[0]).resolve()
                    relative = path.relative_to(root).as_posix()
                    url = mapping.get(relative)
                    if url is None:
                        result.append(html.escape(f"{label}（仓库：{relative}）"))
                        cursor = match.end()
                        continue
                result.append(f'<a href="{html.escape(url, quote=True)}">{html.escape(label)}</a>')
            elif match[3] is not None:
                result.append(html.escape(match[3]))
            else:
                result.append(f"<b>{html.escape(match[4])}</b>")
            cursor = match.end()
        result.append(html.escape(text[cursor:]))
        return "".join(result)

    out = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        if line.startswith("# "):
            out.append(f"<title>{inline(line[2:])}</title>")
            if root_url:
                out.append(f'<p><a href="{html.escape(root_url, quote=True)}">返回长期方案总纲与专题导航</a></p>')
            out.append(f"<p>审阅版源文件：{html.escape(source.relative_to(root).as_posix())}。版本 v0.2，2026-09-24；设计未自动转为已实现能力。</p>")
            index += 1
            continue
        heading = re.match(r"(#{2,6}) (.+)", line)
        if heading:
            level = len(heading[1]) - 1
            out.append(f'<h{level} seq="auto">{inline(heading[2])}</h{level}>')
            if board and heading[2] == "两条闭环，一份个人资产":
                out.append(f'<whiteboard type="svg" path="@./{html.escape(board, quote=True)}"></whiteboard>')
            index += 1
            continue
        if line.startswith("```"):
            lang = line[3:].strip() or "text"
            code = []
            index += 1
            while index < len(lines) and not lines[index].startswith("```"):
                code.append(lines[index])
                index += 1
            if index == len(lines):
                raise ValueError(f"Unclosed code fence: {source}")
            # Keep architecture source as an explicit formal diagram definition.
            # The overview carries the rendered conceptual whiteboard.
            caption = ' caption="架构关系定义；直观闭环图见总纲"' if lang == "mermaid" else ""
            out.append(f'<pre lang="{html.escape(lang)}"{caption}><code>{html.escape(chr(10).join(code))}</code></pre>')
            index += 1
            continue
        if line.startswith("|"):
            rows = []
            while index < len(lines) and lines[index].startswith("|"):
                cells = lines[index].strip().strip("|").split("|")
                if not all(re.fullmatch(r"\s*:?-+:?\s*", c) for c in cells):
                    rows.append(cells)
                index += 1
            width = len(rows[0])
            if any(len(row) != width for row in rows):
                raise ValueError(f"Table width mismatch: {source}")
            header = "".join(f'<th background-color="light-gray"><p>{inline(c.strip())}</p></th>' for c in rows[0])
            body = "".join("<tr>" + "".join(f"<td><p>{inline(c.strip())}</p></td>" for c in row) + "</tr>" for row in rows[1:])
            out.append(f"<table><thead><tr>{header}</tr></thead><tbody>{body}</tbody></table>")
            continue
        item = re.match(r"(- |\d+\. )(.+)", line)
        if item:
            ordered = item[1] != "- "
            tag = "ol" if ordered else "ul"
            items = []
            while index < len(lines):
                current = re.match(r"(- |\d+\. )(.+)", lines[index])
                if not current or (current[1] != "- ") != ordered:
                    break
                items.append(f"<li>{inline(current[2])}</li>")
                index += 1
            out.append(f"<{tag}>" + "".join(items) + f"</{tag}>")
            continue
        paragraph = []
        while index < len(lines) and lines[index].strip():
            if paragraph and re.match(r"^(#|```|\||- |\d+\. )", lines[index]):
                break
            paragraph.append(lines[index])
            index += 1
        out.append("<p>" + inline(" ".join(paragraph)) + "</p>")
    xml = "\n".join(out) + "\n"
    ElementTree.fromstring("<doc>" + xml + "</doc>")
    return xml


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("draft")
    parser.add_argument("--map")
    parser.add_argument("--root-url", default="")
    parser.add_argument("--board", default="")
    args = parser.parse_args()
    mapping = json.loads(Path(args.map).read_text()) if args.map else {}
    destination = Path(args.draft)
    if not (destination.parent / ".presentation-decision.json").exists():
        raise SystemExit("Initialize this draft with lark-cli docs +script first.")
    if destination.exists():
        raise SystemExit("Draft already exists; inspect and patch it instead of overwriting.")
    destination.write_text(render(args.source, mapping, args.root_url, args.board))
    print(json.dumps({"source": args.source, "draft": str(destination), "xml_characters": len(destination.read_text())}))
