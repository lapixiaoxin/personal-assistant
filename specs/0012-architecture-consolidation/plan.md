# SPEC-0012 实现计划

状态：Done · 对应 spec v0.1。

## 边界

- `packages/contracts` 仍是领域协议唯一包，`src/index.ts` 只作公开 barrel。
- `packages/task-ledger` 仍是 Task/Action/Recovery SQLite 状态和跨对象事务的唯一拥有者。
- `SqliteTaskLedger` 保留单一数据库连接、时钟和事务入口；不会把跨领域写入改成多个 store 协调。
- `apps/runtime`、Gateway、CLI、Workbench、DSH adapter 和其他包不修改 import 或运行接线。

## 文件组织

`packages/contracts/src/`：

- `common.ts`：JSON、identifier、timestamp、principal 和 ID helper。
- `task.ts`：Task、Capability、Event、Audit、Approval。
- `recovery.ts`：Recovery。
- `reminder.ts`：Reminder 与 Notification。
- `action.ts`：Action、Authorization、Receipt、Verification。
- `index.ts`：保持原公开导出面。

`packages/task-ledger/src/`：

- `types.ts`：公开 port/input 与内部 row 类型。
- `errors.ts`：公开错误。
- `mappers.ts`：SQLite row → contract 与 Action digest 纯函数。
- `migrations.ts`：v1→v2→v3 migration。
- `index.ts`：保持原公开导出面，并保留单一 `SqliteTaskLedger` 实现类与事务编排。

## 数据与兼容

不修改 SQL、表、索引、`PRAGMA user_version`、migration history 名称或执行顺序。迁移函数接收现有 `DatabaseSync`、`now` 与 transaction callback，由同一 ledger 构造函数调用。根 package export 与 `tsconfig` path 不变，禁止新增 package subpath export。

## 安全

本切片不读取动作正文、记忆正文、运行数据库或凭据。Git 暂存使用精确路径，排除用户 SVG 与 `data/`。运行中的 4310/4313 服务只做存活复核，不重启、不修改其数据。

## 切片

1. 清理已合并的干净 worktree 与分支。
2. 建立 spec/ADR，校正设计和事实文档。
3. 先拆 contracts 并执行类型/单测。
4. 再拆 task-ledger 的类型、错误、映射与 migration，保持实现类和事务。
5. 增加包 README，运行聚焦测试、docs checker 和完整门禁。
6. 记录 evidence，精确暂存并提交 `main`。

## 验证与回滚

- 静态：根入口导出、依赖方向、源码行数与 Git diff。
- 聚焦：contracts、task-ledger、action-runtime、task-recovery。
- 完整：Node 22.19.0 / pnpm 10.20.0 下 `pnpm check` 与 docs checker。
- 运行状态：提交前后确认 4310/4313 仍监听，用户 SVG 仍为未暂存修改。

源码回滚恢复原两个 `index.ts` 与删除新增模块文件即可。文档回滚不影响运行；worktree 内容已在 `main`，如确需恢复可从对应历史提交重新创建，不恢复已删除本地分支。
