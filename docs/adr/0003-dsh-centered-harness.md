# ADR-003：DSH 为核心 Harness，lumi Host 持有长期个人状态

状态：Proposed · 2026-09-25。关联：[DSH 中心架构](../design/10-dsh-centered-architecture.md)、[SPEC-0003](../../specs/0003-dsh-centered-design/spec.md)、M1–M5。细化 ADR-001 的接入方式；不替代其个人资产所有权、模块化单体和隔离原则。

## 背景与事实

用户希望深度复用 DSH 的“一切皆插件”，支撑多入口、多物理设备、多外部能力。当前本仓为 TypeScript/SQLite + DSH SDK adapter，版本 `0.1.7-rc.1`，每任务独立子进程。DSH 已有 Cordis、模型与工具服务、Skills、Subagents、MCP，重复建设通用 Loop 和插件生命周期没有必要。

该版 SDK 没有逐 session 取消或反向审批回调；`ctx.tools.guard` 是同步判断。会话内 schedule 不能独立唤醒冷会话或承担外部通知。这些限制已由安装产物核验，不将未来接口作为前提。

## 建议决定

1. DSH 负责唯一 Agent Loop、任务内规划、工具及专家分发。lumi Host 根据能力、授权和在线情况选择允许的执行位置，持有身份、Task / Run / Action、个人资产、触发和通知。
2. 复用 Cordis 装配与 lifecycle。将旧设计的通用 `packages/plugin-host` 建议收敛为 `plugins/dsh-lumi` 接线与 Registry 元数据；不增加第二套通用插件系统。
3. Host 服务由类型明确的 Cordis 插件暴露。异步动作准备与实际 Broker 执行分别校验；Host / Connector 保管生产凭据。OS 隔离另行验证，Cordis 钩子不能充当唯一安全边界。
4. 长等待保存 Action 并结束安全边界内的 Run；后续按原引用恢复和对账。继续使用每 Run 独立进程，直到上游细粒度控制契约通过验证。
5. 单权威 Host + 多执行节点和设备。近期延用 TS、Fastify、SQLite、CLI；飞书首个 IM，PWA 共用界面，原生端按系统能力需求增加。

## 影响与兼容

- `assistant-core` 保持确定性协调，不迁入 DSH 认知规划。现有路由规则可演进为允许能力/执行位置选择，不承担第二次任务拆解。
- `adapters/dsh` 保留 SDK 类型与生命周期映射。公共 Task 和个人资产不以 DSH 会话为所有权根。
- SPEC-0001 M1.3 实施前补充工具异步准备、Broker 参数封存、旁路阻断及跨 Run 审批恢复的精确契约。本 ADR 没有直接修改现有 API 或扩大任务范围。
- 旧 v0.2 设计和飞书快照保留历史；本地架构、路线与发布索引明确新提案优先级。
- 无业务代码、数据库、依赖或运行 profile 变更；没有部署迁移。

## 验证、代价与撤销条件

需维护一组 Cordis 桥接插件及 DSH 固定版本契约。首轮必须实证：拒绝动作没有发生、真实参数变化重审、旁路不可用、外部成功但响应丢失不会重复、跨 Run 恢复保留同一 Action。

如果必要钩子或隔离不能满足这些语义，先收窄生产工具集，再以证据决定升级或最小 fork；不因名义上的可替换而同时维护多个 Harness。当前调研证明接口存在与限制，尚未证明接线后的生产安全性。

撤销设计时以新 ADR 记录原因并回退文档，不改写历史。未来实现完成后，才按对应 spec 提供运行时迁移与回滚。
