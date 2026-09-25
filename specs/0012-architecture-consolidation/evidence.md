# SPEC-0012 验证证据

时间：2026-09-25。验证者：lumi Agent。规格：SPEC-0012 v0.1。规范/ADR commit：`909c96c`；源码 commit：`9aad4dc`。

环境：macOS arm64；Node 22.19.0；pnpm 10.20.0；SQLite `node:sqlite`；DSH `0.1.7-rc.1`。本切片未调用真实模型或外部服务，未修改数据库 Schema、依赖或 lockfile。

## 证据矩阵

| 证据 | AC | 结果 |
| --- | --- | --- |
| E-01 worktree/branch 审计 | AC-001、007 | passed：两个 worktree clean 且提交已被 main 包含；移除后只剩主工作区，`data/worktrees` 从约 1.5 GB 变为 0 B |
| E-02 文档状态审计 | AC-002 | passed：v0.1 已实现能力、长期 Proposed 目标和明确缺口已分层；ADR-004 Accepted 只覆盖已实现边界 |
| E-03 根导出与静态检查 | AC-003 | passed：现有消费者 import 未修改；lint、typecheck、build 通过 |
| E-04 migration/事务聚焦测试 | AC-004、005 | passed：contracts/task-ledger/action-runtime/task-recovery 4 文件、36 项测试 |
| E-05 完整仓库门禁 | AC-003–006 | passed：25 个 Vitest 文件、195 项测试，含 10 项真实 DSH SDK + 本地 mock contract；server/Workbench build 成功 |
| E-06 文档、差异和运行状态 | AC-002、007 | passed：95 个 Markdown、202 个本地链接；diff check 无错误；4310/4313 仍由原 PID 监听 |

## 结构结果

- `packages/contracts/src/index.ts` 从 498 行收敛为 113 行根导出；common/task/action/recovery/reminder 最大文件 172 行。
- `packages/task-ledger/src/index.ts` 从 1810 行降为 1142 行；类型、错误、映射和 migration 分别进入独立文件。
- `SqliteTaskLedger` 仍持有一个 `DatabaseSync`、一个时钟和一个 `#transaction`；Task/Action/Recovery 没有拆为多个连接或 package。
- 原公开名称逐项保留在 `@lumi/contracts` 与 `@lumi/task-ledger` 根入口；未新增 package subpath export。
- migration SQL、`user_version=3` 和 migration history 名称未改变。

## 命令

```bash
git -C data/worktrees/action-boundary status --short --branch
git -C data/worktrees/dsh-action-bridge status --short --branch
git merge-base --is-ancestor feat/0001-action-boundary main
git merge-base --is-ancestor feat/0005-dsh-action-bridge main
git worktree remove data/worktrees/action-boundary
git worktree remove data/worktrees/dsh-action-bridge
git branch -d feat/0001-action-boundary
git branch -d feat/0005-dsh-action-bridge
pnpm exec vitest run packages/contracts/tests/index.test.ts \
  packages/task-ledger/tests/index.test.ts \
  packages/action-runtime/tests/index.test.ts \
  packages/task-recovery/tests/index.test.ts
pnpm check
python3 scripts/check-docs.py
git diff --check
```

Node 22 命令通过本机已缓存的 `npx --package=node@22.19.0 --package=pnpm@10.20.0` 包装执行；默认 shell 的 Node 18.20.8 未用于项目验证。

## 未执行与边界

- 未运行 Playwright；本切片没有 UI、HTTP 或交互行为修改，完整 Vitest 与生产 build 已覆盖受影响 import。
- 未执行真实云模型、真实外部动作或数据迁移；这不是能力验收。
- 未继续拆分 1142 行的中央 ledger 类。跨领域事务仍集中在此；只有出现独立部署或安全域需求时再评估 repository/进程拆分。
- 未清理 `data/mvp-local`、DSH 源码分析、工具缓存或 Playwright 浏览器。

## 清理、回滚与保留

- 两个已合并 worktree 和本地 feature 分支已删除；对应提交仍可从 `main` 历史到达，需要时可重新创建。
- 用户原有三份 SVG 始终保持未暂存，未进入 `909c96c` 或 `9aad4dc`。
- 4310 PID 26508 与 4313 PID 5493 在验证后仍监听；没有重启或写入其数据。
- 源码回滚只需 revert `9aad4dc`；没有数据库或外部副作用需要补偿。文档决定单独位于 `909c96c`，可独立审阅。
