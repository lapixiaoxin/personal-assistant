# lumi 工程事实基线

采集日期：2026-09-24。范围：首次设计时的工作区源码与本机验证。当时分支为 `feat/initial-mvp`、尚无 commit，原工程文件均未跟踪。随后用户授权 Agent 托管版本管理，现已在 `main` 建立初始基线 `1cd54cc`；提交保留原业务源码，不把用户既有实现归为本次新增功能。后续按 `AGENTS.md` 主动提交已授权且验证完成的工作。

## 已观察的实现

| 项目 | 事实 | 证据 |
| --- | --- | --- |
| 语言和构建 | TypeScript、pnpm 10.20.0、Node >=22.19.0、tsup | 根 `package.json`、`.nvmrc` |
| 入口 | CLI 与 HTTP 通过 runtime 装配同一个 Core | `apps/local-runner`、`apps/gateway`、`apps/runtime` |
| 任务 | 六状态、任务提交、批准、拒绝、取消 | `packages/contracts`、`packages/assistant-core` |
| 持久化 | SQLite 任务、事件、审批、审计，状态与对应迁移事件同事务 | `packages/task-ledger` |
| 路由 | 正则规则选 personal-assistant 或 coding-agent | `packages/capability-registry` |
| 策略 | 任务文字与 capability 风险等级判定，external/critical 需审批 | `packages/policy` |
| 执行 | DSH SDK 每任务独立子进程，支持 AbortSignal 取消 | `adapters/dsh` |
| 上游 | SDK/runtime/mock server 精确固定 0.1.7-rc.1 | `upstream.lock.json`、`pnpm-lock.yaml` |
| 记忆 | candidate / confirmed / retracted 模型，内存 Map 存储 | `packages/personal-memory` |
| 工程检查 | lint、typecheck、版本对齐、测试、构建 | `pnpm check`、`.github/workflows/ci.yml` |

## 必须明确的缺口

- 任务记录跨重启保存；**运行中任务不会因此自动恢复**。没有持久 worker 租约、检查点与动作对账。
- HTTP 身份和审批者由请求字段提供，没有远端认证或对象级授权；loopback 是部署限制，不是完整身份模型。
- 审批针对任务，而非具体工具参数；工具事件被记录，不是阻止实际执行的门禁。DSH persona 的约束只是提示词。
- `operations` 列表进入提示词，不构成工具权限隔离。不能宣称“风险意图被识别”就等于“所有危险动作都被阻止”。
- Core 收到执行器非空结果后可标记 completed；尚无独立验收器与产物证据协议。
- `TaskRecord.dshSessionId` 带有上游命名；需要兼容迁移到中性执行引用。
- 幂等比较含 `createdAt`；CLI 只重用 `--id` 会重新产生时间，不能据 README 推断任意重传成功。
- 记忆未接入 runtime / Gateway，没有持久存储、检索或 owner 访问控制闭环。
- 当前 coding-agent 是路由到另一份 DSH profile，不是已接入 A2A 的独立外部专家。
- 无产品级多轮会话；DSH Web UI 使用 DSH 会话，绕开助手 Task Ledger。
- 尚无插件 host、MCP/A2A adapter、持久 scheduler、设备协议、自动学习或自主发布。
- 当前迁移函数固定 `PRAGMA user_version=1`，尚不是可回滚的版本化迁移框架。
- 数据内容、错误、任务结果和 DSH 会话仍可能含敏感信息；只减少工具审计正文不等于全链路脱敏。

这些是设计基线和后续规范输入，不是本次已经修复的行为。

## 本次已完成的验证

默认终端 Node `v18.20.8` 运行 `pnpm check` 时，lint/typecheck 通过，随后版本检查脚本因不受支持的 Node 特性报错。未据此修改项目代码或降低 Node 要求。

采用工作区内 npm cache 的 Node 22.19.0 与 pnpm 10.20.0 重新执行：

```bash
NPM_CONFIG_CACHE=./data/tooling/npm-cache NPM_CONFIG_REGISTRY=https://registry.npmjs.org npx --yes --package=node@22.19.0 --package=pnpm@10.20.0 -c 'pnpm check'
```

实际结果：退出码 0；lint、typecheck、DSH 精确版本检查通过；**9 个测试文件、23 个测试通过**；CLI/Gateway 构建成功。验证时间：2026-09-24 本机 22:28 左右。

其中 DSH runtime contract 启动真实 SDK 子进程，但模型服务是本地 mock；另一项验证 MiniMax catalog 能初始化。**未执行真实云模型质量评测，未对真实飞书/日历/支付/设备执行任务。** 这次飞书方案发布属于文档工具操作，不代表个人助手自身具备飞书执行能力。

安装隔离工具只影响已忽略的 `data/tooling/npm-cache`；未升级项目依赖或改写 lockfile。现有源码与测试未为本次设计改动。

另执行三次独立 CLI 进程：在专用 SQLite 库提交模拟高风险任务 → 批准 → 重启 CLI 查询。实际观察为 `waiting_approval/pending → completed → completed/approved`，持久化结果带 `[mock:coding-agent]`。这是实际本地集成操作，未发送真实消息；完整命令、时刻和源码摘要见 [证据](evidence/2026-09-24-design-baseline.md) 与 [SOP](runbooks/local-validation.md)。

## 2026-09-24 · lumi 工程整理

用户将产品命名为 `lumi`，取意于与“光”有关的词根。根包名与 CLI 已更名，内部包统一为 `@lumi/*`；协调者 profile 位于 `profiles/dsh-lumi/`。模块测试已从 `src/` 迁到同级 `tests/`，跨模块 DSH 契约放根 `tests/contract/`。

保留 pnpm 隔离结构：10 个模块的 `node_modules` 合计 25 个依赖符号链接，刷新后均有效；第三方版本未升级。`lumi.code-workspace` 提供工作区显示名称与生成目录隐藏配置，磁盘根路径保留原名。

23:34 本机执行 `pnpm check`，lint、typecheck、DSH 版本检查、9 文件/23 用例及构建全部通过。另以构建后的 CLI 和独立数据库验证 `waiting_approval → completed → completed/approved`；真实 DSH SDK + 本地 mock 模型成功加载 lumi persona。命名规范化后，9 个测试文件与迁移前代码逐字相同，未减少或弱化断言。

`PA_*`、`data/assistant.db`、`personal-assistant` capability ID、`pa-` 会话前缀保持兼容，无数据库迁移。本次没有实现 SPEC-0001 或执行真实云模型/外部业务任务。范围、命令、证据及工具限制见 [SPEC-0002](../specs/0002-lumi-workspace/spec.md)，复用步骤见 [工程整理 SOP](runbooks/workspace-layout.md)。

## 2026-09-25 · DSH 中心架构设计

[v0.3 六图方案](design/10-dsh-centered-architecture.md) 与 [ADR-003](adr/0003-dsh-centered-harness.md) 细化 DSH 核心 Harness、Cordis 接线与单权威 Host 的多端路线。核对了固定发行版 `0.1.7-rc.1` 的 SDK、tools、schedule、MCP 接口；SDK 无逐 session 取消/反向审批回调，工具 guard 为同步判断，会话 schedule 不能承担冷会话唤醒。

本次仅新增设计、图源及飞书审阅投影，没有修改业务源码、依赖、数据库或运行 profile。上文缺口仍然存在；原设计中的通用 plugin-host 不再作为待建模块，改为复用 DSH/Cordis 并补 lumi 桥接服务。验证范围见 [SPEC-0003 证据](../specs/0003-dsh-centered-design/evidence.md)。

## 2026-09-25 · DSH 上游源码分析

对上游固定提交 `477b4f420553e8a52c2fbccc464d7561b239c443`（根版本 `0.1.7-rc.2`）完成源码、配置及代表性测试的静态审读，见 [分析报告](research/2026-09-25-dsh-source-analysis.md)。lumi 仍固定 rc.1；本次没有安装或运行 rc.2，也没有改变运行能力。

版本差异：rc.2 的 Schedule 已有 Host 持久任务与冷会话恢复，Web 默认关闭，Session 写入与投递回执仍非同一原子事务。上文“schedule 不能承担冷会话唤醒”仅适用于已检查的 rc.1。后续应先评估新版复用与显式迁移。

公共 SDK 仍只有 initialize、session/prompt、shutdown 三个请求；内部 Agent 接口则有更丰富的取消、输入与恢复控制。实验语音输入是录音后转写到草稿，尚非实时双向语音。后续产品讨论将 DSH 定位为复杂任务主要 Harness，实时交互、感知和物理控制保留独立运行时空间；这项认识尚未实施为新架构。

## 状态标注规则

`Proposed`：设计建议；`Specified`：验收和边界已写清；`Implemented`：代码存在；`Verified`：指定环境和版本有证据；`Enabled`：部署配置已启用。后一个状态不能由前一个自动推断。

能力清单应同时记录实现状态、验证级别、部署启用和授权范围。新测试或新部署产生新记录，不能覆盖旧版本失败史。
