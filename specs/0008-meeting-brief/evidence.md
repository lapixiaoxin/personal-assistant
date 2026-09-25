# SPEC-0008 验收证据

状态：verified_once。采集时间：2026-09-25。实现提交：待本地提交后回填。环境：macOS arm64、Node 22.19.0、pnpm 10.20.0、DSH `0.1.7-rc.1`。

所有测试数据库、DSH home、浏览器状态和真实 smoke 数据均位于 Git 忽略的隔离目录；本文件不记录模型凭据、Bearer token、完整私人会议内容或 DSH Run token。

## E-01 · 输入、路由与结构校验

- `packages/meeting-workflow/tests/index.test.ts` 共 13 项通过。
- 覆盖字段裁剪、长度/数量边界、重复参与者、非 owner、server-owned workflow marker。
- 公共 Task submission schema 与 Gateway 测试证明 `/v1/tasks` 不能伪造 `lumi-workflow:*`；内部 workflow marker 和 `lumi-action:*` 引用保持可用。
- 覆盖正确六段输出，以及缺首尾 marker、缺标题、重复标题、乱序和空段落失败。
- 成功与失败均断言 `verification.completed` / `meeting.verify`；审计不复制会议背景。
- capability 单测证明 meeting marker 优先于 content 中的 TypeScript/coding 关键词，无 marker 路由保持兼容。

## E-02 · Protected DSH 边界

- `pnpm test:dsh` 通过 10 项真实 DSH SDK 子进程测试。
- meeting contract 启动 `profiles/dsh-meeting/cordis.patch.yml` 并完成 per-Run ready handshake。
- 本地 mock model 首轮请求 `bash`；`tool.completed.isError=true`，随后返回合格六段结果并通过 Host verifier。
- 首轮模型请求包含 meeting persona，但不包含 `lumi_artifact_prepare`、`lumi_action_execute` 或 `lumi_public_web_fetch` 工具定义。
- adapter/plugin 单测证明 guard-only bridge 的 Action/research endpoint 均 403，模型侧注册工具数组为空。
- 既有 personal Action、research source 和 `write`/`bash`/`web_fetch` 旁路测试继续通过。

## E-03 · Gateway、CLI 与账本

- Gateway 测试通过合法 meeting payload → `meeting-agent` → completed/verification passed，并验证空 agenda 返回 HTTP 400。
- Workbench API 测试断言 `/v2/workflows/meeting-brief` payload 保持结构化字段，不暴露 context ref 编码。
- 隔离目录 `data/meeting-cli-smoke` 使用 mock CLI 成功完成 `task-meeting-cli-smoke`。
- 首次按 README 旧形式运行 `pnpm cli -- meeting ...` 时，Commander 报 `required option '--objective <text>' not specified`；改用 `pnpm cli meeting ...` 后成功。README 与 SOP 已修正全部同类示例，未修改 CLI parser 绕过标准参数语义。

## E-04 · Workbench

- 组件测试覆盖第三个“会议准备”模式、五类字段、逐行参与者/议程解析、API 调用和结构结果渲染。
- 协议 marker 与固定英文标题不直接显示；页面渲染六个中文标题分区。
- `pnpm test:e2e` 在 Desktop Chrome 1440×900 与 Pixel 7 项目通过 8 个场景，其中 meeting 场景分别提交并完成。
- 两个视口均断言无横向溢出、无 console/page error；截图生成于 Git 忽略的 `data/workbench-evidence/meeting-{desktop,mobile}.png`，人工读图后随隔离数据清理。
- 人工读图确认字段、提交按钮、结果分区和执行事件没有重叠或不可达操作。

## E-05 · 真实 MiniMax 虚构会议

前置：从仓库外的本机 `.env` 注入 `MINIMAX_CN_API_KEY`，使用 `minimax-cn / MiniMax-M3`，隔离 `PA_DATA_DIR` 与 `PA_DSH_HOME`。输入只含“虚构产品路线评审”、三个角色、三个议程项和非敏感背景。

观察：

- wall time `8.22s`。
- Task ID `task-meeting-live-smoke`。
- `capabilityId=meeting-agent`，`dshSessionId=pa-task-meeting-live-smoke`，最终 `state=completed`。
- 模型用中文生成全部六段；首尾 marker 和标题顺序通过 `meeting-brief-structure/1`。
- Task 事件序列只有 created/routing/policy/state/execution/verification，没有 `tool.called` 或 `tool.completed`。
- `verification.completed` 为 `status=passed`、`sectionCount=6`；`meeting.verify` audit outcome 为 `succeeded`。
- 隔离数据采集后精确删除，未写 artifact、source snapshot 或外部系统。

这是单次真实提供方结构与质量样本，只标 `verified_once`。它不证明事实正确、跨模型稳定或已具备日历/通讯录/文档连接能力。

## E-06 · 完整门禁

在 Node 22.19.0、pnpm 10.20.0 下执行 `pnpm check`：

- lint 通过。
- TypeScript `--noEmit` 通过。
- DSH pins 对齐 `0.1.7-rc.1`。
- Vitest：20 个测试文件、139 个测试通过；10 个 contract 用例启动真实 DSH SDK 子进程。
- tsup CLI/Gateway 构建通过。
- Vite Workbench 构建通过，生产 JS 约 262.03 kB、CSS 约 14.96 kB。

另执行 `pnpm test:e2e`：8/8 通过。

## 回滚证据

- 本切片未改变 SQLite schema 或 `TaskEventTypeSchema`，复用 `verification.completed`。
- meeting package/profile/capability/API/UI 可按 plan 中列出的文件边界移除。
- protected bridge 泛化保留旧配置兼容：action/research capability 集合仍隐含 protected；既有 DSH contracts 全部通过。
