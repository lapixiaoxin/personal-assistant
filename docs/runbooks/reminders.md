# 一次性提醒与本地通知

状态：verified_once。验证日期：2026-09-25。适用版本：SPEC-0011 实现提交 `e2386a8`。适用于本机长期运行的 lumi Gateway 或按需启动的 CLI；通知只进入本地 inbox。

## 前置与边界

- Node >=22.19.0、pnpm 10.20.0，使用当前 owner/principal。
- 准时提醒需要 Gateway/runtime 持续运行；进程关闭期间无法唤醒系统，下次启动按 misfire policy 处理。
- 时间必须是带 `Z` 或 offset 的 RFC3339；timezone 使用 IANA 名称，如 `Asia/Shanghai`。
- 提醒正文保存在本地 SQLite，不要写入凭据或 secret。
- reminder 不授予动作权限，也不发送邮件、飞书消息、系统通知或移动 push。

## CLI

创建下次启动仍需补发的提醒：

```bash
pnpm cli reminder add "检查发布状态" \
  --at 2026-09-26T09:00:00+08:00 \
  --timezone Asia/Shanghai \
  --misfire latest \
  --key release-check-20260926
```

若过时就不再提醒：

```bash
pnpm cli reminder add "会议前检查材料" \
  --at 2026-09-26T08:30:00+08:00 \
  --timezone Asia/Shanghai \
  --misfire skip \
  --key meeting-check-20260926
```

查询和取消：

```bash
pnpm cli reminder list
pnpm cli reminder list --status scheduled
pnpm cli reminder get <reminder-id>
pnpm cli reminder cancel <reminder-id>
```

读取和确认本地通知：

```bash
pnpm cli notification list --status unread
pnpm cli notification acknowledge <notification-id>
```

同一个 idempotency key 绑定相同参数时返回原 Reminder；正文、时间、timezone 或 policy 改变时返回 conflict。需要修改提醒时，取消原记录并使用新 key 创建。

## HTTP 与 Workbench

HTTP：

```text
POST /v2/reminders
GET  /v2/reminders
GET  /v2/reminders/:id
POST /v2/reminders/:id/cancel
GET  /v2/notifications
GET  /v2/notifications/:id
POST /v2/notifications/:id/acknowledge
```

Workbench 顶部“提醒”视图可选择本地时间、`下次启动提醒 / 过时跳过`，查看计划和通知，并确认未读通知。浏览器将 `datetime-local` 转为绝对 ISO，同时提交浏览器 IANA timezone。

## 成功判定

- 在线：到达 fireAt 后 Reminder 为 fired，notificationId 非空，收件箱只有一条 unread Notification。
- latest 离线误点：下一次 runtime.ready 后 Reminder fired、通知一条。
- skip 离线误点：下一次启动 Reminder skipped、通知零条。
- acknowledge：Notification acknowledged，重复调用 acknowledgedAt 不变。
- 任一提醒路径均不增加 Task Ledger task/event，不调用 DSH executor。

## 多进程与失败处理

只有持有 SPEC-0010 本机 runtime 所有权的进程运行 scheduler。若 Gateway 已运行，另一个 CLI 进程以 passive 模式打开同一数据库：

- 可 list/get/acknowledge，也可取消已有 reminder。
- 不创建新 reminder，避免常驻 scheduler 无法及时获知新 timer；使用 Gateway HTTP 或 Workbench 创建。

SQLite 事务失败时 reminder 不会半终结、notification 不会只写一半。timer wake 失败后 1 秒重试。重复启动/tick 依靠 reminder 状态和 notification dedupe key 防重复。

## 回滚与清理

停止所有 lumi runtime 后备份 SQLite。旧二进制会忽略 `reminders`、`notifications`、`reminder_migrations`。必须删除时先导出用户仍需的提醒，再只删除这三张表；不要删除 Task、Action、Memory 或 Recovery 表。

本次真实验证覆盖本机短 timer、多个独立 CLI 进程 latest/skip、桌面/移动 Workbench。未验证系统休眠、PID 复用、长时间 soak、周期/DST 墙钟规则、外部 push 或多设备已读。
