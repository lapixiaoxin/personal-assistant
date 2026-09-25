# SPEC-0011 验证证据

时间：2026-09-25。验证者：lumi Agent。规格：SPEC-0011 v0.1。实现 commit：`e2386a8`。

环境：macOS arm64；Node 22.19.0；pnpm 10.20.0；SQLite `node:sqlite`；DSH `0.1.7-rc.1`。所有提醒均为隔离测试文本，本地通知未发送到系统或外部服务。

## 证据矩阵

| 证据 | AC | 结果 |
| --- | --- | --- |
| E-01 contracts / SQLite migration | AC-004、006、007、009 | passed：RFC3339 offset、IANA timezone、独立 migration、Task user_version 保持 3 |
| E-02 scheduler / transaction unit | AC-001–008 | passed：latest/skip、timer 替换、取消、ack 幂等、notification dedupe |
| E-03 runtime / Gateway | AC-001、004–009、012 | passed：runtime.ready、active/passive owner、Bearer API、Task/DSH 零调用 |
| E-04 independent CLI / real timer | AC-001–003、005、006、009、011 | passed：250ms 真实 timer；多 CLI 进程离线 latest/skip、重复启动和 acknowledge |
| E-05 Workbench / Playwright | AC-010 | passed：desktop 7 + 320px mobile 7；3 秒提醒、通知确认、无 overflow/console error |
| E-06 complete gate | AC-011 | passed：lint、typecheck、DSH pin、25 files / 195 tests、server + Workbench build；docs 88 files / 185 links |

## 关键观察

- 同一 owner/principal/idempotencyKey + 相同参数返回同 Reminder；等价 offset 时间规范为 UTC 后摘要一致，参数变化返回 `REMINDER_CONFLICT`。
- online wake 在同一事务中得到 Reminder fired、唯一 unread Notification；重复 wake 的 notification count 为 0。
- startupAt 后打开数据库：latest 为 fired + 一条通知，skip 为 skipped + 零通知；第三次进程启动仍只有一条通知。
- 创建更早 Reminder 会清除旧 timer 并设置更短 delay；两条到点后各触发一次。
- active runtime PID 存活时第二 runtime 的 reminder service 为 passive，不启动 timer且拒绝 create；list/get/ack/cancel 仍可用。
- 真实短 timer 触发后 Task Ledger task 数量为 0，注入 executor 调用次数为 0。
- Workbench 浏览器提交本地 `datetime-local`，API 读回 Reminder fired / Notification acknowledged；移动和桌面截图已人工检查。

## 命令

```bash
pnpm exec vitest run packages/reminders/tests/index.test.ts
pnpm exec vitest run tests/integration/reminder-cli.test.ts
pnpm test
pnpm test:e2e
pnpm check
python3 scripts/check-docs.py
```

最终 `pnpm check` 退出码 0：25 个 Vitest 文件、195 项通过，其中 10 项启动真实 DSH SDK 子进程；CLI/Gateway tsup 与 Workbench Vite build 成功。完整 `pnpm test:e2e` 退出码 0：desktop 7 + 320px mobile 7，共 14 项。`scripts/check-docs.py` 退出码 0：88 个 Markdown、185 个本地链接、无错误。

DSH contract 即使执行，也只连接本地 mock provider；Reminder 路径自身不启动 DSH。

## 数据、迁移与回滚

- 新表：`reminders`、`notifications`、`reminder_migrations`。
- reminders store 不读取或修改 Task Ledger `PRAGMA user_version=3`；Personal Memory migration 也保持独立。
- Notification `reminder_id` 唯一，`(owner_id, principal_id, dedupe_key)` 唯一。
- 回滚先停 runtime；旧二进制忽略新表。必须删除时先导出用户数据，只删除上述三张表。

## 未验证

- 系统通知、邮件、飞书/移动 push、周期/cron、bounded catch-up、自然语言时间、安静时间、多设备已读和离线唤醒未实现。
- 未做系统长时间休眠、DST 墙钟重复/跳时或 7 天 soak。一次性 fireAt 是绝对时间，timezone 仅作解释/展示。
- timer 异常会在 1 秒后重试，但当前没有独立运维告警或 scheduler 指标。

## 清理

Vitest 临时目录自动删除；Playwright 数据、截图和 trace 位于忽略的 `data/`。没有外部对象需要清理。
