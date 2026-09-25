# DSH 源码研究与发布证据

日期：2026-09-25。任务：理解 DSH 的核心理念、运行链路与当前能力。交付为 [分析报告](../research/2026-09-25-dsh-source-analysis.md)及 [飞书阅读版](https://bytedance.larkoffice.com/docx/VAE4ddnnjoh0PPxBjAncjMDInHh)。本次只修改文档与新图源。

## 研究基线与方法

- 上游公开仓库：`deepseek-ai/deepseek-harness`，独立克隆于忽略目录 `data/dsh-source-analysis-20260925/upstream/`；分析时核对远端 master，固定 SHA 为 `477b4f420553e8a52c2fbccc464d7561b239c443`，根版本 `0.1.7-rc.2`。
- 读取架构与 Cordis 说明，并追踪 CLI/Profile 装配、Agent Loop、Session、工具策略、SDK 协议及能力 provider；能力启用状态结合 base、Web 覆盖与 standard Preset 判断。
- 代表性测试仅静态读取，包括请求重建、工具顺序、关闭刷新、调度恢复和语音草稿行为。未安装上游依赖、启动上游、执行测试或做线上质量评测。
- 重新读取本机已安装 rc.1 Schedule 文档，确认旧版活动会话限制与新版 Host 持久任务的区别。lumi 依赖仍为 rc.1，未修改 lockfile、Profile 或业务代码。
- `packages/*/*/package.json` 共 312 个，包含多类实现与测试支撑，不作为功能数量或成熟度评分。

## 文档与发布验收

| 检查 | 实际结果 |
| --- | --- |
| 源码链接 | 41 处、39 个不同 URL，全固定同一 SHA；文件存在，所引行号在范围内 |
| 草稿语法与体裁 | `docs +script parse` 返回 `assessment.status=passed`；识别 2 个 whiteboard、4 张表 |
| 飞书创建 | `ok=true`，revision 4，返回 2 个画板 token，无 warning |
| 全文读回 | 规范化正文与展开后的 Mermaid 源码共 7866 字符一致，全部链接一致 |
| 画板 | 两张实际预览分别为 228601 / 262201 字节 JPEG；已逐图查看，装配关系和执行链路可读 |
| 归属 | 节点 `RpbxwUVK1iGK3Ckw4ybcRyU3nve`，父节点为指定“个人助手” `CIACwItFgimTkrkM3B4cGAxznyf` |
| 本地文档检查 | `python3 scripts/check-docs.py` 退出 0：40 篇 Markdown、141 个本地链接，errors 为空；Git diff 空白检查通过 |

发布源 SHA-256：`dce3f0b7a40aad0cef53fe86eb5d5219d5a2c2018d51a918756f10eac7d78427`。草稿 SHA-256：`3cabd742e1f109dbcee12794f6a31588864866605c2a7f4164cc36734c8eb237`。

本机证据位于 `data/dsh-source-analysis-20260925/`：`source-validation.json`、`parse.json`、`create.json`、`fetch.json`、`wiki-node.json`、`verification.json`、两张预览及其下载回执。研究笔记、临时投影/核验脚本与上游克隆也留在该忽略目录，均不入库。按本次 lark-doc 工作流，已精确清理专属 `draft_38d53a48_folder/`，保留历史草稿。

预发布检查修正了 SVG 闭合标签和三处超出文件末尾的引用终止行号，修正后再生成与校验草稿；这些问题没有进入发布稿。

## 结论与未验证部分

源码支持五项设计结论：执行循环可插件化替换、接口与 provider 分离、按 Agent 划分作用域、由追加日志派生模型历史，以及围绕上下文成本设计工具和编排。

需要区分的边界：内部 Agent 控制面宽于公共 SDK；新版 Schedule 已有冷恢复但默认关闭且不保证外部副作用只执行一次；实验语音是录音后转写；插件管理不等同于 lumi 的自主验收与发布体系。

本次不构成 DSH 上游运行验收，不更新此前 23 个 lumi 测试的通过记录。未运行 `pnpm check`：没有代码或运行配置变更，按版本管理 SOP 使用文档检查。

## 交接、迁移与回滚

无需数据库迁移，无运行时版本变化。文档回滚可对本次独立提交执行可追踪的 revert；飞书已发布阅读版单独维护，Git 回滚不会删除远端文档。

接手时已有三张 `docs/design/assets/dsh-centered/` SVG 修改，本次未覆盖或暂存它们。发布索引与事实文档明确记录旧 v0.3 广义核心定位尚待修订，不把新讨论静默写成已实现架构。

后续开发候选是验证 lumi 的工具审批、取消和会话恢复桥接，并评估 rc.2 Schedule 的复用与迁移；它们不属于本次已完成实现。发布可复用步骤追加到 [SOP](../runbooks/design-publication.md)。
