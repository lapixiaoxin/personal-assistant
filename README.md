# lumi

`lumi` 是面向长期成长的超级个人智能体，名字取意于与“光”有关的词根，短、具有未来感。

当前处于第一阶段 MVP，重点是持久化、可审计的任务闭环；运行中任务尚不能在进程重启后自动恢复。

长期方案与后续建设入口：[设计总纲](docs/design/00-overview.md)、[文档导航](docs/README.md)、[Agent 指南](AGENTS.md)、[首个 SDD 规范](specs/0001-action-boundary/spec.md)。设计为 Proposed，已实现与未实现的边界见 [工程事实基线](docs/current-state.md)。

## 当前能力

- CLI 与 HTTP 共用同一份 `TaskRequest`、Assistant Core 和 SQLite Task Ledger。
- 任务状态覆盖 `queued`、`running`、`waiting_approval`、`completed`、`failed`、`cancelled`。
- 规则路由可将编程请求委派给 `coding-agent`。
- 规则识别出的外部发送、支付、删除和设备控制等高风险任务进入任务级审批。
- v2 动作 API 对一个受控 `artifact.write` 能力执行参数摘要绑定、一次性授权、原子额度消费、独占文件创建、读回核验和崩溃后显式对账。
- `personal-assistant` 的 DSH profile 通过每 Run loopback bridge 提议/执行同一 v2 Action；未知工具以及直接文件写、Shell、网络、workflow/`run_code` 在工具主体前失败关闭。
- 本地 Web 工作台提供任务与动作双视图；用户可审阅参数摘要、授权或取消动作、执行已授权动作，并读取回执和独立验证。
- Gateway 使用本地 Bearer token 派生 owner/principal；请求体中的 `actorId` 不能用于切换身份。
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

受控本地产物使用独立的 v2 动作命令。正文进入动作输入存储，不进入普通审计日志；目标只能是 artifact ID，不能传文件路径：

```bash
pnpm cli -- action prepare daily-note "verified content" --key daily-note-001
pnpm cli -- action authorize <action-id>
pnpm cli -- action execute <action-id>
pnpm cli -- action get <action-id>
pnpm cli -- action reconcile <action-id>
```

`execute` 只消费一次授权并在独立读回通过后完成关联任务。若文件可能已经写入但回执未提交，动作保持不确定状态，必须运行 `reconcile`，不能再次执行。

同一个 ID 只能绑定完全相同的任务请求，冲突复用会被拒绝。当前比较包含 `createdAt`，CLI 重新提交会生成新时间，因此仅复用 `--id` 不保证重传成功；语义幂等修正列入首个 SDD 规范。

## HTTP

```bash
export PA_HTTP_TOKEN="$(openssl rand -hex 32)"
pnpm dev
```

服务默认监听 `http://127.0.0.1:4310`。

```bash
curl -sS http://127.0.0.1:4310/v1/tasks \
  -H "authorization: Bearer $PA_HTTP_TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "id": "task-http-demo",
    "actorId": "local-user",
    "channel": "http",
    "content": "实现一个 TypeScript API"
  }'

curl -sS http://127.0.0.1:4310/v1/tasks/task-http-demo/events \
  -H "authorization: Bearer $PA_HTTP_TOKEN"
curl -sS http://127.0.0.1:4310/v1/tasks/task-http-demo/audit \
  -H "authorization: Bearer $PA_HTTP_TOKEN"
```

除 `/health` 和 Workbench 静态资源外，API 均要求 `Authorization: Bearer <token>`。默认 owner/principal 为 `local-owner/local-user`，可通过 `PA_OWNER_ID`、`PA_PRINCIPAL_ID` 配置；Gateway 不记录 token。

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
| `POST` | `/v2/actions` | 准备受控动作 |
| `GET` | `/v2/actions`、`/v2/actions/:id` | 查询当前 principal 的动作 |
| `POST` | `/v2/actions/:id/authorize` | 授予一次性参数绑定授权 |
| `POST` | `/v2/actions/:id/execute` | 执行动作并读回核验 |
| `POST` | `/v2/actions/:id/reconcile` | 对账不确定结果 |
| `POST` | `/v2/actions/:id/cancel` | 撤销未执行动作或记录剩余影响 |

当前 HTTP 提交会等待任务完成后返回。流式响应和 WebSocket 属于下一阶段。

## Web 工作台

电脑端入口位于 `apps/workbench`。任务视图提供任务提交、状态与结果查看、任务级审批、取消、事件和审计记录；动作视图列出 DSH 或 API 提议的受控 Action，展示目标、参数摘要、期限、授权、回执和 verification，并按服务端状态提供授权、执行、取消或对账。它只调用 lumi Gateway，不直接连接 DSH、数据库或 artifact 目录。

开发时分别启动 Gateway 和 Vite：

```bash
# 终端一
PA_EXECUTOR=mock pnpm dev

# 终端二
pnpm dev:web
```

打开 `http://127.0.0.1:4311/#token=<PA_HTTP_TOKEN>`。Vite 同时代理 `/v1`、`/v2` 和 `/health`。页面会移除 fragment 并仅在当前 tab 的 `sessionStorage` 保存 token。根目录 `.env` 会由 CLI 和 Gateway 自动加载；不要将密钥提交到仓库。

生产方式先构建，再由 Gateway 同源托管：

```bash
pnpm build
PA_EXECUTOR=mock pnpm start
```

打开 `http://127.0.0.1:4310/#token=<PA_HTTP_TOKEN>`。将 `PA_EXECUTOR=mock` 移除或改为 `dsh` 后使用配置好的真实模型。当前 Gateway 仍只应监听 loopback。

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

`personal-assistant` profile 会加载 [`plugins/dsh-action-bridge`](plugins/dsh-action-bridge)。插件启动后先向本 Run 的短期 bridge 完成认证握手；握手缺失时 adapter 在发送首个模型请求前失败。DSH 子进程不继承 `PA_*` 或旧 bridge 变量，不能取得 Gateway Bearer token。

DSH 准备动作后不会自动授权或执行。用户通过 `action get/authorize` 审阅并批准；后续任务必须显式携带同一个 Action 引用：

```bash
pnpm cli -- action get <action-id>
pnpm cli -- action authorize <action-id>
pnpm cli -- submit "执行我已批准的动作" --context "lumi-action:<action-id>"
```

也可以继续使用 `pnpm cli -- action execute <action-id>` 直接走确定性的 Host 路径。两条路径都消费同一份参数绑定授权和 Verification。

`pnpm test:dsh` 是不需要真实凭据的 DSH runtime contract test：它启动真正的 DSH SDK 子进程，通过官方本地模拟模型端点验证 coding 兼容、MiniMax catalog、插件握手、Action prepare/execute，以及 `write`/`bash` 旁路阻断。该测试也包含在 `pnpm test` 中。真实提供方 smoke 仍需对应的 API Key。

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

打开命令输出的带 `token` 本地 URL，在模型设置中选择 `minimax-cn / MiniMax-M3` 后即可连续对话。这条链路用于直接验证 DSH，会使用 DSH 自己的会话存储，不经过 lumi Task Ledger 或 Action Broker，因此不能用于携带生产权限的真实动作。

当前 lumi Gateway 是单任务接口：每次 `POST /v1/tasks` 都是独立任务，尚未提供多轮会话 API。

## 安全边界

- Gateway 默认只监听 loopback，并使用单 owner 的本地 Bearer token；这不是公网所需的多用户认证、TLS、限流或来源控制。
- `personal-assistant` 的固定 rc.1 profile 已将 `artifact.write` 接到参数级 Broker，并用显式 allowlist guard 阻断直接文件写、Shell、网络、MCP、workflow/`run_code` 和未知工具。
- `coding-agent` 仍是本机开发态宽权限 profile；它不属于生产动作边界，不能持有真实 Connector 凭据。进程内 guard 也不是对恶意插件或同机进程的 OS 沙箱。
- 受控 profile 仍能读取 workspace 内允许的资料；敏感读取、模型出境和通用 secret store 尚未完成。
- 工具审计只保存工具名、调用 ID 和成功状态，不复制参数或返回正文。
- Personal Memory 当前只提供显式候选、确认和撤回模型，不会自动从对话写入长期记忆。

## 暂未实现

- WebSocket/A2A 流式协议
- lumi 多轮会话协议
- 自动重试与跨进程运行中任务恢复
- Desktop、Mobile、Watch、Voice 客户端
- 自动长期记忆写入
- 无人确认的外部发送、支付、删除和设备控制
