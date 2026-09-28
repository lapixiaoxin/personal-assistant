# ADR-006：个性化内核独立于 Harness 与交互 Surface

状态：Accepted · 2026-09-28。决策者：项目所有者。关联：[SPEC-0015](../../specs/0015-portable-personalization/spec.md)、[ADR-005](0005-dsh-native-customization.md)。

## 背景和硬约束

DSH 会持续升级，lumi 未来也可能使用其他 Agent Harness。用户希望个人身份、偏好、记忆、目标和授权可迁移到不同 Agent，而不是成为 DSH profile 或 Session 的私有状态。

交互形态也不会局限于 DSH Web。未来可能有以语音为主的个性化界面、手机、可穿戴设备和其他终端。它们的延迟、媒体与连接协议不同，但必须呈现同一个 lumi，使用同一份个人资产和授权事实。

## 备选

1. 以 DSH Session / profile 为个人化事实源：实现快，但升级、迁移和删除传播均绑定 Harness。
2. 为每种 UI 或设备分别保存 persona 和记忆：局部灵活，但会产生身份分裂、冲突和越权。
3. 由 lumi 拥有版本化个人资产与交互语义；Harness 和 Surface 只通过 adapter 消费所需视图。

## 决定

采用 3：

- lumi 领域模块拥有稳定 owner、个人记忆、目标、授权、动作和证据；DSH Session 只拥有会话执行历史。
- 对模型暴露的个性化内容是按 owner、purpose、scope、分级和预算生成的不可变快照；快照有版本和来源，可由不同 Harness adapter 消费。
- DSH plugin、其他 Agent、语音运行时或设备端不得直接拥有或改写权威个人资产。它们提交候选、请求上下文或执行授权后的动作。
- DSH Web、未来语音 UI、IM、CLI 和设备均为 Surface adapter。Surface 负责采集与呈现；身份认证、Conversation / Task / Action 归一化发生在共享控制边界。
- 不要求所有链路使用同一种通信协议。文本与控制可用 HTTP / WebSocket，实时语音可用 WebRTC 或流式传输，设备可用专用协议；领域 ID、取消、授权和证据语义保持一致。
- Harness 版本采用“当前兼容 release 精确锁定 + 主动检测上游更新 + 契约验证后升级”，不使用浮动依赖，也不因单个 npm dist-tag 异常拼出不一致版本。
- 对 DSH 的修改优先放在外部 bundle / adapter。只有必要接缝缺失且有最小复现时维护薄补丁，并优先贡献上游。

进程位置不决定领域所有权。为降低延迟，个人上下文 adapter 可以与 DSH Host 同进程运行，但其公开契约、数据格式和迁移仍独立于 DSH；也可移到远程服务而不改个人资产模型。

## 后果

正面：

- DSH 升级或替换不迁移个人数据模型。
- 语音 UI 和多设备可以共用个性化能力，不依赖 DSH Web DOM 或内部 React 状态。
- 同一快照选择和安全规则可跨 Harness 做一致性测试。

代价：

- 需要维护领域快照与各 Harness / Surface 的 adapter。
- 模型可见快照会进入对应 Harness 的会话历史，纠正/遗忘需要同时处理未来检索、活跃会话和保留策略。
- 多设备仍需后续设备身份、租约、同步和冲突协议；本决定不把这些难题包装成“插件即可解决”。

## 验证和撤销条件

SPEC-0015 先验证 personal-memory 依赖抽离、统一快照、当前 Task adapter、DSH 外部 bundle 和最新兼容 release。后续语音与设备切片必须证明不同 Surface 进入同一身份与动作控制，不复制授权逻辑。

若某个 Harness 无法通过稳定 adapter 接收上下文，只允许为该 Harness 增加适配或有边界的补丁，不能把权威个人资产迁入其会话格式。只有项目目标不再要求跨 Harness / Surface 迁移时，才可用新 ADR 撤销本决定。
