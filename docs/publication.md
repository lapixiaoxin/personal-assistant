# 飞书设计与研究发布清单

发布日期：2026-09-24（v0.2 系列）、2026-09-25（DSH 专题 v0.3、DSH 源码研究）。设计为 Proposed 审阅版；源码研究为固定快照的静态分析。用户授权在“个人助手”下新建阅读文档；原始愿景与原工程方案未修改。

## DSH 源码研究 · rc.2

[看懂 DSH：核心理念、执行链路与当前能力](https://bytedance.larkoffice.com/docx/VAE4ddnnjoh0PPxBjAncjMDInHh)，本地源为 [源码分析](research/2026-09-25-dsh-source-analysis.md)。固定上游 `477b4f420553e8a52c2fbccc464d7561b239c443`，覆盖五个设计理念、装配与执行图、20 项能力、rc.1/rc.2 差异与 lumi 接入启示。

已读回 revision **4**，正文、41 处源码引用链接与 Mermaid 图源核验一致；一张 SVG 和一张 Mermaid 画板均下载并目视检查。节点 `RpbxwUVK1iGK3Ckw4ybcRyU3nve` 的父节点确为“个人助手”。源文件 SHA-256：`dce3f0b7a40aad0cef53fe86eb5d5219d5a2c2018d51a918756f10eac7d78427`。

证据见 [源码研究记录](evidence/2026-09-25-dsh-source-analysis.md)，本机回执与预览在 `data/dsh-source-analysis-20260925/`。lumi 未升级依赖，未运行上游测试。当前设计已将 DSH 限定为复杂任务主要 Harness，实时对话、感知和物理控制可有独立运行时。

## DSH 中心架构 · v0.3

最新专题：[lumi：以 DSH 为核心 Harness 的工程架构](https://bytedance.larkoffice.com/docx/ORmCdJYrkozaqoxLRHCc7ZocnFc)，本地源为 [10-dsh-centered-architecture](design/10-dsh-centered-architecture.md)。全文 revision **4**，包含五张 SVG 画板和一张 Mermaid 时序画板，已逐图导出并目视检查；正文及 Mermaid 源码与草稿一致。

新节点 `OAjGw2beri62HykYOAVcqc1KnCd` 的父节点已核验为“个人助手” `CIACwItFgimTkrkM3B4cGAxznyf`。本篇细化 DSH 职责、Cordis 插件接线、多端部署和技术选型；其余产品宪章、授权与验收原则沿用 v0.2。没有修改旧飞书专题或把设计标成运行时已启用。

证据见 [SPEC-0003](../specs/0003-dsh-centered-design/evidence.md)；本机回执、全文和六张预览保存在 `data/dsh-architecture-20260925/`。主设计源 SHA-256：`9b46917889c93df1485b8ca3e212e3e482dd286fc882aba8cf3c2b8748ff7c43`。图源位于 `docs/design/assets/dsh-centered/`。

## v0.2 系列与投影差异

投影差异（SPEC-0002/0003 及后续研究）：仓库的 `00-overview` 新增 lumi 命名、`08-sdd` 更新测试布局、`current-state` 追加整理、DSH 设计核验及 rc.2 源码发现；`02-architecture`、`07-roadmap` 同步了 v0.3 的 DSH / Cordis 职责。这五篇的旧飞书正文仍为下表所列 revision。最新 DSH 提案与源码事实见上方各篇，不能把旧投影当作最新工程事实；后续同步按差异局部更新。

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

本机证据位于 `data/design-publication-20260924/`：每篇创建回执、parse、fetch、源文件摘要、URL map。历史根目录 `draft_*_folder` 已在 [SPEC-0013](../specs/0013-repository-architecture-hygiene/spec.md) 中清理；后续草稿统一进入 `data/publication-drafts/` 并在读回后删除。总纲画板源在 [closed-loops.svg](design/assets/closed-loops.svg)。这些操作通过文档工具完成，不代表个人助手本身已实现飞书能力。

## 后续维护

仓库中的设计是事实源；飞书是审阅投影。修改先回写 spec/设计/ADR；读取飞书最新正文，局部更新已有文档并再次 fetch，不重复建节点覆盖旧意见。

发布辅助脚本仅适用于本次文档和目录：`scripts/docs-to-lark.py` 转换当前 Markdown 子集；`scripts/publish-design-doc.py` 保存回执；`scripts/link-design-doc.py` 补齐已有发布链接。它们不取代技能规定的阅读、创作审查或用户授权。操作与局限见 [文档发布 SOP](runbooks/design-publication.md)。

本地文档链接与规格追溯检查使用 `python3 scripts/check-docs.py`；最终执行结果见本次验证记录。该检查不是已配置的 CI 发布门禁。
