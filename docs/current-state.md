# lumi 工程事实基线

采集日期：2026-09-24。范围：首次设计时的工作区源码与本机验证。当时分支为 `feat/initial-mvp`、尚无 commit，原工程文件均未跟踪。随后用户授权 Agent 托管版本管理，现已在 `main` 建立初始基线 `1cd54cc`；提交保留原业务源码，不把用户既有实现归为本次新增功能。后续按 `AGENTS.md` 主动提交已授权且验证完成的工作。

2026-09-25：本地单 owner `v0.1` 已完成总体验收；结论、综合证据和明确非目标见 [MVP 验收记录](evidence/2026-09-25-mvp-acceptance.md)。

2026-09-25：`main` 已首次推送到 `origin/main` 并建立 upstream。用户持续授权 Agent 在完成必要验证后主动 commit 并普通 push；force push、改写/删除远端历史、release/tag、部署和正式发布仍不在该授权内。

## 已观察的实现

| 项目 | 事实 | 证据 |
| --- | --- | --- |
| 语言和构建 | TypeScript、pnpm 10.20.0、Node >=22.19.0、tsup | 根 `package.json`、`.nvmrc` |
| 入口 | CLI 与 HTTP 通过 runtime 装配同一个 Core | `apps/local-runner`、`apps/gateway`、`apps/runtime` |
| 任务 | 八状态、任务提交、批准、拒绝、取消；含 interrupted/reconciling | `packages/contracts`、`packages/assistant-core` |
| 持久化 | SQLite 任务、事件、审批、审计，状态与对应迁移事件同事务 | `packages/task-ledger` |
| 路由 | 正则规则选 personal-assistant 或 coding-agent | `packages/capability-registry` |
| 策略 | 任务文字与 capability 风险等级判定，external/critical 需审批 | `packages/policy` |
| 执行 | DSH SDK 每任务独立子进程，支持 AbortSignal 取消 | `adapters/dsh` |
| 上游 | DSH/SDK/mock/tools 与插件 peer 精确固定 0.1.7-rc.2；提供显式 registry 新鲜度检查 | `upstream.lock.json`、`pnpm-lock.yaml`、`scripts/check-dsh-*.mjs` |
| 记忆 | SQLite 持久化、candidate/confirmed/retracted、纠正、遗忘 tombstone；领域包不依赖 Task 或 DSH | `packages/personal-memory` |
| 个性化上下文 | `personal-context/v1` 快照、digest、解析与渲染；当前 Task adapter 和外部 DSH bundle 消费 | `packages/personal-context`、`adapters/task-personal-context`、`plugins/dsh-lumi` |
| 恢复 | 单机 runtime 所有权、queued 续调度、running 中断判定、显式新 Task 重试与 Action 对账 | `packages/task-recovery`、`packages/task-ledger` |
| 提醒 | SQLite 一次性 trigger、latest/skip 误点处理、单 timer 与本地通知确认 | `packages/reminders`、`apps/runtime` |
| 工程检查 | lint、typecheck、架构边界、版本对齐、测试、构建 | `pnpm check`、`.github/workflows/ci.yml` |

## 必须明确的缺口

- 单机重启恢复已区分 queued 续调度、普通 running 中断与 Action 对账；仍没有模型检查点、分布式 worker lease/fencing 或跨设备接管，普通 running Task 不能原地 resume。
- HTTP 已使用本地 Bearer token 映射单 owner/principal 并执行对象归属检查；仍没有公网所需的多用户认证、TLS、限流与来源控制。
- v1 审批仍针对任务。v2 仅对受控 `artifact.write` 绑定具体参数摘要；`personal-assistant` DSH profile 已接入该 Broker 并阻断默认高风险工具，但 `coding-agent`、读取隔离、真实 Connector 和 OS 级沙箱尚未纳入。
- `operations` 列表进入提示词，不构成工具权限隔离。不能宣称“风险意图被识别”就等于“所有危险动作都被阻止”。
- v1 Core 收到执行器非空结果后仍可标记 completed；v2 `artifact.write` 已要求独立读回核验，其他任务尚无通用验收器。
- `TaskRecord.dshSessionId` 带有上游命名；需要兼容迁移到中性执行引用。
- 幂等比较含 `createdAt`；CLI 只重用 `--id` 会重新产生时间，不能据 README 推断任意重传成功。
- 记忆已接入 runtime / Gateway / CLI / Workbench，并已从 Task Harness 抽出版本化 context snapshot；仍只支持显式写入和确定性 purpose/scope 检索，没有自动抽取、语义索引、字段级加密或跨设备同步。
- 当前 coding-agent 是路由到另一份 DSH profile，不是已接入 A2A 的独立外部专家。
- 无产品级多轮会话；DSH Web UI 使用 DSH 会话，外部 lumi bundle P0 已验证装配但尚未切换现行服务。
- 尚无实时语音/TTS/打断、设备注册与同步、MCP/A2A adapter、周期/cron scheduler、外部通知推送、自动学习或自主发布。
- Task Ledger 已按 `user_version` 执行 v1→v2→v3 expand 迁移并记录 `migration_history`；自动 contract migration 和数据库回滚仍未实现。
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

## 2026-09-25 · 本地 Web 工作台

`apps/workbench` 已提供 React + Vite 单页工作台，通过现有 Gateway 提交和查询任务，显示结果、错误、事件与审计，并支持已有任务级审批、拒绝和取消。生产构建输出到 `dist/workbench`，Gateway 在产物存在时从同一 loopback 地址托管页面和哈希资源。

当前 Gateway 的提交与批准调用仍等待执行结束；页面以客户端 task ID 和并发轮询呈现中间状态。它不是产品级多轮对话或流式协议。该初始切片没有 Action、Memory 或 Recovery 操作面，后续已分别由 SPEC-0006、SPEC-0009 和 SPEC-0010 补齐；远程身份和真实工作工具仍未实现。

验证包括 Vitest API/组件/静态托管测试，以及 Playwright 在桌面 Chrome 和移动 Chromium 视口上的 mock 任务与审批流程；细节见 [SPEC-0004 证据](../specs/0004-web-workbench/evidence.md) 和 [Workbench SOP](runbooks/web-workbench.md)。

## 2026-09-25 · 最小可信动作闭环

`SPEC-0001` 已实现单 owner 本地身份、v2 Action/Authorization/Receipt/Verification 契约、SQLite v2 expand 迁移、一次性授权消费和一个受控 `artifact.write` provider。provider 只接收 artifact ID，使用服务端确定的文件名和独占硬链接提交，不接受任意路径或覆盖既有目标。

动作准备保存正文摘要和不可变参数；领取执行时在同一 SQLite 事务中重新计算正文/动作摘要、检查 capability 版本、有效期、撤销 epoch 并消费额度。文件成功但回执未提交时保留不确定状态，重启后通过确定性路径读回对账；只有摘要与回执均匹配的独立 Verification 才完成关联任务。

Gateway 的 `/v1` 与 `/v2` 数据端点现在要求 `PA_HTTP_TOKEN`，并以认证 principal 覆盖或校验旧 `actorId`。Workbench 从 URL fragment 读取 token 后只保存在当前浏览器会话。CLI 使用本机配置 principal，`--actor` 仅能断言同一身份。

本机验证包括 14 个测试文件、59 个测试（其中 DSH SDK contract 2 项）、桌面/移动 Playwright 2 项，以及独立 CLI/HTTP 真实文件写入、读回和清理。HTTP 观察值为准备约 5.1 ms、授权约 2.2 ms、执行及核验约 14.8 ms；单次 CLI 验收 SQLite 为 128 KiB。精确命令与边界见 [SPEC-0001 证据](../specs/0001-action-boundary/evidence.md) 和 [动作门禁 SOP](runbooks/action-boundary.md)。

SPEC-0001 单独不证明 DSH Shell、网络、MCP 或外部 connector 已受参数级控制，也没有启用真实外部写入。固定 DSH 版本保持 `0.1.7-rc.1`；后续 personal profile 接线见下一节。

## 2026-09-25 · DSH Action Bridge

`SPEC-0005` 将 `personal-assistant` 的固定 DSH `0.1.7-rc.1` profile 接到既有 ActionService。每个 Run 启动独立的 `127.0.0.1` bridge，使用 32-byte 随机 token，并只允许执行 Task `contextRefs` 中显式携带的 `lumi-action:<id>`。插件可准备 `artifact.write` 或执行已授权 Action；准备不会自动批准或落文件。

同一 Cordis 插件注册全局单调 guard，显式允许只读发现、内部协调和两个 lumi broker tool，其余工具默认拒绝。真实 SDK 子进程测试已证明 `write` 与 `bash` 在工具主体前返回错误且目标文件不存在；单元矩阵同时覆盖 `edit`、web、workflow、`run_code` 与未知 MCP 名称。插件必须向 Host 完成启动握手，否则 adapter 在首个模型请求前关闭 Run。

DSH 子进程环境会移除全部 `PA_*` 和旧 `LUMI_ACTION_BRIDGE_*` 变量，再注入本 Run bridge URL/token；Gateway Bearer token 未出现在 mock provider 请求。新增测试也修正了 adapter 对 rc.1 `tool/result.message.isError` 的识别。

边界仍然存在：该 guard 是受信 profile 内的进程内控制，不是恶意插件或同机进程隔离；`read`/`grep` 等仍可访问 workspace 授权范围；开发态 `coding-agent` 仍有文件、Shell 与网络工具，不能持有生产 Connector 凭据。真实外部写入尚未启用。

## 2026-09-25 · Workbench Action Inbox

`SPEC-0006` 在现有 Workbench 增加任务/动作双视图。动作列表和详情直接读取 Gateway `ActionDetail`，展示 target、operation、期限、input/action digest、Authorization、Receipt 和 Verification；不读取或显示动作正文。

页面严格按服务端状态提供命令：`prepared` 可授权/取消，`authorized` 可执行/取消，`outcome_unknown` 只可对账，终态不提供重试。命令完成后重新读取列表与详情，HTTP 成功本身不被当作动作成功证明。Vite 开发代理已覆盖 `/v2`。

本机验证包括 Workbench API/组件 15 项、全量仓库门禁及 Playwright 桌面/移动 4 个场景。浏览器通过真实 Gateway、Action Runtime、SQLite Ledger 和 local artifact provider 完成 prepare → authorize → execute → read-back verification；任务执行器仍为 mock，未调用真实模型或外部服务。细节见 [SPEC-0006 证据](../specs/0006-action-inbox/evidence.md) 和 [Workbench SOP](runbooks/web-workbench.md)。

## 2026-09-25 · 受控公开来源研究简报

`SPEC-0007` 新增结构化 research brief workflow。Workbench、Gateway `/v2/workflows/research-brief` 和 CLI `research` 接收问题及 1-8 个显式公开 HTTPS 来源，生成不可伪造的 workflow/source context refs，并路由到独立 `research-agent`。

研究 Run 只注册 `lumi_public_web_fetch`，不注册 Action 工具；原生 `web_fetch`/`web_search`、Shell、文件写和未知工具仍由单调 guard 关闭。Host 在实际 TLS 连接前校验每个重定向目标的 HTTPS 默认端口及全部 DNS 地址，只把已验证地址交给 Node lookup；同时限制 3 次重定向、10 秒、1 MiB、UTF-8 HTML/XHTML/plain text 和 50,000 字符规范化文本。

来源正文保存为 owner-only 的不可变 JSON snapshot，普通事件和审计只记录 URL、source ID、digest、ref 与截断状态。Research verifier 要求每个声明 URL 均有抓取事件，且最终结果引用全部 source ID；缺失时 Task 失败，不能用模型自报完成代替。

本机 `pnpm check` 通过 19 个测试文件、118 个用例，其中 9 个启动真实 DSH SDK 子进程；桌面/移动 Playwright 共 6 个场景通过。真实 MiniMax + `https://example.com/` 只读样本在约 7 秒内完成，生成 `source_b6884ffc9252983d798adc5a`，引用覆盖 verification passed；隔离数据库、DSH home 和 snapshot 已在取证后清理。该结果仅为 `verified_once`，不证明任意站点可读、来源事实正确或搜索/登录态网页可用。细节见 [SPEC-0007 证据](../specs/0007-research-brief/evidence.md) 和 [研究简报 SOP](runbooks/research-brief.md)。

## 2026-09-25 · 结构化会议准备简报

`SPEC-0008` 新增 meeting brief workflow。Workbench、Gateway `/v2/workflows/meeting-brief` 和 CLI `meeting` 结构化接收会议主题、目标、1-30 个参与者、1-20 个议程项和可选背景，生成 server-owned workflow marker 并优先路由到独立 `meeting-agent`；无 marker 的普通会议文字仍走既有路由。

meeting profile 加载同一 protected guard 与每 Run 启动握手，但 Action 和 research 能力均关闭，因此模型工具列表不包含三个 lumi Host tool。DSH 输出必须以 `lumi.meeting-brief/v1` 首尾 marker 包围，并依次包含 Objective、Participant Considerations、Agenda、Decisions and Questions、Risks and Preparation、Follow-ups 六个唯一非空段落；Host verifier 通过后 Core 才完成 Task。Workbench 隐藏协议 marker，将已验证结果渲染为六个中文标题分区。

本机 `pnpm check` 通过 20 个测试文件、139 个用例，其中 10 个启动真实 DSH SDK 子进程；桌面/移动 Playwright 共 8 个场景通过并确认无横向溢出或 console error。真实 MiniMax 使用不含个人和公司信息的虚构路线评审样本，在约 8.2 秒内生成中文六段简报；Task `task-meeting-live-smoke` completed，`meeting-brief-structure/1` verification passed，事件中没有工具调用。隔离数据库和 DSH home 已在取证后清理。

该结果为 `verified_once`，只证明固定样本、当前 profile 和提供方下的结构完整性，不证明建议事实正确、任意会议质量稳定或已接入日历/通讯录/会议文档。细节见 [SPEC-0008 证据](../specs/0008-meeting-brief/evidence.md) 和 [会议准备 SOP](runbooks/meeting-brief.md)。

## 2026-09-25 · 可控的持久个人记忆

`SPEC-0009` 将 `packages/personal-memory` 接入 runtime、Gateway、CLI 和 Workbench。当前记录使用稳定 memory ID 与递增 revision，支持显式创建 candidate/confirmed、确认、纠正、撤回和彻底遗忘；SQLite 主表只保存当前 revision，遗忘在同一事务删除正文并写入只含 owner、ID、旧摘要、revision 和时间的 tombstone。

Task 执行前的确定性检索按 owner、confirmed 状态、classification、allowed purpose、scope、最多 8 条和 6,000 字符预算过滤。只有 public/personal 可自动注入；candidate、retracted、sensitive 和 secret 不进入模型。注入是带 `lumi.personal-context/v1` marker 的临时 data block，不修改 Task Ledger 中的原请求或 workflow/Action context refs；`memory.context_attached` 事件只记录 ID、revision、purpose 和 count。

本机 `pnpm check` 通过 21 个测试文件、155 个用例，其中 10 个启动真实 DSH SDK 子进程；桌面/移动 Playwright 共 10 个场景通过。独立 CLI 进程验证跨重启的创建、确认、纠正和遗忘。真实 `minimax-cn / MiniMax-M3` 使用非敏感虚构偏好，在约 3.7 秒内返回唯一 token `LUMI_MEMORY_OK`，原 Task content 保持不变，事件无记忆正文；隔离数据库和 DSH home 已精确清理。

该结果为 `verified_once`。当前不会自动从对话抽取记忆，没有语义相关性排序、冲突合并、正文版本历史、字段级加密、备份删除传播或跨设备同步。`personal` 记录会发送给当前模型 provider；不应出境的内容应标为 sensitive/secret。细节见 [SPEC-0009 证据](../specs/0009-personal-memory/evidence.md) 和 [个人记忆 SOP](runbooks/personal-memory.md)。

## 2026-09-25 · 可解释的单机重启恢复

`SPEC-0010` 新增 `packages/task-recovery`、Task Ledger v3 expand migration 和 `runtime.ready` 启动屏障。普通 queued Task 在启动时续调度；Action queued 仍等待显式 execute。遗留 running Task 不原地回退到 queued，而是结束为 `interrupted` 并建立 owner/principal 范围的 Recovery。meeting/research 以及未观察到工具或 Action 迹象的 personal Task 可由用户显式创建唯一 replacement Task；coding-agent、未知 capability 和有工具迹象的任务只允许人工确认。

executing / outcome_unknown 以及已有回执但未验证的 Action Task 转为 `reconciling`。executing 同事务改为 outcome_unknown，授权仍为 consumed；后续只调用现有 provider read、摘要比对和 Verification，不重复 write。Gateway、CLI 和 Workbench 提供恢复查询、retry、acknowledge 与动作对账入口。

SQLite 保存单个本机 runtime ID 与 PID；仍存活的进程会阻止另一个入口把它的 running Task 误判为崩溃。该机制不是分布式 lease/fencing；PID 复用只会延迟恢复，跨主机共享数据库不在支持范围。真实子进程在 Task running 后经 `SIGKILL`，独立 CLI 随后识别 stale runtime 并创建 Recovery；桌面/移动 Workbench 可创建唯一 replacement Task。完整边界和命令见 [SPEC-0010 证据](../specs/0010-task-recovery/evidence.md) 与 [任务恢复 SOP](runbooks/task-recovery.md)。

## 2026-09-25 · 持久一次性提醒与本地通知

`SPEC-0011` 新增独立 `packages/reminders`。Reminder 保存 owner/principal、绝对 fireAt、IANA timezone、`latest / skip` 误点策略和幂等摘要；Notification 使用 Host 生成的 dedupe key。提醒终结与通知创建在同一 SQLite 事务中，重复 timer、重复启动和幂等重传不会产生第二条通知。

runtime owner 在线时只维护一个最早 timer；启动前错过的 latest 提醒补一条本地通知，skip 提醒明确终结为 skipped。检测到另一个活跃 runtime 时，临时 CLI 以 passive 模式访问已有数据，不启动第二个 scheduler，也不创建新提醒。提醒不创建 Task、不调用 DSH 或 Action。

Gateway、CLI 和 Workbench 支持创建/取消提醒、查看计划、读取和确认本地通知。本机真实 timer 与独立 CLI 进程 catch-up 已验证；`pnpm check` 通过 25 个测试文件、195 项，Playwright 桌面/320px 移动共 14 项通过。该能力不包含系统通知、移动 push、周期任务、自然语言时间解析、安静时间或离线唤醒。细节见 [SPEC-0011 证据](../specs/0011-reminders/evidence.md) 与 [提醒 SOP](runbooks/reminders.md)。

## 2026-09-25 · v0.1 架构与模块边界收敛

`SPEC-0012` 校正了长期 Proposed 设计与 v0.1 已实现能力之间的状态漂移，并以 [ADR-004](adr/0004-host-ownership-and-module-boundaries.md) 记录当前 Host 数据所有权：Task/Action/Recovery 的 SQLite 状态与跨对象事务仍由 `packages/task-ledger` 统一拥有；Memory、Reminder/Notification 分别由独立模块拥有；`apps/runtime` 只负责装配。

`packages/contracts` 已按 common/task/action/recovery/reminder 拆分，根 package import 不变。Task Ledger 将公开端口、错误、row mapping/action digest 和 v1→v3 migration 从中央实现文件抽离；`SqliteTaskLedger` 仍保留单连接、单时钟和单一 `BEGIN IMMEDIATE` 事务入口。没有新增 Schema、表、migration、API 或依赖。

两个 clean 且已合并的历史 worktree/分支已删除，释放约 1.5 GB；其他 `data/` 内容和运行中 4310/4313 服务未处理。Node 22.19.0 下 `pnpm check` 继续通过 25 个测试文件、195 项测试和完整构建；文档检查通过 95 个 Markdown、202 个本地链接。源码提交为 `9aad4dc`，完整证据见 [SPEC-0012](../specs/0012-architecture-consolidation/evidence.md)。

## 2026-09-25 · 仓库架构精简与边界门禁

`SPEC-0013` 完成全 workspace 依赖审计：20 个 package 的生产图无环，`apps/runtime` 保持 composition root。唯一发现的反向生产依赖 `packages/action-runtime → adapters/local-artifact` 已修正为由 action-runtime 拥有 `ArtifactProvider` 端口、local adapter 实现端口；adapter 继续兼容 re-export 原三个 provider 类型。

新增 `pnpm check:architecture` 并纳入 `pnpm check`，当前检查 41 个生产源码文件、58 条内部生产依赖和 11 项负向规则自测，拒绝生产环、层级反向依赖、未声明内部依赖、跨 package 相对 import、领域包引用 DSH SDK、`src` 测试和根 draft。

模块自有测试继续位于 `<module>/tests`，根 `tests/` 只放 contract/integration/e2e 等跨模块场景。12 个可再生的历史 `draft_*_folder` 已从根目录删除；`data/README.md` 现明确运行数据、缓存、隔离验证和发布草稿的边界，其他 1.8 GiB 本机数据未清理。

Node 22.19.0 下完整 `pnpm check` 通过 25 个测试文件、196 项测试及 server/Workbench build；文档检查通过 100 个 Markdown、209 个本地链接。实现提交 `aadf89c` 已推送 `origin/main`；完整证据见 [SPEC-0013](../specs/0013-repository-architecture-hygiene/evidence.md)。

## 2026-09-26 · DSH 原生定制路线评估

[SPEC-0014](../specs/0014-dsh-native-design/spec.md)、[原生定制方案](design/11-dsh-native-customization.md) 与 [ADR-005](adr/0005-dsh-native-customization.md) 提出候选路线：复用 DSH Web / Session，以外部 bundle 将 lumi 领域服务装配到 DSH Host，验证后收缩独立工作台、SDK 包装和内部 HTTP bridge。

本次只核验固定源码与发行产物并编写设计。lumi 仍固定 `0.1.7-rc.1`，分析快照仍为 `477b4f420553e8a52c2fbccc464d7561b239c443`（根版本 rc.2）；没有升级、外部插件安装、服务切换或数据库迁移。现有 SDK 支持多次 run 与具名 Session，当前每 Task 单独创建进程及 Workbench 无产品级多轮对话，是本仓的集成选择。

P0/P1/P2 均为 `not_run`。Web 客户端外部构建、Remote 接线、Preset 版本恢复、记忆纠正后的旧上下文处理、单写入者及动作门禁都需要新证据，不能从既有 MVP 验收推断迁移成功。个人数据可由 Host 内插件服务持有，领域所有权仍独立于 DSH Session；ADR-004 继续描述现行实现。

## 2026-09-28 · 可迁移个性化与 DSH 原生 bundle P0

[SPEC-0015](../specs/0015-portable-personalization/spec.md) 和 [ADR-006](adr/0006-portable-personalization-and-surfaces.md) 将个性化资产与 Harness / Surface 明确解耦。`packages/personal-memory` 不再依赖 Assistant Core 或 Task Ledger；新 `packages/personal-context` 定义 `lumi.personal-context/v1` snapshot、canonical digest、严格解析和模型数据块渲染。现行 runtime 通过 `adapters/task-personal-context` 保持 Task 原文、上下文筛选和无正文事件语义。

新 `plugins/dsh-lumi` 是可独立打包的外部 bundle。它提供 `lumi` Preset、逐次重读并校验 snapshot 的动态 context，以及只返回 schema、purpose、revision、时间和条目数的 `lumi_context_status`。隔离验收已从 DSH Web 默认模板建 profile、安装 tarball、dump 组合配置并在随机 loopback 端口完成 Web 认证交换；bundle 不含 `workspace:*`，没有读取默认个人数据库。

DSH、SDK、mock server、tools 和插件 peer 已统一锁定 `0.1.7-rc.2`。`pnpm check:dsh` 检查声明、安装结果及 275 个 lockfile DSH package；显式联网的 `pnpm check:dsh:latest` 于 2026-09-28 观察到 `latest=0.1.7-rc.2` 且 4 个兼容包均存在该 release。

Node 22.19.0 / pnpm 10.20.0 下完整 `pnpm check` 通过：23 个 package、45 个生产源码文件、63 条生产依赖、11 项规则自测，28 个测试文件 / 203 个用例（其中 DSH runtime contract 11 项）及 server / Workbench build 全部通过。`pnpm test:dsh:bundle` 和文档检查另行通过；文档检查覆盖 110 个 Markdown、244 个本地链接。隔离 bundle 临时目录已清理。实现提交 `ce5e82b` 已推送 `origin/main`。

当前没有迁移真实个人数据、切换 Gateway / Workbench / SDK 服务、实现 Web client slot、实时语音、TTS、设备注册或跨设备同步。P0 snapshot 文件是 adapter 测试载体，不是生产同步协议；模型可见内容会进入 DSH Session 历史，纠正与遗忘尚不自动清除既有会话。

## 状态标注规则

`Proposed`：设计建议；`Specified`：验收和边界已写清；`Implemented`：代码存在；`Verified`：指定环境和版本有证据；`Enabled`：部署配置已启用。后一个状态不能由前一个自动推断。

能力清单应同时记录实现状态、验证级别、部署启用和授权范围。新测试或新部署产生新记录，不能覆盖旧版本失败史。
