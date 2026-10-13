# 领域协议与兼容

状态：Proposed v0.2 · 2026-09-28。这里的类型主要是目标契约；当前可调用协议见 `packages/contracts/src/index.ts` 和 README。`lumi.personal-context/v1` 已由 SPEC-0015 实现，其余示例不是已上线 API。

## 2026-10-13 新服务器的已实现契约

SPEC-0016 新入口直接接 DSH 原生 Agent 服务，不要求把每次对话转换为旧 Task。以下为当前实现，其后 Goal/Run/Manifest 等仍是长期目标，不能要求为其预建通用编排层。

- 私有配置：`lumi.server/v1`，严格字段、固定 owner、文件权限、provider/model 和专用飞书身份。
- 内部通道信封：`id / chat / sender / messageId / text`；只有可信平台 adapter 生成，不是公网自报身份接口。稳定 app+message ID 去重，相同 ID 的摘要冲突拒绝。
- 通道端口：`start(receive)`、`send(envelope, text)`、`status()`、`close()`；receive 先落盘再返回，send 返回已确认的平台 message ID。
- 收发状态：`queued → running → ready → sending → sent`。重启 running→interrupted、sending→unknown；不自动重放。
- Conversation 映射指向 DSH Session；transcript 与原生执行归 DSH。`/new` 新建映射，`/cancel` 原生取消并清排队输入；均不销毁旧历史或撤销已发生副作用。
- `personal-context/v1` 继续独立；仅显式快照进入新服务器，非生产同步协议。

该内部端口当前由一个插件消费，不是稳定跨进程 ABI；新增 App、A2A 或设备时按具体需求定义认证、兼容与取消协议。

## 核心对象

| 对象 | 含义 | 关键关系和最小字段 |
| --- | --- | --- |
| Principal | 经过认证的用户、设备、服务或 Agent | id、kind、ownerId、credentialRef、authStrength |
| Goal | 用户希望达成的长期结果 | id、ownerId、desiredOutcome、constraints、acceptance、reviewAt、state、version |
| Commitment | 对某人或某事的承诺 | goalId、counterpartyRef、dueAt、sourceRef、status |
| Conversation | 连续交互的容器 | ownerId、messageRefs、relatedGoalIds、visibility |
| Task | 有结果要求的工作单元 | id、goalId?、request、acceptance、delegationId、state、version |
| Run | 一次执行尝试 | id、taskId、attempt、executorRef、capabilitySnapshot、lease、budget、checkpointRef |
| Action | 一次具体副作用或读取 | id、runId、operation、target、inputDigest、idempotencyKey、authorizationRef、status |
| Artifact | 实际产物 | id、uri、mediaType、digest、ownerId、classification、retention |
| Evidence | 可核验事实的引用 | id、source、observedAt、digest、claim、accessPolicy、expiresAt? |
| Verification | 对验收条件的判定 | criteriaId、verifierVersion、status、evidenceRefs、reason |
| Memory | 可修正的个人知识 | ownerId、kind、scope、provenance、version、status、validTime |
| PersonalContextSnapshot | 给一次 Harness 请求使用的不可变个性化视图 | schemaVersion、ownerId、purpose、revision、generatedAt、entries |
| ChangeProposal | 能力或工程变更 | specRef、baseDigest、candidateDigest、risk、evalRefs、releasePolicyRef |

“目标达成”“任务完成”“执行结束”“动作成功”“模型输出完毕”是五个不同事件。没有外部证据的任务可以完成为“已交付研究报告”等明确结果，但不能宣称已经发送、购买或改变远端状态。

## 请求与信封

所有边界使用 Schema 校验。命令建议共享 `schemaVersion / requestId / traceId / ownerId / principalId / issuedAt / deadline / delegationRef / payload`。owner/principal 由可信入口认证结果填入；外部请求不得靠自报字段提升身份。

请求 ID 与业务幂等键分开：前者用于跟踪单次传输，后者用于识别相同业务意图。幂等范围为 `(ownerId, operation, idempotencyKey)`，冲突摘要拒绝，不静默复用。领域时间统一 UTC RFC3339，日程另带 IANA timezone；不把本地时区字符串用于排序。

业务请求摘要仅包含规范化的用户输入和语义参数，不包含服务端生成的时间和 traceId。同一次请求重传不应因服务端时间不同而冲突。当前 MVP 的 `sameRequest` 比较 `createdAt`，而 CLI 重传会生成新时间；该差距在 M1 迁移中修正。

## Surface 与个性化上下文

DSH Web、Workbench、CLI、未来语音 UI、IM 和设备客户端是可替换 Surface，不是个人资产所有者。各入口先把自身认证结果、会话标识、媒体事件和用户命令映射为共享领域对象，再请求 Harness 或控制层；浏览器 session、音频连接和设备 ID 不直接充当 owner 或授权。

`lumi.personal-context/v1` 是当前已实现的 Harness-neutral 快照。它包含稳定 owner、purpose、生成时间、内容摘要和有 ID/revision/source 的条目；消费者必须校验 schema、owner、purpose、重复 ID、长度与摘要。快照正文是低优先级用户数据，不是 system instruction、凭据或动作许可。P0 文件载体只用于隔离验证；未来可替换为认证服务或进程内端口而不改变快照语义。

Surface 不要求共享同一传输。文本和控制消息可用 HTTP / WebSocket；实时语音可用 WebRTC 或其他流协议；设备可用平台协议。它们至少统一以下语义：

- `ownerId / principalId / conversationId / requestId` 的来源与关联；
- 用户打断、Turn 取消、Task 取消和 Action 撤销的不同结果；
- transcript、音频、模型输出、Task 结果和 Evidence 的保留与访问策略；
- Action 仍须绑定参数、授权、幂等和核验，语音确认不能降低既有门禁。

实时语音 frame、partial transcript 和 TTS chunk 是短期媒体事件，不直接写成 Task、Memory 或 Evidence。是否持久化最终 transcript、如何跨设备续接 Conversation、设备注册与单写入者租约均须在后续版本化协议中定义；当前尚未实现。

## Task、Run 与 Action 状态

Task 目标状态：

`queued → running → verifying → completed`

运行中可进入 `waiting_input / waiting_approval / waiting_dependency / paused / reconciling`，满足恢复条件后重新排队。失败进入 `failed`；取消先进入 `cancelling`，确定所有动作的停止或剩余影响后进入 `cancelled`。`completed / failed / cancelled` 是终态，重试创建新 Run 或新 Task，不篡改历史。

Run 状态：`queued / leased / running / interrupted / completed / failed / cancelled`。同一 Task 默认最多一个有写权限的 Run；并行只读子任务各有独立 Run。父任务拥有总预算，子任务不会生成额外预算。

Action 状态：

`prepared → authorized → executing → succeeded | failed | outcome_unknown`

有补偿能力的成功动作可进入 `compensating → compensated | compensation_failed`。补偿是新的动作，有独立权限和证据；不假装所有外部操作可回滚。

当前六状态 Task API 保留在 `/v1`。扩展状态须通过版本化 API 或已协商的能力提供；新增枚举值也可能破坏旧客户端。旧接口的暂态可映射为 `running / waiting_approval`，详细原因置于兼容字段；无法无损映射时必须明确版本边界，不擅自改变已有含义。

## 动作门禁

ActionProposal 最小结构：

```json
{
  "schemaVersion": "pa.action/1",
  "id": "action-example",
  "runId": "run-example",
  "capability": {"id": "calendar", "version": "1.0.0"},
  "operation": "event.create",
  "target": {"calendarId": "test-calendar"},
  "inputDigest": "sha256:EXAMPLE",
  "inputRef": "artifact:proposed-event",
  "effect": "external_write",
  "idempotencyKey": "example-event-001",
  "preconditions": {"resourceVersion": "etag-example"},
  "deadline": "2026-10-01T00:00:00Z"
}
```

这是说明字段的示例，`EXAMPLE` 不是真实摘要。提交动作时以完整规范化参数计算摘要，并保存不可变参数快照，防止审批后改变收件人、金额或目标。

授权记录绑定 owner、principal、Action 摘要、capability 版本、资源前置条件、额度、次数、有效期、policy 版本和撤销 epoch。执行前重新读取最新撤销状态和资源版本，并原子消费授权额度；审批有效不等于永久豁免后续策略。

确定性裁决顺序：身份有效 → 用户/平台禁止项 → 数据访问与出境 → 委托范围 → 参数与前置条件 → 风险与确认要求 → 预算预留 → 执行资格。任何缺失均拒绝或进入等待，不能用语言模型置信度补齐。

授权判定与副作用无法跨外部系统形成一个事务。先本地持久化动作意图和预算，再调用带幂等键的远端；执行后持久化回执。窗口内崩溃时走对账，不能假设没有发生。

## 结果与错误

ActionResult 必须有 `status / externalReceiptRef? / artifactRefs / evidenceRefs / actualCost / error?`。仅 HTTP 200 不一定表示业务成功，adapter 解析外部业务码。

统一错误类别：

| code | 语义 | 恢复规则 |
| --- | --- | --- |
| `INVALID_INPUT`、`CONFLICT` | 输入或版本冲突 | 修正参数；不原样重试 |
| `AUTH_REQUIRED`、`PERMISSION_DENIED` | 身份或权限不满足 | 请求对应授权；不能换身份试错 |
| `APPROVAL_REQUIRED`、`APPROVAL_EXPIRED` | 缺少有效动作授权 | 准备具体动作后进入审批 |
| `DEPENDENCY_UNAVAILABLE`、`RATE_LIMITED` | 暂态依赖问题 | 截止时间内按 retryAfter + 抖动退避 |
| `DEADLINE_EXCEEDED`、`BUDGET_EXHAUSTED` | 已触及委托边界 | 停止新动作，汇报剩余工作 |
| `OUTCOME_UNKNOWN` | 副作用可能已发生 | 先用回执或幂等键对账；禁止盲重试 |
| `VERIFICATION_FAILED` | 未满足验收 | 允许预算内修复，否则失败或请求决定 |
| `CANCELLED` | 确认停止 | 回报已发生且不能撤销的影响 |
| `INCOMPATIBLE_VERSION` | 契约不兼容 | 保留旧版或显式升级 |

错误结构有 `retryable / safeToRetry / retryAfterMs / detailsRef`；“网络错误可重试”不等于“这个副作用可安全重试”。

## 持久执行与恢复

M3 Runner 从持久队列 claim，获得 `leaseOwner / leaseExpiresAt / fencingToken`。心跳只能续租当前 fencingToken。状态更新及执行代理均拒绝过期 token，防止旧 worker 苏醒重复写入。

检查点保留计划版本、已核验步骤、未完成动作和使用的上下文引用；不以模型思维链作为恢复依据。恢复先检查正在执行的动作：没有开始的可重排；已成功的读取回执；结果未知的对账；无法对账的副作用转人工决定。

若外部系统不支持幂等，也没有稳定业务标识可查询，则不能承诺自动重复执行。租约与单 worker 也无法单独消除“远端成功、本地未记录”的不确定窗口。

2026-09-25 实现状态：SPEC-0010 先落地单机子集。普通 queued Task 可续调度；遗留 running Task 转为 interrupted，安全重试创建新 Task；受控 Action 转为 reconciling 并显式对账。本机 runtime ID + PID 只防止活跃本地进程被误接管，不等同于本节目标中的 lease、heartbeat、fencing token 或检查点恢复。

## 事件与流式

事件字段为 `eventId / schemaVersion / aggregateId / aggregateType / sequence / type / occurredAt / traceId / causationId / payloadRef`。每个聚合 sequence 单调；消费者用 eventId 去重。事件类型用命名空间，如 `pa.action.succeeded.v1`。

SSE/WebSocket 将来提供从游标重放、心跳、断线续传、背压和截断提示。客户端落后于保留水位时返回 `CURSOR_EXPIRED` 和快照位置。实时 token 流是临时展示，不替代持久结果；授权撤销后停止继续重放受限事件。

## 能力注册和委派

目标 Capability Manifest：

```yaml
schemaVersion: pa.capability/1
id: example.meeting-brief
version: 1.0.0
kind: workflow
domains: [work.meetings]
provides: [meeting.prepare]
requires: [documents.read, calendar.read]
inputSchemaRef: schemas/meeting-input.json
outputSchemaRef: schemas/meeting-output.json
permissions: [calendar.read, documents.read]
effects: [local_artifact]
isolation: restricted_worker
dataPolicy: personal_redacted
verification: meeting-brief-evidence-v1
timeoutSeconds: 120
```

此清单为目标格式，当前 registry 不解析它。`kind` 的扩展通过新 Schema 引入。版本和 capabilities 的实际支持由协商结果决定；外部自称具备的权限不能成为本地允许依据。

Discovery → Resolve → Delegate → Observe → Cancel → Verify 构成委派生命周期。委派任务包只含目标、验收、必要上下文、权限子集、预算子集、截止时间和回传地址，不给完整个人记忆或长期凭据。父任务使用 `parentTaskId / rootTaskId / maxDepth` 防止委派环路和预算倍增。

路由先过滤权限、数据位置、协议兼容和健康，再依据同类任务的成功证据、成本、时延选择。质量不确定时先小规模试用；路由原因摘要可查。

## 外部标准与版本策略

MCP 用于工具与资源接入；A2A 用于远端 Agent 的发现、任务状态、产物与取消；OpenAPI/JSON Schema 用于 HTTP 契约；OpenTelemetry 的 trace 语义用于可观测性。它们都通过 adapter 映射到本仓对象，不让外部会话 ID 成为个人身份。

当前未接入 MCP/A2A，具体标准版本、SDK、认证 profile 和兼容矩阵在接入规范中精确锁定。设计参考：[MCP](https://modelcontextprotocol.io/)、[A2A](https://a2a-protocol.org/)、[OpenAPI](https://spec.openapis.org/oas/latest.html)、[OpenTelemetry](https://opentelemetry.io/docs/)。这些链接用于后续核验，不表示本次验证了完整规范或实现。

内部协议遵循 SemVer；可选字段通常为 minor，删除/改义/枚举扩展等按消费者兼容性决定 major。兼容窗口至少覆盖当前生产版本和上一个已发布版本；pre-1.0 也必须写迁移说明。扩展放命名空间 `extensions` 或已有 `evidence`，不能悄悄覆盖外部 Agent Schema。

## 必须具备的契约验证

生产者与消费者 Schema 双向样例、旧新版本兼容、重复/乱序/迟到事件、两次审批竞争、摘要变化、撤销竞态、请求时钟偏差、取消后迟到成功、外部成功本地崩溃、状态非法迁移、预算竞争和恢复对账。测试断言领域不变量，避免只复制实现分支。
