# SPEC-0009 验收证据

状态：verified_once。采集时间：2026-09-25。实现提交：`pending`。环境：macOS arm64、Node 22.19.0、pnpm 10.20.0、DSH `0.1.7-rc.1`。

所有测试数据库、DSH home、浏览器状态和真实 smoke 数据均位于 Git 忽略的隔离目录；本文件不记录模型凭据、Bearer token、私人身份或真实个人偏好。

## E-01 · Schema、状态机与 SQLite

- `packages/personal-memory/tests/index.test.ts` 共 10 项通过。
- 覆盖 candidate → confirmed、纠正保持 ID 并递增 revision、撤回幂等、撤回后禁止纠正、跨 owner 统一 not found。
- SQLite 关闭重开后正文、状态、用途和 revision 保持一致；与 Task Ledger 共用文件时 `PRAGMA user_version` 仍为 2，模块 migration 独立记录为 version 1。
- `forget` 同事务删除主表正文并写 tombstone；直接 SQL 检查主表无记录，tombstone 序列化结果不含旧正文。
- 检索矩阵覆盖 status、classification、purpose、scope 和字符预算；candidate、sensitive、错误用途/scope 均未召回。

## E-02 · Runtime 上下文边界

- `MemoryContextExecutor` 单测和 runtime integration 证明当前任务位于 data block 之前，marker 为 `lumi.personal-context/v1`，并明确记忆不是系统指令、凭据、动作授权或工具权限。
- custom executor 收到临时上下文，Task Ledger 保存的 `content` 仍为原始请求，`contextRefs` 不变。
- `memory.context_attached` 只记录 count、purpose、memory ID 和 revision；断言事件序列化结果不含正文。
- runtime 关闭并用同一文件重开后可读取原 memory；Core、Task Ledger 和 DSH adapter 未引入 personal-memory 依赖。

## E-03 · Gateway 与 CLI

- Gateway 通过 create/list/get/confirm/correct/retract/forget 全生命周期，revision 依次为 1→2→3→4。
- 另一个 owner 的 memory ID 通过当前 Bearer principal 查询返回 HTTP 404 / `MEMORY_NOT_FOUND`，不暴露存在性。
- `tests/integration/personal-memory-cli.test.ts` 启动 6 个独立 CLI 进程，使用同一隔离 SQLite 完成 add → list → confirm → correct → forget → list empty。
- CLI tombstone 输出不含被纠正后的正文；无 DSH 或网络依赖。

## E-04 · Workbench

- Workbench API 测试覆盖 6 个 memory v2 请求及 Bearer token 复用。
- 组件测试覆盖默认显式 confirmed 创建、scope/purpose 修改，以及 candidate 确认、纠正、撤回、二次确认遗忘。
- `pnpm test:e2e` 在 Desktop Chrome 1440×900 与 Pixel 7 项目通过 10 个场景；memory 场景在两个视口均完成全生命周期并通过 API 确认最终 404。
- 所有场景断言无横向溢出、console error 或 page error。截图生成于 Git 忽略的 `data/workbench-evidence/memory-{desktop,mobile}.png`；人工读图确认 tab、筛选、主视图和详情区没有重叠或不可达操作。

## E-05 · 真实 MiniMax 非敏感记忆

前置：从仓库外本机 `.env` 注入 provider 凭据，实际解析为 `minimax-cn / MiniMax-M3`；使用隔离 `PA_DATA_DIR`、`PA_DSH_HOME` 和 SQLite。记忆是专用于验收的虚构偏好，不含个人身份、公司信息、凭据或外部动作。

输入记忆要求在被询问验证偏好时只返回 token `LUMI_MEMORY_OK`，scope=`general`、purpose=`general_assistance`、classification=`personal`、status=`confirmed`。Task 为 “Demonstrate the remembered validation preference now. Return only the requested token.”

观察：

- Task ID `task-memory-live-smoke`。
- wall time 约 3.7 秒。
- `capabilityId=personal-assistant`，`dshSessionId=pa-task-memory-live-smoke`，最终 `state=completed`。
- 模型结果严格为 `LUMI_MEMORY_OK`。
- Task 表 `content` 仍是原始请求；`memory.context_attached` 为 count=1、memory ID、revision=1、purpose=`general_assistance`，无正文。
- SQLite 约 156 KiB；取证后精确删除隔离 database、WAL/SHM 和 DSH home。

这是单次真实提供方上下文使用样本，只标 `verified_once`。它不证明任意偏好都能正确应用，也不证明模型不会错误解释复杂、冲突或恶意记忆。

## E-06 · 完整门禁

在 Node 22.19.0、pnpm 10.20.0 下执行 `pnpm check`：

- lint 通过。
- TypeScript `--noEmit` 通过。
- DSH pins 对齐 `0.1.7-rc.1`。
- Vitest：21 个测试文件、155 个测试通过；10 个 contract 用例启动真实 DSH SDK 子进程。
- tsup CLI/Gateway 构建通过。
- Vite Workbench 构建通过，生产 JS 约 275.38 kB、CSS 约 18.67 kB。

另执行 `pnpm test:e2e`：10/10 通过。

## 回滚证据

- personal-memory 只创建 `personal_memories`、`personal_memory_tombstones`、`personal_memory_migrations`，不修改 Task Ledger `user_version`。
- 移除 runtime decorator 和入口后，旧版本会忽略这些表；不需要回滚 Task/Action schema。
- 必须删除数据时先停服务和备份，再只删除 memory 模块拥有的三张表。外部副作用为零。
