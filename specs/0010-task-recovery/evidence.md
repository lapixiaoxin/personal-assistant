# SPEC-0010 验证证据

时间：2026-09-25。验证者：lumi Agent。规格：SPEC-0010 v0.1。实现 commit：`00382cf`；证据绑定 commit：`0034815`。

环境：macOS arm64；Node 22.19.0；pnpm 10.20.0；SQLite `node:sqlite`；DSH SDK/runtime/mock `0.1.7-rc.1`。测试数据均位于系统临时目录或仓库忽略的 `data/`；未使用私人正文、生产凭据或真实外部写入。

## 证据矩阵

| 证据 | AC | 结果 |
| --- | --- | --- |
| E-01 contracts / migration / ledger unit | AC-001–003、005–008 | passed：Task 新状态、v1/v2→v3、原子 Recovery、Action executing→outcome_unknown、owner 隔离 |
| E-02 recovery service fault matrix | AC-001–007、011 | passed：safe/manual/action 分类、queued 与 Action queued 分离、retry claim 重启、live PID 不接管 |
| E-03 runtime / Gateway | AC-001、004、005、008、011 | passed：`runtime.ready`、Bearer owner/principal、retry API、foreign Recovery 404、reconcile 收口 |
| E-04 independent CLI / forced crash | AC-001、002、005、006、010、011 | passed：真实子进程 running 后 SIGKILL，独立 CLI 识别 stale PID；retry/deny/ack 跨进程 |
| E-05 Workbench / Playwright | AC-009 | passed：桌面与移动共 12 项；interrupted → replacement completed；Action 对账路径保持；无横向溢出或 console error |
| E-06 complete gate | AC-010 | passed：lint、typecheck、DSH pin、23 files / 179 tests、server + Workbench build；docs 82 files / 180 links |

## 关键观察

- 普通 meeting Task 重开后：原 Task `running → interrupted`；Recovery `retry_available / safeToRetry=true`；初始化未调用 executor。
- coding-agent 与已有 `tool.called` 的 personal Task：Recovery `manual_review / safeToRetry=false`；retry 返回 `RETRY_NOT_ALLOWED`，没有 replacement。
- Action `executing` 重开后：Authorization 保持 `consumed / remainingUses=0`；Action `outcome_unknown`；Task `reconciling`；恢复器未调用 provider.write。
- Action 对账读回匹配：recovered receipt、Verification passed、Task completed、Recovery resolved/reconciled。
- retry claim 在 replacement 创建前退出：重开沿用持久 `replacementTaskId / replacementCreatedAt`，只执行一个 replacement。
- 活跃 runtime PID 存在时，第二 runtime 返回 `skippedActiveRuntime=true`，不改变 running Task；owner runtime 退出后才接管。
- 真实故障进程使用 `node --import tsx/esm tests/fixtures/blocking-runtime.ts <db>`，收到 `RUNNING` 后发送 `SIGKILL`。下一独立 CLI 进程得到 `task-forced-crash / retry_available`，证明不是仅靠手工改状态。

## 命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm check
python3 scripts/check-docs.py
```

上述最终 `pnpm check` 退出码 0：23 个 Vitest 文件、179 项通过，其中 10 项启动真实 DSH SDK 子进程；CLI/Gateway tsup 与 Workbench Vite build 成功。随后完整 `pnpm test:e2e` 退出码 0：desktop 6 + mobile 6 共 12 项。`scripts/check-docs.py` 退出码 0：82 个 Markdown、180 个本地链接、无错误。

Node 18 不受支持；本机通过工作区已安装的 Node 22.19.0 PATH 执行。DSH contract 启动真实 SDK 子进程但连接本地 mock provider，不代表真实云模型中途崩溃。

## 数据与迁移

- Task Ledger `user_version` 从 2 expand 到 3；新增 `task_recoveries`、`runtime_recovery_lease` 与索引，不修改旧 Task / Action 列。
- v1 fixture 直接升级到 v3后旧 Task 可读，migration history 为 1/2/3；模拟 v2 fixture 升级后旧 queued Task 保持。
- Personal Memory 独立 migration 不改变 Task Ledger `user_version=3`。
- 旧二进制不能直接打开 v3 数据库。回滚使用迁移前一致备份；Action artifact 和回执先对账，不随数据库回滚删除或重做。

## 未验证与适用边界

- 未执行真实云模型请求中途崩溃、系统休眠/唤醒、PID 复用、跨主机共享数据库、多 worker、heartbeat/fencing 或 7 天 soak。
- 普通 running Task 没有原地 resume；retry 明确创建新 Task。`retry_available` 只表示没有已知外部副作用重放风险，不保证输出、费用或耗时相同。
- 本机 PID 所有权不是分布式 lease。PID 复用会保守延迟恢复；跨主机部署必须先实现真正的 lease/fencing。
- research retry 可能产生新的只读 snapshot；本切片未实现孤儿 snapshot 清理。

## 清理

Vitest 临时数据库由 afterEach 精确删除；Playwright 数据、截图和 trace 位于忽略的 `data/workbench-*`。手工诊断目录 `data/recovery-crash-debug` 在最终验收前删除。没有真实外部对象或私人数据需要清理。
