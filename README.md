# lumi

`lumi` 是面向长期成长的超级个人智能体，名字取意于与“光”有关的词根，短、具有未来感。

当前处于第一阶段 MVP，重点是持久化、可审计的任务闭环；运行中任务尚不能在进程重启后自动恢复。

长期方案与后续建设入口：[设计总纲](docs/design/00-overview.md)、[文档导航](docs/README.md)、[Agent 指南](AGENTS.md)、[首个 SDD 规范](specs/0001-action-boundary/spec.md)。设计为 Proposed，已实现与未实现的边界见 [工程事实基线](docs/current-state.md)。

## 当前能力

- CLI 与 HTTP 共用同一份 `TaskRequest`、Assistant Core 和 SQLite Task Ledger。
- 任务状态覆盖 `queued`、`running`、`waiting_approval`、`completed`、`failed`、`cancelled`。
- 规则路由可将编程请求委派给 `coding-agent`。
- 规则识别出的外部发送、支付、删除和设备控制等高风险任务进入显式审批；尚无工具动作级强制门禁。
- 任务事件、工具调用摘要、审批动作和执行结果可查询，服务重启后仍保留。
- DSH 通过独立 adapter 接入，固定为 `0.1.7-rc.1`；核心层不导入 DSH。
- 默认通过 DSH SDK 执行；`PA_EXECUTOR=mock` 仅用于离线开发和故障隔离。

## 架构

```text
CLI / HTTP
    |
Gateway normalization
    |
Assistant Core
  |-- Router -> Capability Registry
  |-- Policy -> Approval gate
  |-- Task Ledger -> SQLite
  `-- TaskExecutor interface
          |
          `-- adapters/dsh -> DSH TypeScript SDK subprocess
```

主要目录：

```text
apps/gateway/                  HTTP API
apps/local-runner/             CLI
apps/runtime/                  Composition root
packages/contracts/            Stable domain contracts
packages/assistant-core/       Task lifecycle and orchestration
packages/task-ledger/          SQLite persistence
packages/policy/               Risk classification and approval policy
packages/capability-registry/  Capability discovery and routing
packages/personal-memory/      Explicit candidate/confirm/retract model
adapters/dsh/                  DSH-only types and event mapping
profiles/dsh-lumi/             lumi DSH SDK profile overlay
tests/contract/                Cross-module DSH runtime contracts
```

每个模块的生产代码放在 `src/`，测试放在同级 `tests/`，例如 `packages/assistant-core/{src,tests}/`。跨模块测试放在根 `tests/` 下，按 contract、integration 等用途逐步扩展。内部包统一使用 `@lumi/*`，模块目录按职责命名。详见 [测试约定](tests/README.md)。

打开 [lumi.code-workspace](lumi.code-workspace) 可将编辑器工作区显示为 `lumi`，并隐藏 `node_modules`、构建和覆盖率目录。当前磁盘根目录保留原路径，避免已有工具路径失效。

本仓使用 pnpm：依赖共享存放在根 `node_modules/.pnpm`，各模块的 `node_modules` 主要是链接，不是每个模块都重复保存完整依赖。保留这种隔离结构有助于检查模块是否正确声明依赖；无需手动删除或合并。

## 环境

- Node.js `>=22.19.0`
- pnpm `10.20.0`

```bash
corepack enable
pnpm install
pnpm check
```

若内部 npm 镜像缺少 DSH 的预发布传递依赖，可显式使用公开源：

```bash
pnpm install --registry=https://registry.npmjs.org
```

## CLI

默认数据文件是 `./data/assistant.db`，默认 executor 是 `dsh`。使用真实 DSH 前需要配置模型凭据。

命名调整保留了 `PA_*` 环境变量、默认数据路径、`personal-assistant` capability ID 和 `pa-` 会话前缀，以兼容已有配置与任务记录。更新本次版本后运行 `pnpm install` 刷新包链接；自行引用旧 profile 的脚本需要改用 `profiles/dsh-lumi/`。

仅验证个人助手控制层时，可显式切换到 mock：

```bash
PA_EXECUTOR=mock pnpm cli -- submit "总结今天的工作"
```

真实 DSH：

```bash
pnpm cli -- submit "总结今天的工作"
pnpm cli -- submit "实现一个 TypeScript API"
pnpm cli -- list
pnpm cli -- get <task-id>
pnpm cli -- events <task-id>
pnpm cli -- audit <task-id>
```

高风险任务会停在 `waiting_approval`：

```bash
pnpm cli -- submit "发送这份报告给团队" --id task-demo
pnpm cli -- approve task-demo
```

同一个 ID 只能绑定完全相同的任务请求，冲突复用会被拒绝。当前比较包含 `createdAt`，CLI 重新提交会生成新时间，因此仅复用 `--id` 不保证重传成功；语义幂等修正列入首个 SDD 规范。

## HTTP

```bash
pnpm dev
```

服务默认监听 `http://127.0.0.1:4310`。

```bash
curl -sS http://127.0.0.1:4310/v1/tasks \
  -H 'content-type: application/json' \
  -d '{
    "id": "task-http-demo",
    "actorId": "local-user",
    "channel": "http",
    "content": "实现一个 TypeScript API"
  }'

curl -sS http://127.0.0.1:4310/v1/tasks/task-http-demo/events
curl -sS http://127.0.0.1:4310/v1/tasks/task-http-demo/audit
```

端点：

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | 健康检查 |
| `GET` | `/v1/capabilities` | 能力列表 |
| `POST` | `/v1/tasks` | 提交并执行任务 |
| `GET` | `/v1/tasks` | 查询任务列表 |
| `GET` | `/v1/tasks/:id` | 查询任务和审批状态 |
| `GET` | `/v1/tasks/:id/events` | 查询状态与执行事件 |
| `GET` | `/v1/tasks/:id/audit` | 查询审计记录 |
| `POST` | `/v1/tasks/:id/approve` | 批准并继续执行 |
| `POST` | `/v1/tasks/:id/reject` | 拒绝执行 |
| `POST` | `/v1/tasks/:id/cancel` | 取消任务 |

当前 HTTP 提交会等待任务完成后返回。流式响应和 WebSocket 属于下一阶段。

## 接入真实 DSH

### MiniMax

当前 DSH 版本已经内置 MiniMax provider catalog。本仓只启用对应路由，不复制 MiniMax 的端点、协议或模型元数据。

中国区：

```bash
export MINIMAX_CN_API_KEY='<your-key>'
export PA_DSH_PROVIDER=minimax-cn
export PA_DSH_MODEL=MiniMax-M3
pnpm cli -- submit "分析当前仓库并运行测试"
```

国际区将变量改为 `MINIMAX_API_KEY`、provider 改为 `minimax`。未显式设置 `PA_DSH_PROVIDER` 时，runtime 也会根据这两个 Key 自动选择对应 MiniMax provider。

### DeepSeek

```bash
export PA_EXECUTOR=dsh
export PA_DSH_PROVIDER=deepseek-official
export PA_DSH_MODEL=deepseek-v4-flash
export PA_DSH_MAX_TOKENS=8192

pnpm cli -- submit "分析当前仓库并运行测试"
```

DSH 凭据由 DSH 自己的配置或环境变量提供。默认 DSH home 是 `./data/dsh`，可通过 `PA_DSH_HOME` 覆盖；adapter 每个任务启动一个独立 SDK runtime，使运行中取消能够回收对应子进程。启动时会应用
[`profiles/dsh-lumi/cordis.patch.yml`](profiles/dsh-lumi/cordis.patch.yml)
或 [`profiles/dsh-coding/cordis.patch.yml`](profiles/dsh-coding/cordis.patch.yml)。

`pnpm test:dsh` 是不需要真实凭据的 DSH runtime contract test：它启动真正的 DSH SDK 子进程，通过官方本地模拟模型端点完成整条任务链，并验证 MiniMax catalog 可以完成 SDK 初始化。该测试也包含在 `pnpm test` 中。真实提供方 smoke 仍需对应的 API Key。

上游依赖和升级规则见 [`docs/upstream-strategy.md`](docs/upstream-strategy.md)。

### 其他兼容 API

DSH 支持通过 `llm-pi-ai` 配置 OpenAI Chat Completions、OpenAI Responses 或 Anthropic Messages 兼容端点。将 provider patch 放在仓库外或 `profiles/providers/` 下，然后设置：

```bash
export PA_DSH_PROVIDER=my-provider
export PA_DSH_MODEL=my-model
export PA_DSH_PROVIDER_PATCH=profiles/providers/my-provider.patch.yml
```

因此使用 npm 包不会限制模型 API 切换；provider 配置属于 profile 层，与 DSH 源码和 Assistant Core 都是分离的。

## 直接与 DSH 对话

启动 DSH 自带的 Web UI：

```bash
pnpm dsh:web:minimax-cn
```

打开命令输出的带 `token` 本地 URL，在模型设置中选择 `minimax-cn / MiniMax-M3` 后即可连续对话。这条链路用于直接验证 DSH，会使用 DSH 自己的会话存储，不经过 lumi Task Ledger。

当前 lumi Gateway 是单任务接口：每次 `POST /v1/tasks` 都是独立任务，尚未提供多轮会话 API。

## 安全边界

- Gateway 默认只监听 loopback；当前版本没有远程身份认证，不应直接暴露到公网。
- 被任务级规则识别为 `external` 和 `critical` 的任务在执行前进入审批；审批尚未绑定执行中产生的具体工具参数，不能据此认定所有危险工具动作均被阻止。
- 工具审计只保存工具名、调用 ID 和成功状态，不复制参数或返回正文。
- Personal Memory 当前只提供显式候选、确认和撤回模型，不会自动从对话写入长期记忆。

## 暂未实现

- WebSocket/A2A 流式协议
- lumi 多轮会话协议
- 自动重试与跨进程运行中任务恢复
- Desktop、Mobile、Watch、Voice 客户端
- 自动长期记忆写入
- 无人确认的外部发送、支付、删除和设备控制
