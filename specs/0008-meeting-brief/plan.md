# SPEC-0008 实现计划

状态：Complete。对应 `spec.md` v0.1。

## 边界

- `packages/meeting-workflow`：拥有输入 schema、规范化 Task content、workflow marker 和最终结果结构验证。
- `packages/capability-registry`：注册 `meeting-agent`，只根据精确 workflow marker 路由。
- `adapters/dsh`：把现有 bridge 配置泛化为 protected/action/research 三组 capability；meeting 只启动 guard/ready bridge。
- `profiles/dsh-meeting`：定义只基于 Task 输入生成固定结构简报的 persona，并加载受保护插件。
- `apps/runtime`：装配 meeting workflow 和 verifier decorator。
- `apps/gateway`、`apps/local-runner`、`apps/workbench`：提供三个等价入口，不复制路由与输出验证逻辑。

依赖方向为 Entry → Meeting Workflow port → Assistant Core，以及 Meeting verifier → TaskExecutor。Core 不增加会议领域分支；meeting package 不依赖 DSH。

## 协议和状态

Meeting brief 输入为 `lumi.meeting-brief/v1`，字段是 topic、objective、participants、agenda、可选 background 和可选 task id。workflow 生成：

- `lumi-workflow:meeting-brief/v1`
- 规范化的 Markdown Task content，保留字段标签和数组顺序

最终输出使用版本化 HTML comment marker 和六个固定 Markdown 标题。`MeetingBriefExecutor` 是 executor decorator，只对 `meeting-agent` 生效；验证通过后原样返回 DSH 输出，失败时抛出 `MeetingWorkflowError('VERIFICATION_FAILED')`。事件继续复用 `verification.completed`，SQLite 不新增表或 event enum。

Decorator 顺序为 `MeetingBriefExecutor(ResearchEvidenceExecutor(delegate))`。每个 verifier 只处理自己的 capability，其余请求透明传递，`close()` 逐层转发一次。

## Protected bridge

`DshAdapterOptions` 增加 `protectedBridgeCapabilities`：

- `personal-assistant`：protected + action enabled。
- `research-agent`：protected + research enabled，action disabled。
- `meeting-agent`：protected，action/research 均 disabled。
- `coding-agent`：不加载 protected plugin，保持现有开发 profile。

为兼容已有 adapter 调用，`actionBridgeCapabilities` 仍隐含 protected；research 同理。bridge broker 只在 action enabled 时必需。meeting Run 仍获得短期 loopback URL/token用于启动握手，但没有业务端点权限或模型可见 Host tool。

## 输入与数据

服务端 schema 限制：

- topic：1-300 字符。
- objective：1-2,000 字符。
- participants：1-30 项，每项 1-200 字符，规范化后唯一。
- agenda：1-20 项，每项 1-500 字符。
- background：0-6,000 字符。

规范化 Task content 不包含授权语义，只是模型输入。Task、事件和审计沿用现有 SQLite；verification 审计只记录缺失的结构项和 verifier version，不复制原始字段。

## 切片

1. 固化 spec、输入 schema、Task content 和输出协议。
2. 实现 meeting workflow、结果 verifier 和单元测试。
3. 注册 capability，泛化 protected bridge 并增加 meeting profile/contract 测试。
4. 装配 runtime，增加 Gateway 与 CLI。
5. 增加 Workbench 第三 composer 模式及 API/组件测试。
6. 完成浏览器、真实模型 smoke、全量门禁、SOP 和证据。

## 验证与回滚

- Unit：输入边界、规范化、marker 路由、六段成功及所有失败形态。
- Contract：真实 DSH SDK 加载 meeting profile，断言无 Host tools；直接 Shell/write/web bypass 仍失败。
- Integration：Gateway/CLI → workflow → Core → meeting capability；验证成功和失败均进入任务账本。
- Browser：桌面与移动提交虚构会议，检查结构化输入、结果、verification 和布局。
- Live smoke：真实 MiniMax 处理不含私人数据的虚构产品评审会议，不调用工具或外部服务。
- Full gate：Node 22.19.0 / pnpm 10.20.0 执行 `pnpm check`。

回滚移除 SPEC-0008 新 package/profile/入口及 capability 注册，并恢复 runtime decorator 与 bridge capability 配置。SQLite schema 不变；测试与 smoke 数据使用 Git 忽略的隔离目录并精确清理。
