# 架构决策记录

ADR-001/002 于 2026-09-24 提出，ADR-003 于 2026-09-25 细化 DSH 中心架构，仍是长期 Proposed 设计。ADR-004 记录已由 v0.1 实现和验收支持的 Host 数据所有权与模块边界。ADR-005 于 2026-09-26 提出 DSH 原生插件定制候选路线，尚未取代现行边界。Accepted 只覆盖对应记录的明确范围，不表示长期设计已全部实现。

| ID | 决定 | 细节 |
| --- | --- | --- |
| ADR-001 | 模块化单体与独立个人控制层 | [边界决策](0001-control-and-plugins.md) |
| ADR-002 | 强制动作出口与分离的进化发布 | [安全及进化决策](0002-actions-and-evolution.md) |
| ADR-003 | DSH 核心 Harness、Cordis 接线与持久 Host | [DSH 边界细化](0003-dsh-centered-harness.md) |
| ADR-004 | v0.1 Host 数据所有权与模块边界 | [已实现边界](0004-host-ownership-and-module-boundaries.md) |
| ADR-005 | 外部 bundle、原生 Web 与 Host 内 lumi 服务 | [原生定制候选路线](0005-dsh-native-customization.md) |

新增 ADR 保持编号稳定。被替代的记录写 Superseded 并链接后继；不删除历史。
