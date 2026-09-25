# lumi

`lumi` 是面向长期成长的超级个人智能体，名字取意于与“光”有关的词根，短、具有未来感。

本地单 owner `v0.1` MVP 已完成一次总体验收，重点是持久化、可审计的任务闭环、可解释的单机重启恢复和本地提醒；验收范围与未完成边界见 [MVP 验收记录](docs/evidence/2026-09-25-mvp-acceptance.md)。

长期方案与后续建设入口：[设计总纲](docs/design/00-overview.md)、[文档导航](docs/README.md)、[Agent 指南](AGENTS.md)、[首个 SDD 规范](specs/0001-action-boundary/spec.md)。设计为 Proposed，已实现与未实现的边界见 [工程事实基线](docs/current-state.md)。

## 当前能力

- CLI 与 HTTP 共用同一份 `TaskRequest`、Assistant Core 和 SQLite Task Ledger。
- 任务状态覆盖 `queued`、`running`、`waiting_approval`、`interrupted`、`reconciling`、`completed`、`failed`、`cancelled`。
- 规则路由可将编程请求委派给 `coding-agent`。
- 规则识别出的外部发送、支付、删除和设备控制等高风险任务进入任务级审批。
- v2 动作 API 对一个受控 `artifact.write` 能力执行参数摘要绑定、一次性授权、原子额度消费、独占文件创建、读回核验和崩溃后显式对账。
- `personal-assistant` 的 DSH profile 通过每 Run loopback bridge 提议/执行同一 v2 Action；未知工具以及直接文件写、Shell、网络、workflow/`run_code` 在工具主体前失败关闭。
- 结构化研究简报接收 1-8 个用户声明的公开 HTTPS 来源；`research-agent` 只能抓取本次 Task 绑定的 URL，保存不可变来源快照，并在全部来源已抓取且 source ID 引用覆盖通过后完成。
- 结构化会议准备接收主题、目标、参与者、议程和背景；`meeting-agent` 不获得 Host 工具，只有固定六段简报通过确定性结构校验后才完成。
- 个人记忆支持 SQLite 持久化、候选确认、纠正、撤回和彻底遗忘；任务只注入 owner、用途、scope 和分级均匹配的已确认 public/personal 记录。
- 本地 Web 工作台提供任务、动作、记忆和提醒四个视图；用户可管理个人记忆与本地通知，或审阅参数摘要、授权/取消动作并读取回执和独立验证。
- Gateway 使用本地 Bearer token 派生 owner/principal；请求体中的 `actorId` 不能用于切换身份。
- 任务事件、工具调用摘要、审批动作和执行结果可查询，服务重启后仍保留。
- runtime 启动会续调度尚未开始的普通 queued Task；遗留 running Task 转为 interrupted，只有确定性规则判定无副作用风险时才允许用户显式创建新的重试 Task。
- executing / outcome_unknown Action 在重启后进入 reconciling，只能读回对账；本机 PID 所有权会阻止另一个仍存活的 runtime 被误判为崩溃。
- 一次性提醒持久保存绝对触发时间、IANA timezone、幂等键和 `latest / skip` 误点策略；在线到点或启动补发只生成一条本地通知，可在 Workbench/CLI 确认。
- DSH 通过独立 adapter 接入，固定为 `0.1.7-rc.1`；核心层不导入 DSH。
- 默认通过 DSH SDK 执行；`PA_EXECUTOR=mock` 仅用于离线开发和故障隔离。

## 架构

```text
CLI / HTTP / Workbench
          |
     apps/runtime
  (composition root)
    |-- Identity
    |-- Assistant Core + workflows
    |     `-- TaskExecutor port -> adapters/dsh -> DSH subprocess
    |-- ActionService
    |     `-- ArtifactProvider port -> adapters/local-artifact
    |-- Task Ledger + Recovery
    |-- Personal Memory
    `-- Reminders + local Notification inbox
```

主要目录：

```text
apps/gateway/                  HTTP API
apps/local-runner/             CLI
apps/runtime/                  Composition root
packages/contracts/            Stable domain contracts
packages/assistant-core/       Task lifecycle and orchestration
packages/task-ledger/          SQLite persistence
packages/task-recovery/        Restart classification and explicit recovery
packages/policy/               Risk classification and approval policy
packages/capability-registry/  Capability discovery and routing
packages/personal-memory/      Persistent memory lifecycle and bounded context
packages/reminders/            One-time scheduling and local notification inbox
packages/meeting-workflow/     Meeting input normalization and structure verification
packages/research-workflow/    Research submission, source records, citation verification
adapters/dsh/                  DSH-only types and event mapping
adapters/research-sources/     Public HTTPS fetch and immutable source snapshots
profiles/dsh-lumi/             lumi DSH SDK profile overlay
profiles/dsh-meeting/          Protected meeting preparation profile
profiles/dsh-research/         Protected public-source research profile
tests/contract/                Cross-module DSH runtime contracts
```

每个模块的生产代码放在 `src/`，模块自有测试放在同级 `tests/`，使测试跟随包的所有权、依赖和删除生命周期；不是把测试混回生产源码。只有 contract、integration、e2e 等跨模块场景放在根 `tests/`。内部包统一使用 `@lumi/*`，模块目录按职责命名。详见 [测试约定](tests/README.md)。

运行数据库、缓存、隔离验证与发布草稿统一位于 `data/`，不属于工程源码；具体保留和清理边界见 [本机数据目录](data/README.md)。根目录不保留生成的 `draft_*_folder`。

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

`pnpm check` 包含架构边界、lint、typecheck、DSH 版本对齐、Vitest 和生产构建。

若内部 npm 镜像缺少 DSH 的预发布传递依赖，可显式使用公开源：

```bash
pnpm install --registry=https://registry.npmjs.org
```

## CLI

默认数据文件是 `./data/assistant.db`，默认 executor 是 `dsh`。使用真实 DSH 前需要配置模型凭据。

命名调整保留了 `PA_*` 环境变量、默认数据路径、`personal-assistant` capability ID 和 `pa-` 会话前缀，以兼容已有配置与任务记录。更新本次版本后运行 `pnpm install` 刷新包链接；自行引用旧 profile 的脚本需要改用 `profiles/dsh-lumi/`。

仅验证个人助手控制层时，可显式切换到 mock：

```bash
PA_EXECUTOR=mock pnpm cli submit "总结今天的工作"
```

真实 DSH：

```bash
pnpm cli submit "总结今天的工作"
pnpm cli submit "实现一个 TypeScript API"
pnpm cli research "比较这两个方案" \
  --source https://example.com/a \
  --source https://example.com/b
pnpm cli meeting "季度路线评审" \
  --objective "确定下一季度三项优先级" \
  --participant "产品负责人" \
  --participant "研发负责人" \
  --agenda "回顾目标" \
  --agenda "确认优先级"
pnpm cli memory add "偏好直接、明确的判定规则" \
  --kind preference \
  --scope global \
  --purpose general_assistance
pnpm cli memory list
pnpm cli memory correct <memory-id> "仅在编程任务中偏好决策表" \
  --scope coding \
  --purpose coding
pnpm cli memory retract <memory-id>
pnpm cli memory forget <memory-id>
pnpm cli recovery list --status pending
pnpm cli recovery get <recovery-id>
pnpm cli recovery retry <recovery-id>
pnpm cli recovery acknowledge <recovery-id>
pnpm cli reminder add "检查发布状态" \
  --at 2026-09-26T09:00:00+08:00 \
  --timezone Asia/Shanghai \
  --key release-check
pnpm cli reminder list
pnpm cli reminder cancel <reminder-id>
pnpm cli notification list --status unread
pnpm cli notification acknowledge <notification-id>
pnpm cli list
pnpm cli get <task-id>
pnpm cli events <task-id>
pnpm cli audit <task-id>
```

高风险任务会停在 `waiting_approval`：

```bash
pnpm cli submit "发送这份报告给团队" --id task-demo
pnpm cli approve task-demo
```

受控本地产物使用独立的 v2 动作命令。正文进入动作输入存储，不进入普通审计日志；目标只能是 artifact ID，不能传文件路径：

```bash
pnpm cli action prepare daily-note "verified content" --key daily-note-001
pnpm cli action authorize <action-id>
pnpm cli action execute <action-id>
pnpm cli action get <action-id>
pnpm cli action reconcile <action-id>
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
| `GET` | `/v2/recoveries`、`/v2/recoveries/:id` | 查询当前 principal 的重启恢复记录 |
| `POST` | `/v2/recoveries/:id/retry` | 为允许重试的 interrupted Task 创建唯一替代 Task |
| `POST` | `/v2/recoveries/:id/acknowledge` | 确认已人工检查不可自动重试的中断 |
| `POST`、`GET` | `/v2/reminders` | 创建或列出一次性提醒 |
| `GET` | `/v2/reminders/:id` | 读取当前 principal 的提醒 |
| `POST` | `/v2/reminders/:id/cancel` | 取消尚未触发的提醒 |
| `GET` | `/v2/notifications`、`/v2/notifications/:id` | 查询本地通知收件箱 |
| `POST` | `/v2/notifications/:id/acknowledge` | 确认一条本地通知 |
| `POST`、`GET` | `/v2/memories` | 创建或列出当前 owner 的个人记忆 |
| `GET` | `/v2/memories/:id` | 读取当前 owner 的一条记忆 |
| `POST` | `/v2/memories/:id/confirm` | 确认候选记忆 |
| `POST` | `/v2/memories/:id/correct` | 纠正正文或适用边界并递增 revision |
| `POST` | `/v2/memories/:id/retract` | 撤回记忆并停止后续检索 |
| `DELETE` | `/v2/memories/:id` | 删除正文并建立最小 tombstone |
| `POST` | `/v2/workflows/research-brief` | 提交绑定公开 HTTPS 来源的研究简报 |
| `POST` | `/v2/workflows/meeting-brief` | 提交结构化会议准备简报 |

当前 HTTP 提交会等待任务完成后返回。流式响应和 WebSocket 属于下一阶段。

## Web 工作台

电脑端入口位于 `apps/workbench`。任务视图提供普通任务、研究简报和会议准备三种 composer 模式、状态与结果查看、任务级审批、取消、事件和审计记录；interrupted Task 会展示服务端恢复判定，只有 `retry_available` 才能创建新 Task。研究模式要求逐行填写公开 HTTPS 来源，会议模式收集主题、目标、参与者、议程和背景，并把已验证结果渲染为六个简报分区。动作视图列出 DSH 或 API 提议的受控 Action，展示目标、参数摘要、期限、授权、回执和 verification，并按服务端状态提供授权、执行、取消或对账；重启后的不确定 Action 仍只允许对账。记忆视图提供状态筛选、用途/scope/分级设置、确认、纠正、撤回和二次确认遗忘。提醒视图提供一次性时间、误点策略、计划状态和本地通知确认。它只调用 lumi Gateway，不直接连接 DSH、数据库、source snapshot 或 artifact 目录。

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
pnpm cli submit "分析当前仓库并运行测试"
```

国际区将变量改为 `MINIMAX_API_KEY`、provider 改为 `minimax`。未显式设置 `PA_DSH_PROVIDER` 时，runtime 也会根据这两个 Key 自动选择对应 MiniMax provider。

### DeepSeek

```bash
export PA_EXECUTOR=dsh
export PA_DSH_PROVIDER=deepseek-official
export PA_DSH_MODEL=deepseek-v4-flash
export PA_DSH_MAX_TOKENS=8192

pnpm cli submit "分析当前仓库并运行测试"
```

DSH 凭据由 DSH 自己的配置或环境变量提供。默认 DSH home 是 `./data/dsh`，可通过 `PA_DSH_HOME` 覆盖；adapter 每个任务启动一个独立 SDK runtime，使运行中取消能够回收对应子进程。启动时会应用
[`profiles/dsh-lumi/cordis.patch.yml`](profiles/dsh-lumi/cordis.patch.yml)
或 [`profiles/dsh-coding/cordis.patch.yml`](profiles/dsh-coding/cordis.patch.yml)。

`personal-assistant` profile 会加载 [`plugins/dsh-action-bridge`](plugins/dsh-action-bridge)。插件启动后先向本 Run 的短期 bridge 完成认证握手；握手缺失时 adapter 在发送首个模型请求前失败。DSH 子进程不继承 `PA_*` 或旧 bridge 变量，不能取得 Gateway Bearer token。

`research-agent` 使用独立的 [`profiles/dsh-research/cordis.patch.yml`](profiles/dsh-research/cordis.patch.yml)。该 Run 只注册 `lumi_public_web_fetch`，不注册 Action 工具；Host 对 URL 做精确 Task allowlist、HTTPS/DNS 公网地址、重定向、大小、类型与超时检查。来源快照默认位于 `data/research/sources`，可用 `PA_RESEARCH_ROOT` 覆盖。

`meeting-agent` 使用独立的 [`profiles/dsh-meeting/cordis.patch.yml`](profiles/dsh-meeting/cordis.patch.yml)。该 Run 加载同一 protected guard 和启动握手，但 Action 与 research 均关闭，因此不注册任何 lumi Host tool；输出必须满足 `lumi.meeting-brief/v1` 的首尾 marker、六个固定标题及非空段落，Host verifier 通过后 Task 才完成。

DSH 准备动作后不会自动授权或执行。用户通过 `action get/authorize` 审阅并批准；后续任务必须显式携带同一个 Action 引用：

```bash
pnpm cli action get <action-id>
pnpm cli action authorize <action-id>
pnpm cli submit "执行我已批准的动作" --context "lumi-action:<action-id>"
```

也可以继续使用 `pnpm cli action execute <action-id>` 直接走确定性的 Host 路径。两条路径都消费同一份参数绑定授权和 Verification。

`pnpm test:dsh` 是不需要真实凭据的 DSH runtime contract test：它启动真正的 DSH SDK 子进程，通过官方本地模拟模型端点验证 coding 兼容、MiniMax catalog、插件握手、Action prepare/execute、research source capture/citation、meeting structure verification，以及 `write`/`bash`/`web_fetch` 旁路阻断。该测试也包含在 `pnpm test` 中。真实提供方 smoke 仍需对应的 API Key。

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
- `research-agent` 不开放 DSH 通用网络；只读用户声明的公开 HTTPS 来源，拒绝 URL 凭据、非 443 端口、IP literal、私网/保留 DNS 结果、超限响应和非 UTF-8 文本。网页内容仍是不可信数据，引用覆盖不等于事实真实性验证。
- `coding-agent` 仍是本机开发态宽权限 profile；它不属于生产动作边界，不能持有真实 Connector 凭据。进程内 guard 也不是对恶意插件或同机进程的 OS 沙箱。
- 受控 profile 仍能读取 workspace 内允许的资料；敏感读取、模型出境和通用 secret store 尚未完成。
- 工具审计只保存工具名、调用 ID 和成功状态，不复制参数或返回正文。
- Personal Memory 只保存用户通过可信入口显式提交的记录，不会自动从对话写入；candidate、retracted、sensitive 和 secret 不会自动进入模型。当前 SQLite 正文尚无字段级加密。

## 暂未实现

- WebSocket/A2A 流式协议
- lumi 多轮会话协议
- 自动重试与跨进程运行中任务恢复
- Desktop、Mobile、Watch、Voice 客户端
- 自动长期记忆写入
- 语义/向量记忆检索、冲突合并和跨设备同步
- 搜索引擎、登录态网页、JavaScript 渲染和跨站爬取
- 无人确认的外部发送、支付、删除和设备控制
