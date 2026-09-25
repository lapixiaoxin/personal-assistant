# 单机任务重启恢复

状态：verified_once。验证日期：2026-09-25。适用版本：SPEC-0010 实现提交（证据绑定时补充 commit）。适用于同一台机器、同一 SQLite、单个长期 Host；不适用于跨主机共享数据库、分布式 worker 或模型检查点恢复。

## 前置与停止条件

- Node >=22.19.0、pnpm 10.20.0，使用当前 lumi 配置的 owner/principal。
- 不复制、删除或手改生产数据库来“修复”状态；先备份一致 SQLite。
- `outcome_unknown` / `reconciling` Action 禁止 execute 或普通 retry，只能 reconcile。
- coding-agent、未知 capability 或有工具迹象的 interrupted Task 默认不允许自动重试。
- 若数据库记录的 runtime PID 仍存活，当前进程不会接管 running Task。先确认是否确有另一个 Gateway/CLI 在运行，不能为通过恢复而强杀进程。

## 启动判定

正常启动 Gateway 或任一 CLI 时会等待 `runtime.ready`：

1. 若另一 runtime PID 仍存活，跳过启动恢复。
2. stale runtime 的普通 queued Task 自动续调度；Action queued 保持原状。
3. 普通 running Task 转为 `interrupted` 并建立 Recovery。
4. executing Action 原子转为 `outcome_unknown`，Task 转为 `reconciling`。
5. 中途退出的 retry claim 沿用已保存的 replacementTaskId。

查看待处理记录：

```bash
pnpm cli recovery list --status pending
pnpm cli recovery get <recovery-id>
```

Recovery 不包含 Task 正文副本；正文仍由原 Task 持有。检查 `disposition`、`reasonCode`、`safeToRetry`、可选 `actionId`。

## 用户命令

`retry_available` 表示只允许创建新的 Task，不修改原 Task：

```bash
pnpm cli recovery retry <recovery-id>
```

验收：返回 `recovery.status=resolved`、`resolution=retried`、非空 `replacementTaskId`；原 Task 仍为 interrupted。命令重复调用返回同一 replacement，不生成第二个 Task。

`manual_review` 先检查仓库、文件或外部系统的实际影响，再确认已了解：

```bash
pnpm cli recovery acknowledge <recovery-id>
```

该命令不重做任务，也不证明原执行没有副作用。

`reconcile_action` 使用动作命令：

```bash
pnpm cli action get <action-id>
pnpm cli action reconcile <action-id>
```

验收必须同时查看 receipt、Verification 和关联 Task。artifact 存在且摘要匹配时得到 recovered receipt、Verification passed 和 Task completed；不存在或摘要不匹配时 Verification failed、Task failed。两种情况都表示对账已经完成，不等于动作成功。

## HTTP 与 Workbench

HTTP 使用：

```text
GET  /v2/recoveries?status=pending
GET  /v2/recoveries/:id
POST /v2/recoveries/:id/retry
POST /v2/recoveries/:id/acknowledge
POST /v2/actions/:id/reconcile
```

所有入口要求 Bearer token，并同时匹配 owner/principal。Workbench 对 interrupted Task 显示服务端 reason；只有 retry_available 提供“创建新任务”。Action Inbox 对 outcome_unknown 只显示“对账结果”。

## 故障与恢复

- runtime 仍活跃：不接管；使用当前 Gateway 查看任务，或等待其正常关闭。
- PID 已退出但未生成 Recovery：检查 `runtime_recovery_lease` 的 PID 是否被系统复用。PID 复用会延迟恢复，不能据此删除 Task 或 lease；先确认实际进程。
- retry 命令中途退出：重启后会继续关联同一 replacementTaskId；不要手工再次提交相同正文。
- reconcile 失败：保留 Action、artifact 和数据库，不 execute；先检查 provider read 错误，再重复 reconcile。
- migration 回滚：停止所有 lumi 进程，使用 v3 迁移前一致备份恢复旧二进制。已发生 Action 必须保留并先对账，数据库回滚不会撤销文件或外部影响。

## 已验证证据

本机通过真实子进程进入 running 后 `SIGKILL`，独立 CLI 识别 stale PID 并生成 retry_available Recovery；另验证 live runtime 不被第二进程接管、retry claim 跨重启只生成一个 replacement、Action executing 不重复 write。桌面和移动 Playwright 均完成 interrupted → replacement completed，且无横向溢出或 console error。

这只标记 `verified_once`。未执行长时间休眠、PID 复用、跨主机、多 worker、真实云模型中途崩溃或 7 天 soak。
