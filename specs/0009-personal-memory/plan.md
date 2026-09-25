# SPEC-0009 实现计划

状态：Complete。对应 `spec.md` v0.1。

## 边界

- `packages/personal-memory`：拥有 schema、状态机、SQLite store、检索、prompt data block 和 executor decorator。
- `apps/runtime`：使用同一 database path 装配 Task Ledger 与 memory store，将 memory decorator 放在领域 verifier 之前。
- `apps/gateway`、`apps/local-runner`、`apps/workbench`：提供认证入口与用户控制面，不直接访问 SQLite。
- `packages/contracts`：只增加通用任务事件枚举；memory 的领域 schema 留在拥有者包。

依赖方向是 Entry → `PersonalMemoryService`，以及 `MemoryContextExecutor` → `TaskExecutor`。Assistant Core、Task Ledger 和 DSH adapter 不依赖 personal-memory。memory store 不读写 tasks/actions 表，也不改变 Task Ledger `PRAGMA user_version`。

## 协议和状态

Service 使用认证后的 `Principal`：

- `create(principal, input)`
- `get(principal, memoryId)`
- `list(principal, query)`
- `confirm(principal, memoryId)`
- `correct(principal, memoryId, patch)`
- `retract(principal, memoryId)`
- `forget(principal, memoryId)`
- `retrieve(ownerId, purpose, limit/budget)`

状态规则：

- create → candidate 或 confirmed
- candidate → confirmed
- candidate/confirmed → corrected confirmed revision
- candidate/confirmed → retracted
- any existing → forgotten tombstone
- retracted 不可 confirm/correct；forget 仍允许

不存在、跨 owner 和已遗忘 ID 统一抛 `MemoryNotFoundError`。非法状态抛 `MemoryStateConflictError`。创建新记录使用随机 ID；tombstone ID 永不复用。

## 数据与兼容

`personal_memories` 保存当前 revision；`personal_memory_tombstones` 保存最小删除元数据；`personal_memory_migrations` 保存模块内 schema 版本。三张表名称均由 personal-memory 拥有，不与 Task Ledger migration history 混用。

使用 node:sqlite、WAL、foreign keys 和 5 秒 busy timeout。memory migration 只执行 `CREATE TABLE/INDEX IF NOT EXISTS` 并记录 version 1。旧内存实现保留兼容导出，但 runtime 默认改用 SQLite。

现有数据库启动时增表，无 Task/Action 数据 backfill。回滚代码不会删除表；旧版本会忽略这些表。彻底回滚数据需先导出用户需要保留的记忆，再只删除该模块拥有的三张表。

## 安全

- ownerId 仅来自认证 principal；请求 schema 不含 ownerId。
- `get/update/delete` 查询同时带 `id AND owner_id`，防止存在性泄露。
- 自动注入只允许 `confirmed + public/personal`，并要求 purpose 与 scope 同时匹配。
- prompt marker 将记录声明为 untrusted personal data，不得作为指令、授权、凭据或动作参数。
- 使用事件只含 ID、revision、purpose、count；不含正文、source 或个人分类细节。
- forget 在同一事务删除主记录并写 tombstone，tombstone 只留 SHA-256 摘要。

## 切片

1. 固化 schema、状态机、SQLite store 与迁移。
2. 实现检索、预算和 `MemoryContextExecutor`，增加事件 enum。
3. 装配 runtime，增加 Gateway 与 CLI。
4. 增加 Workbench memory workspace。
5. 完成 unit、integration、独立进程、浏览器、真实 DSH smoke、全量门禁与文档。

## 验证与回滚

- Unit：schema 边界、状态冲突、跨 owner、revision、tombstone、重启持久化、检索矩阵、字符预算和 data marker。
- Integration：Gateway 全生命周期；runtime executor 观察临时 prompt 与原 Task；close 后重开。
- CLI：独立进程 add/list/correct/retract/forget，使用隔离 SQLite。
- Browser：桌面和移动完成候选确认、显式记忆创建、纠正、撤回和遗忘，检查布局和 console。
- Live smoke：用不含身份、公司或秘密的偏好样本，真实 DSH 回答必须体现上下文；事件和 Task 回显核对无正文泄漏。
- Full gate：Node 22.19.0 / pnpm 10.20.0 执行 `pnpm check`。

回滚移除入口、runtime decorator 和 memory package新增实现；SQLite 表保留为惰性兼容数据，不影响旧代码。若必须删除，先停服务并备份数据库，再只删除 `personal_memories`、`personal_memory_tombstones`、`personal_memory_migrations`。
