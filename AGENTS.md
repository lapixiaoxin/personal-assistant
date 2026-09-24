# Agent 工作入口

本仓建设一个最懂用户、能交付结果、可持续进化的个人助手。先读事实，再读方案；方案存在不等于能力已启用。

## 接手顺序

1. 阅读 [README](README.md)、[工程事实](docs/current-state.md)、[文档索引](docs/README.md)。
2. 查看 `git status --short`、当前分支、相关源码和测试；不要覆盖用户改动。
3. 阅读对应 `specs/<id>/`；首次建设从 [0001](specs/0001-action-boundary/spec.md) 开始。
4. 涉及边界变化时读 [架构](docs/design/02-architecture.md)、[协议](docs/design/03-protocols.md)、[安全](docs/design/05-safety.md) 和 [ADR](docs/adr/README.md)。
5. 使用 [SDD 流程](docs/design/08-sdd.md)、[模板](docs/templates/README.md) 和 [SOP](docs/runbooks/README.md) 完成交付及交接。

## 当前状态与授权

2026-09-24：MVP 已有 CLI/HTTP、SQLite 任务账本、DSH adapter 和基础审批。长期设计是 Proposed v0.2；动作门禁、持久运行恢复、自动记忆和自主发布尚未实现。

设计轮已完成方案、文档、现状验证及飞书发布。2026-09-24 用户进一步明确：版本管理交给 Agent 托管，可以直接将修改提交到当前仓库的 main 分支。具体开发仍以用户任务为准；已有明确范围内持续推进，常规可逆步骤无需反复确认。

主分支为 `main`，初始 MVP 与设计基线提交为 `1cd54cc`。历史文档中的“无初始 commit”描述首次采集时状态。

## 版本管理标准（已按用户指令生效）

- Agent 完成已授权工作及必要验证后，主动提交到本地 `main`，不再逐次请求提交许可。
- 常规变更直接在 main 形成小而完整的提交；复杂或并行工作可用临时分支/worktree 隔离，验证后由 Agent 集成回 main。
- 提交前检查差异、必要验证和暂存范围；只提交该任务相关内容，保护用户其他未提交改动。
- 提交信息说明具体目的，关联 spec 时包含编号；交付报告提供 commit、验证结果和未完成项。
- 私人数据、密钥、运行数据库、缓存、构建产物及发布草稿不入库。提交失败先诊断，不绕过检查或改写历史。
- 本地提交与远端 push、部署分别记录；后两者按具体目标和授权执行。

重复操作见 [版本管理 SOP](docs/runbooks/version-control.md)。

## 不变量

- 个人身份、目标、记忆、授权、证据不归属于某个模型或 DSH 会话。
- CLI、HTTP、后续 IM/A2A 都进入同一控制层；入口不复制业务审批。
- 外部 SDK 留在 adapter；业务能力使用独立模块或插件，避免 Core 累积场景分支。
- “一切可替换”不表示插件可以绕过授权、审计、验收和发布控制。
- 完成须满足验收；执行者自报、HTTP 200、模型结束生成不能替代实际结果证据。
- 未知副作用先对账；重试不得扩大授权、预算或重复发送。
- 敏感数据、凭据、完整私人上下文不进入日志、fixture、SOP 或提交。
- 未验证功能标明状态；不能通过删测试、降低标准或改报告使任务“完成”。

## 开发与验证

Node >=22.19.0，pnpm 10.20.0。优先查版本，再执行相关验证；完整门禁为 `pnpm check`。默认 executor 为 DSH，离线验证必须显式 `PA_EXECUTOR=mock` 并使用独立数据库。

[本机基线 SOP](docs/runbooks/local-validation.md) 包含已成功执行的环境修正和 CLI 流程。真实服务验证使用 [live 规程](docs/runbooks/live-acceptance.md)，不将 mock 结果标为 live。

新能力、协议、权限或持久化变更使用完整 spec/plan/tasks/checklist/evidence。小型文档修正可简化，避免为流程而堆空文件。规格变更先更新影响分析；编写代码后同步事实文档。

## 完成与交接

交付必须说明改了什么、证据、未验证部分、迁移/回滚和下一步。成功操作形成带版本、适用条件和证据的 SOP；一次成功只标 `verified_once`，不要推广为跨环境可靠性保证。

发布权与开发权分开。Agent 可准备完整可审阅产物；发布遵循具体授权和政策。后续自主进化机制不得自行修改本文件中的控制原则、受保护验收或授权根。
