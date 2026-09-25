# SPEC-0010 实现计划

状态：Ready · 对应 spec v0.1。

## 边界

- `packages/contracts` 定义新增 Task 状态、Recovery schema、查询和结果。
- `packages/task-ledger` 继续拥有 Task / Action / Recovery 的一致性事务和 v3 migration；不放恢复策略。
- `packages/task-recovery` 持有启动分类、显式重试、人工确认和 Action reconcile 编排。
- `packages/assistant-core` 只增加“执行已持久 queued Task”的通用入口，不识别 Recovery 原因。
- `apps/runtime` 装配 RecoveryService 和 `ready` 启动屏障。
- Gateway / CLI / Workbench 只调用 RecoveryService，不直接改恢复表或 Task 状态。

依赖方向保持：entry → runtime → recovery/core → ledger/contracts。DSH adapter 不依赖恢复模块。

## 协议和状态

启动顺序：

1. 打开 Task Ledger 并完成 v3 expand migration。
2. 构造 Core、ActionService、RecoveryService。
3. 原子领取单机 runtime ID / PID；若既有 PID 存活则跳过接管。
4. 同步扫描 running Task，写入 Recovery 并转为 interrupted / reconciling。
5. 恢复 `retrying` claim 和普通 queued 非 Action Task。
6. `runtime.ready` 完成后 Gateway/CLI 才接受用户命令。

普通重试不是原地状态回退：

```text
original running -> interrupted
Recovery pending -> retrying -> resolved(retried)
replacement queued -> running -> terminal/waiting_approval
```

Action 路径：

```text
Action executing -> outcome_unknown
Task running -> reconciling
Recovery pending(reconcile_action)
    -> explicit reconcile -> receipt/read-back -> verification
    -> Task completed|failed + Recovery resolved(reconciled)
```

## 数据与兼容

`task_recoveries` 使用 `task_id UNIQUE` 保证每个原执行尝试只有一条恢复记录；replacement task ID 与创建时间在 claim 时持久化。`runtime_recovery_lease` 保存单个 runtime ID / PID / startedAt，并用 compare-and-replace 防止两个新进程同时接管 stale 记录。v3 migration 只新增表和索引，不改旧列。旧 Task 状态字符串继续可读；新二进制接受旧六态和新增两态。

迁移测试从真实 v2 fixture 打开，检查旧 Task / Action 仍存在、`user_version=3`、migration history 增加一条记录。回滚保留迁移前备份。

## 安全

- classification 使用 capability allowlist 与持久事件，不由模型输出决定。
- coding-agent 永远 manual_review；personal Task 一旦存在 tool.called / action.prepared / action.executing 等迹象即 manual_review。
- Action 恢复不调用 provider.write，只调用现有 read + digest verification。
- PID 仍存活时跳过启动接管；PID 判活失败关闭，权限错误按“仍存活”处理。
- 所有查询和命令同时匹配 ownerId 与 principalId。
- Recovery reason 使用固定 reasonCode 和无正文摘要。

## 切片

1. 契约、Task 状态和 v3 migration。
2. ledger 原子 recovery 操作与 migration / restart 单测。
3. RecoveryService、Core queued dispatch、runtime.ready。
4. Gateway / CLI。
5. Workbench 状态和恢复面板。
6. 故障注入、独立进程、浏览器、完整门禁、文档和证据。

## 取舍

- 不升级 DSH rc.2：其冷 session schedule 不能替代 lumi 的 Task / Action 事实和参数级对账；升级另行规格化。
- 不自动重跑 running Task：当前没有跨 DSH 与 Host 的原子检查点。
- 不引入通用 worker lease：单机 runtime PID 所有权只解决当前多入口误接管，后续 M3 再加 heartbeat / lease / fencing。
- 不新增独立 Recovery SQLite 连接：跨 Task、Action、Recovery 的判定必须在 Task Ledger 同一事务内。

## 验证与回滚

- Unit：schema、分类矩阵、owner 隔离、重复启动、retry claim、queued dispatch。
- Integration：文件 SQLite 重开、Action write 后/receipt 前故障、retry claim 中断。
- CLI：不同进程完成 interrupted 查询、retry/acknowledge 和 Action reconcile。
- Browser：桌面与移动展示两种恢复状态及允许命令。
- Full：Node 22.19.0 / pnpm 10.20.0 执行 `pnpm check` 和 Playwright。

回滚先停 Gateway / CLI，备份 v3 数据库，再切回迁移前二进制和数据库快照。已发生 Action 不删除、不重做；先保留 artifact 与摘要完成对账。源码回滚不自动清理 Recovery 记录。
