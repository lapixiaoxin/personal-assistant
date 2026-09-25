# ADR-004：v0.1 Host 数据所有权与模块边界

状态：Accepted · 2026-09-25。决策者：项目所有者授权 lumi Agent 按既有方向自主维护。关联：[SPEC-0012](../../specs/0012-architecture-consolidation/spec.md)、[MVP 验收](../evidence/2026-09-25-mvp-acceptance.md)。这是已实现 v0.1 边界的记录，不代表 ADR-001/003 中全部长期设计已完成。

## 背景与硬约束

v0.1 已形成可运行的模块化单体：入口统一装配 Assistant Core，复杂任务交给 DSH，Host 持有 Task、Action、Memory、Recovery、Reminder 和本地 Notification。近期仍是单 owner、单权威本机进程和 SQLite；分布式控制、多设备授权与外部通知尚未实现。

MVP 迭代使 `packages/task-ledger/src/index.ts` 同时承担公开端口、迁移、行映射和领域方法。需要降低单文件复杂度，但 Action、Recovery 与 Task 的状态更新存在同事务要求，不能为目录整齐拆散数据所有权。

## 备选

1. 按表拆为多个包或数据库：文件短，但跨对象状态更新失去本地原子事务，当前没有独立部署需求。
2. 保持所有实现位于单个入口文件：改动最少，但职责边界难审查，迁移和公开 API 容易混杂。
3. 保持包和单实现类，按协议、错误、迁移、映射和领域契约拆内部文件：降低维护成本，同时保留一个事务拥有者。

## 决定

采用 3，并固定以下 v0.1 所有权：

- `packages/contracts` 拥有版本化领域 Schema 和类型；根入口是唯一公开 import 面，内部按 task、action、recovery、reminder 划分。
- `packages/task-ledger` 拥有 Task、Event、Approval、Audit、Action、Authorization、Receipt、Verification 和 Recovery 的 SQLite 表及跨对象事务。
- `packages/personal-memory` 独立拥有 Memory 表与迁移；只通过受控检索结果向任务提供上下文。
- `packages/reminders` 独立拥有 Reminder、Notification 和调度事务；一次性触发与本地收件箱在当前阶段不拆包。
- `packages/task-recovery` 负责恢复判定和编排，不直接拥有 Ledger 表。
- `packages/action-runtime` 负责动作服务、provider 端口、调用和读回核验；具体 provider 位于 `adapters/*`，持久状态仍经 Task Ledger。
- `apps/runtime` 只作 composition root，不成为业务数据拥有者。

文件拆分不产生新的 package subpath API。`SqliteTaskLedger` 保留一个连接、一个时钟和 `BEGIN IMMEDIATE` 事务入口；Task/Action/Recovery 只有出现独立部署、不同安全域或不同扩缩需求时，才另立 ADR 讨论拆进程。

## 后果与兼容

消费者继续从 `@lumi/contracts` 和 `@lumi/task-ledger` 根入口导入，不需要迁移。数据库保持 `user_version=3`，没有新表、回填或回滚数据。内部文件可以继续细化，但禁止让 Gateway、CLI 或其他包绕过公开端口直接引用 row/migration 实现。

这种决定保留一个较大的 SQLite 实现类；相比引入 repository 间事务协调，这是当前单机 MVP 更低风险的代价。`packages/reminders` 同时包含 timer 与通知存储是刻意选择，不是遗漏未来 scheduler/notification 拆分。

## 验证与撤销条件

验证要求：根导出兼容、v1→v2→v3 迁移、并发一次性授权、Action 不确定结果、Recovery 重试/对账和完整仓库门禁保持通过。文档必须同时列出已实现范围和长期缺口。

当出现不可信执行隔离、独立 scheduler 进程、多写入节点、远程 worker 或不同数据驻留要求时，重新评估包/进程边界；以新 ADR 替代，不在本记录中追溯改义。
