# 飞书设计发布清单

发布日期：2026-09-24。状态：已发布审阅版 v0.2，方案本身为 Proposed。用户授权在“个人助手”下新建方案子文档；原始愿景与原工程方案未修改。

入口：[超级个人助手：长期设计总纲](https://bytedance.larkoffice.com/wiki/DnYJwYk8iiijjykyqHqc4xAYnke)。

总纲位于用户指定的 [个人助手](https://bytedance.larkoffice.com/wiki/CIACwItFgimTkrkM3B4cGAxznyf) 节点下。以下 10 篇均为总纲的直接子节点，已核验 `has_more=false`、parent_node_token 与 obj_token。

| 本地设计源 | 飞书审阅版 | 已读回 revision |
| --- | --- | --- |
| [00-overview](design/00-overview.md) | [长期设计总纲](https://bytedance.larkoffice.com/wiki/DnYJwYk8iiijjykyqHqc4xAYnke) | 5 |
| [01-product](design/01-product.md) | [产品宪章与体验](https://bytedance.larkoffice.com/wiki/TSCpwWZF1i5k9Vk8a3Sc6sIznlc) | 3 |
| [02-architecture](design/02-architecture.md) | [系统架构与插件机制](https://bytedance.larkoffice.com/wiki/VEWUwNfKkiyRkakAYzKcZRIUn1g) | 4 |
| [03-protocols](design/03-protocols.md) | [领域协议与兼容](https://bytedance.larkoffice.com/wiki/H1wCwYIZWicTL2kmSCBcP4uNnCe) | 3 |
| [04-personal-model](design/04-personal-model.md) | [个人模型、记忆与主动性](https://bytedance.larkoffice.com/wiki/KnB9w2TFyiPPB0kcPAuckYODnDd) | 3 |
| [05-safety](design/05-safety.md) | [安全、授权与数据主权](https://bytedance.larkoffice.com/wiki/AXOGwel6riy8Tgk7FUDc6JQan7d) | 3 |
| [06-evolution](design/06-evolution.md) | [自主进化与软件工厂](https://bytedance.larkoffice.com/wiki/HLdFw6mCpi9Zv9kPV9scj0n9nqe) | 3 |
| [07-roadmap](design/07-roadmap.md) | [能力演进与里程碑](https://bytedance.larkoffice.com/wiki/TZG5wTrHHiV9VtkXRgZcsbfqnCd) | 3 |
| [08-sdd](design/08-sdd.md) | [SDD 与工程治理](https://bytedance.larkoffice.com/wiki/O8vdwkRCSinYuAkN3decZqkDn9e) | 6 |
| [09-evaluation](design/09-evaluation.md) | [评测与真实验收](https://bytedance.larkoffice.com/wiki/OtCCwj9t9icgTOkRwCrcCv33nEg) | 4 |
| [current-state](current-state.md) | [工程事实基线](https://bytedance.larkoffice.com/wiki/ToilwRbJOiQicrk40Jicqwvvnln) | 4 |

## 内容与证据

初次发布的 11 篇均经 init-draft → XML → parse（assessment=passed）→ create → 全文 fetch。10 篇专题正文与草稿的规范化文本相等；总纲和架构的导航替换后再次读回，只改变链接表示，不改变设计正文。总纲图已导出 JPEG 人工目视核验，标签和闭环可读，没有空白画板。

2026-09-24 后续更新：用户明确授权 Agent 主动提交 main。初始基线 `1cd54cc` 建立后，对总纲、SDD、评测和工程基线共 6 个段落做局部替换；每次写后读回，规范化正文差异与计划替换完全一致，未改其他正文和画板。最新 revision 如上；回执为本机证据目录中的 `*-main-update-*.json`。

每篇保留源文件路径、版本、日期和能力状态。已发布专题提供返回总纲链接；总纲文档地图可点击进入各篇。仅在工程内交付的 AGENTS、模板、spec、SOP 保留仓库相对路径说明，不伪造无法打开的网页链接。

本机证据位于 `data/design-publication-20260924/`：每篇创建回执、parse、fetch、源文件摘要、URL map。草稿保留在 `draft_*_folder/` 并加入 Git ignore；总纲画板源在 [closed-loops.svg](design/assets/closed-loops.svg)。这些操作通过文档工具完成，不代表个人助手本身已实现飞书能力。

## 后续维护

仓库中的设计是事实源；飞书是审阅投影。修改先回写 spec/设计/ADR；读取飞书最新正文，局部更新已有文档并再次 fetch，不重复建节点覆盖旧意见。

发布辅助脚本仅适用于本次文档和目录：`scripts/docs-to-lark.py` 转换当前 Markdown 子集；`scripts/publish-design-doc.py` 保存回执；`scripts/link-design-doc.py` 补齐已有发布链接。它们不取代技能规定的阅读、创作审查或用户授权。操作与局限见 [文档发布 SOP](runbooks/design-publication.md)。

本地文档链接与规格追溯检查使用 `python3 scripts/check-docs.py`；最终执行结果见本次验证记录。该检查不是已配置的 CI 发布门禁。
