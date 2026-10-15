# 通道扩展

当前只有 `feishu/`。通道负责平台认证、事件规范化与结果投递；不依赖 DSH、不规划任务、不直接修改个人记忆或授予动作权限。由 `host/` 统一装配。

当前内部端口为 `start(receive)`、`send(envelope, text)`、`status()`、`close()`。信封包含稳定 `id`、`chat`、`conversation`、`sender`、原平台 `messageId`、`replyInThread` 与 `text`。Channel 认证并定义会话作用域，Host 按 `conversation` 映射 DSH Session；`receive` 必须完成持久入队才返回平台回执。`send` 只作一次业务发送，按 `replyInThread` 维持话题，返回已确认的平台 message ID，任何不明确结果由 Host 留作 unknown，不自动重试。

这不是对未来平台预设的统一公网协议。第二个实际入口出现后再据认证、媒体和会话关联要求演进契约。原生会话接线见 [架构](../docs/design/02-architecture.md)，飞书配置与限制见 [SOP](../docs/runbooks/server-feishu.md)。
