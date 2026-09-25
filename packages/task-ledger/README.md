# @lumi/task-ledger

`@lumi/task-ledger` 是 v0.1 Task、Action 与 Recovery 持久状态的唯一拥有者。它使用一个 SQLite 连接和一个 `SqliteTaskLedger` 实例，保证跨对象状态、事件与授权消费在同一个 `BEGIN IMMEDIATE` 事务中提交。

## 文件职责

| 文件 | 责任 |
| --- | --- |
| `src/index.ts` | 根公开入口、`SqliteTaskLedger` 与跨领域事务编排 |
| `src/types.ts` | 公开 port/input 及内部 SQLite row 类型 |
| `src/errors.ts` | 稳定的 ledger 错误类型 |
| `src/migrations.ts` | v1→v2→v3 expand migration |
| `src/mappers.ts` | SQLite row 到 contract 的校验映射与动作摘要 |

包外只从 `@lumi/task-ledger` 根入口导入。不得直接引用 row、mapper 或 migration；Gateway、CLI 和 Workbench 不直接访问这些表。

当前数据库 `PRAGMA user_version=3`。Personal Memory 与 Reminders 使用各自 migration 表，不修改这个版本。拆文件不等于拆事务：除非出现独立部署、安全域或扩缩需求，不把 Task、Action、Recovery 拆为多个连接或包。

验证：

```bash
pnpm exec vitest run packages/task-ledger/tests/index.test.ts
pnpm exec vitest run packages/action-runtime/tests/index.test.ts
pnpm exec vitest run packages/task-recovery/tests/index.test.ts
```
