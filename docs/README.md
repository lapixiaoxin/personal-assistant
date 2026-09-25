# lumi 文档与开发导航

本目录区分已观察事实、待审设计和已验证操作。面向用户的发布索引见 [飞书方案](publication.md)。

| 任务 | 入口 |
| --- | --- |
| 十分钟掌握长期方向 | [总纲](design/00-overview.md) |
| 查看 DSH 核心架构与多端流程 | [v0.3 六图方案](design/10-dsh-centered-architecture.md)、[ADR-003](adr/0003-dsh-centered-harness.md)、[SPEC-0003](../specs/0003-dsh-centered-design/spec.md) |
| 检查当前真实能力 | [工程事实基线](current-state.md) |
| 理解产品与个人模型 | [产品宪章](design/01-product.md)、[记忆与主动性](design/04-personal-model.md) |
| 实现或接入新能力 | [架构](design/02-architecture.md)、[协议](design/03-protocols.md)、[安全](design/05-safety.md) |
| 建设自我升级 | [进化工厂](design/06-evolution.md)、[里程碑](design/07-roadmap.md) |
| Agent 开始工作 | [AGENTS](../AGENTS.md)、[SDD](design/08-sdd.md)、[模板](templates/README.md) |
| 工程命名与测试布局 | [SPEC-0002](../specs/0002-lumi-workspace/spec.md)、[测试约定](../tests/README.md) |
| 选择下一开发切片 | [首个 M1 规范](../specs/0001-action-boundary/spec.md) |
| 理解关键取舍 | [ADR](adr/README.md) |
| 运行和验证 | [SOP](runbooks/README.md)、[评测](design/09-evaluation.md)、[本次证据](evidence/2026-09-24-design-baseline.md) |
| 升级 DSH | [现有上游策略](upstream-strategy.md) |

设计 v0.2 与 DSH 专题 v0.3 状态均为 Proposed；首个 SDD 包为 Specified / 待审，尚未实现。DSH 职责、插件装配和多端技术路线以 v0.3 及 ADR-003 为最新提案，产品与验收原则继续沿用。数量阈值是首轮建议，不能当作已测成绩或既有授权。

规范和设计源文件保存在仓库，飞书承载审阅版。收到审阅意见后先更新 spec/ADR，再更新对应飞书文档；发生冲突时记录差异，不让两份设计静默分叉。验证记录追加，不覆盖失败历史。
