# 本机基线检查与 mock CLI 持久化

状态：verified_once。2026-09-24，macOS，本仓当前无 commit 的工作树；Node 22.19.0、pnpm 10.20.0。证据见 [本次记录](../evidence/2026-09-24-design-baseline.md)。

## 前置和停止条件

在仓库根目录操作，依赖已安装。检查 `node --version`、`pnpm --version` 和 Git 状态。Node18 不受支持，不为兼容本机旧版本修改源码。测试使用独立数据库，必须显式 `PA_EXECUTOR=mock`；误用默认 DSH 时立即停止，先核对配置。

正常环境运行 `pnpm check`。本机 PATH 为 Node18 时，已验证以下隔离工具方式：

```bash
NPM_CONFIG_CACHE=./data/tooling/npm-cache NPM_CONFIG_REGISTRY=https://registry.npmjs.org npx --yes --package=node@22.19.0 --package=pnpm@10.20.0 -c 'pnpm check'
```

预期 lint、typecheck、DSH 版本、Vitest 和 build 全部成功。本次 9 文件、23 tests 通过；测试数随规范演进，以实际输出为准。该命令通过公开 npm 获取工具，未改变项目 lockfile；只在本机默认 Node 不符合要求时需要。

## 已成功的 CLI 步骤

以下为本次实际命令，三步分别启动新的 CLI 进程。再次演练时选择新的专用目录及 task ID；不要把已成功任务当作新提交反复运行。

```bash
NPM_CONFIG_CACHE=./data/tooling/npm-cache NPM_CONFIG_REGISTRY=https://registry.npmjs.org PA_EXECUTOR=mock npx --yes --package=node@22.19.0 --package=pnpm@10.20.0 -c 'pnpm exec tsx apps/local-runner/src/main.ts --db ./data/design-validation-20260924/assistant.db submit 发送测试报告 --id design-mock-approval-001'
```

观察：`task.state=waiting_approval`、`approval.status=pending`、`result=null`。

```bash
NPM_CONFIG_CACHE=./data/tooling/npm-cache NPM_CONFIG_REGISTRY=https://registry.npmjs.org PA_EXECUTOR=mock npx --yes --package=node@22.19.0 --package=pnpm@10.20.0 -c 'pnpm exec tsx apps/local-runner/src/main.ts --db ./data/design-validation-20260924/assistant.db approve design-mock-approval-001'
```

观察：`state=completed`、`result=[mock:coding-agent] 发送测试报告`。这是模拟执行结果，没有发送真实报告。文案包含“测试”，现有正则路由到 coding-agent；这不是垂类 Agent 能力的质量证明。

```bash
NPM_CONFIG_CACHE=./data/tooling/npm-cache NPM_CONFIG_REGISTRY=https://registry.npmjs.org PA_EXECUTOR=mock npx --yes --package=node@22.19.0 --package=pnpm@10.20.0 -c 'pnpm exec tsx apps/local-runner/src/main.ts --db ./data/design-validation-20260924/assistant.db get design-mock-approval-001'
```

观察：同一 task ID、`completed`、`approval.status=approved`，审批时间和 mock 结果仍存在。证明跨 CLI 进程持久化，不证明运行中任务恢复。

## 失败处理与清理

Node 版本不符：先修正执行环境。DSH 版本不符：检查锁文件和上游策略，不能绕过检查。原 ID 重提冲突：当前请求比较包含 createdAt，参见工程基线，不删记录掩盖。

SQLite ExperimentalWarning 在上述受支持版本下出现，三步退出码均为 0；警告本身不是流程失败。其他错误按完整错误和对应任务状态诊断。

本次保留已忽略的 `data/design-validation-20260924/` 作为本机验证数据，不含真实个人任务。无外部对象需要清理。需要释放空间时只删除这一专用演练目录，不能删除 `data/assistant.db`、DSH 会话或其他用户数据。
