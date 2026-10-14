# 当前协议

状态：已实现子集 · 2026-10-14。

## 私有配置

`lumi.server/v1` 使用严格字段：

- 稳定 `ownerId`
- `dataDir`、`workspace`
- `model.provider / model.model / model.maxTokens`
- 可选 `providerPatch / personalContextPath / turnTimeoutMs`
- 飞书 `appId / appSecret / ownerOpenId`

配置文件必须禁止 group/other 读取。平台凭据不放环境变量；模型 Key 由白名单环境变量传入 DSH 子进程。

## 通道信封

可信 channel 生成：

```text
id        = appId + platform message_id
chat      = appId + platform chat_id
sender    = configured owner open_id
messageId = platform message_id
text      = normalized non-empty text
```

该对象是进程内端口，不是公网身份声明。平台重投相同 ID/摘要不重复执行；相同 ID/不同摘要拒绝。

## 收发状态

```text
queued -> running -> ready -> sending -> sent
                    |          |
                    |          +-> unknown
                    +-> interrupted (process restart)
```

- `queued`：尚未交给 DSH，可在重启后继续。
- `running`：模型请求进行中；崩溃后不重放。
- `ready`：回复文本已持久化，尚未发送，可继续。
- `sending`：平台结果不确定；崩溃后进入 `unknown`。
- `sent`：保存有效平台 message ID。

SQLite 与 DSH Session 不是一个事务，因此不宣称 exactly-once。稳定发送 UUID 只是附加保护。

## 会话与命令

chat 映射到 DSH Session。恢复使用原生 `agents.resume()`；恢复前清除遗留 DSH inbox，避免把中断输入再次执行。

- `/new`：创建新 Session 映射，保留旧历史。
- `/cancel`：原生取消当前生成并清除排队输入。
- `/status`：展示通道和收发计数。
- `/help`：展示当前命令和能力边界。

取消生成不撤销已经送达的回复或未来业务副作用。

## 个性化上下文

`lumi.personal-context/v1` 包含 owner、purpose、生成时间、canonical SHA-256 revision 和最多 32 个有 ID/revision/source 的条目。

快照是低优先级用户数据，不是 system instruction、凭据或动作授权。消费者校验 schema、owner、purpose、重复 ID、长度和摘要。文件只是当前载体，未来可替换为认证服务而不改变语义。

## 未来协议

新增 App、设备或远端 Agent 时再定义跨进程认证、Conversation 关联、取消和版本兼容。MCP/A2A 的外部 Session ID 不成为 lumi owner 或授权事实。
