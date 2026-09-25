# SPEC-0011 实现计划

状态：Ready · 对应 spec v0.1。

## 边界

- `packages/contracts` 定义 Reminder / Notification schema 与命令输入。
- `packages/reminders` 独立拥有 SQLite 表、migration、事务、timer 与服务。
- `apps/runtime` 装配 ReminderService，并把 initialize 串到现有 `ready` 屏障。
- Gateway / CLI / Workbench 只调用 ReminderService，不直接操作表或 timer。
- Task Ledger、AssistantCore、DSH adapter、ActionService 不依赖 reminders。

## 状态与事务

Reminder：

```text
scheduled -> fired
scheduled -> skipped
scheduled -> cancelled
```

Notification：

```text
unread -> acknowledged
```

`fireDue` 在 `BEGIN IMMEDIATE` 中读取 due rows。在线 timer 对全部 due row 投递；startup 对 latest 投递、skip 跳过。投递使用 `notification:<reminderId>:<fireAt>`，先 `INSERT OR IGNORE`，再将 Reminder 终结并绑定 notificationId。事务失败不留下半条通知。

## 调度

ReminderService initialize：

1. 固定 `startupAt=now()`。
2. store 处理 `nextFireAt <= startupAt` 的 startup misfire。
3. 查询最早 scheduled reminder，设置单 timer。
4. timer wake 后用新的 now 执行 online due，再重排。

timer delay 为 `min(nextFireAt-now, 2^31-1)`；小于 1ms 时取 1ms，防止同步忙循环。所有 service create/cancel 调用后重排。close 标记服务关闭、清 timer、关闭 store。

## 数据与兼容

独立表：

- `reminders`
- `notifications`
- `reminder_migrations`

store 设置 WAL、foreign_keys 和 busy_timeout，但不读取或修改 `PRAGMA user_version`。同文件与 Task Ledger / Personal Memory 并存。旧二进制忽略这些表；源码回滚可保留只读数据。

## 安全与隐私

- owner/principal 从认证入口传入；get/list/change 同时过滤。
- idempotency digest 包含 content、fireAt、timezone、misfirePolicy、owner、principal。
- Notification 正文不进入 Task event、Audit、Recovery 或模型上下文。
- 触发只写本地 SQLite，不调用 Action、DSH、系统通知或网络。

## 切片

1. contracts 与 SQLite store。
2. misfire / dedupe / acknowledge / cancel 单测。
3. ReminderService timer 与 runtime.ready。
4. Gateway / CLI。
5. Workbench 提醒与通知视图。
6. 独立进程 catch-up、真实 timer、浏览器、完整门禁、SOP/证据。

## 验证与回滚

- Unit：schema、时间、timezone、幂等冲突、事务、owner、状态机、timer 重排。
- Integration：两个 CLI 进程间 latest/skip catch-up；真实本地短 timer。
- Browser：desktop/mobile 创建、触发、ack、无 overflow/console error。
- Full：Node 22.19.0 / pnpm 10.20.0 执行 `pnpm check`、`pnpm test:e2e`、docs checker。

回滚先停止 runtime 并清 timer。旧二进制可忽略 reminder 表；若必须删表，先导出用户提醒并确认没有待处理通知，再只删除 reminders 模块拥有的三张表。回滚不会撤回用户已经看到的信息。
