# lumi 文档与开发导航

本目录区分已观察事实、待审设计和已验证操作。面向用户的发布索引见 [飞书方案](publication.md)。

| 任务 | 入口 |
| --- | --- |
| 十分钟掌握长期方向 | [总纲](design/00-overview.md) |
| 查看 DSH 核心架构与多端流程 | [v0.3 六图方案](design/10-dsh-centered-architecture.md)、[ADR-003](adr/0003-dsh-centered-harness.md)、[SPEC-0003](../specs/0003-dsh-centered-design/spec.md) |
| 理解 DSH 当前源码与能力 | [rc.2 源码分析](research/2026-09-25-dsh-source-analysis.md)：插件理念、执行链路、能力开关、与 lumi 固定 rc.1 的差异 |
| 检查当前真实能力 | [工程事实基线](current-state.md) |
| 使用电脑端任务与动作工作台 | [Workbench SOP](runbooks/web-workbench.md)、[SPEC-0004](../specs/0004-web-workbench/spec.md)、[SPEC-0006](../specs/0006-action-inbox/spec.md) |
| 验证 DSH 受控动作与旁路阻断 | [Action Bridge SOP](runbooks/dsh-action-bridge.md)、[SPEC-0005](../specs/0005-dsh-action-bridge/spec.md) |
| 使用受控公开来源生成研究简报 | [研究简报 SOP](runbooks/research-brief.md)、[SPEC-0007](../specs/0007-research-brief/spec.md) |
| 使用结构化上下文生成会议准备简报 | [会议准备 SOP](runbooks/meeting-brief.md)、[SPEC-0008](../specs/0008-meeting-brief/spec.md) |
| 理解产品与个人模型 | [产品宪章](design/01-product.md)、[记忆与主动性](design/04-personal-model.md) |
| 实现或接入新能力 | [架构](design/02-architecture.md)、[协议](design/03-protocols.md)、[安全](design/05-safety.md) |
| 建设自我升级 | [进化工厂](design/06-evolution.md)、[里程碑](design/07-roadmap.md) |
| Agent 开始工作 | [AGENTS](../AGENTS.md)、[SDD](design/08-sdd.md)、[模板](templates/README.md) |
| 工程命名与测试布局 | [SPEC-0002](../specs/0002-lumi-workspace/spec.md)、[测试约定](../tests/README.md) |
| 查看可信动作闭环 | [SPEC-0001](../specs/0001-action-boundary/spec.md)、[动作门禁 SOP](runbooks/action-boundary.md) |
| 理解关键取舍 | [ADR](adr/README.md) |
| 运行和验证 | [SOP](runbooks/README.md)、[评测](design/09-evaluation.md)、[本次证据](evidence/2026-09-24-design-baseline.md) |
| 升级 DSH | [现有上游策略](upstream-strategy.md) |

设计 v0.2 与 DSH 专题 v0.3 状态均为 Proposed；SPEC-0001 已完成 Host 内 `artifact.write`，SPEC-0005 已将 `personal-assistant` 的固定 rc.1 profile 接到同一 Broker。DSH 职责、插件装配和多端技术路线以 v0.3 及 ADR-003 为最新提案，产品与验收原则继续沿用。数量阈值是首轮建议，不能当作已测成绩或既有授权。

后续讨论与源码分析将 DSH 的适用范围明确为“复杂任务的主要 Harness”；实时对话、感知和物理控制可使用独立运行时。v0.3 中较宽的核心定位尚待对应设计修订。源码报告同时补充 rc.2 调度器变化，不代表 lumi 已升级或新能力已启用。

规范和设计源文件保存在仓库，飞书承载审阅版。收到审阅意见后先更新 spec/ADR，再更新对应飞书文档；发生冲突时记录差异，不让两份设计静默分叉。验证记录追加，不覆盖失败历史。
