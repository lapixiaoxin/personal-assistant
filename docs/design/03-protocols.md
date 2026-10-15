# 当前协议

状态：已实现子集 · 2026-10-14。

## 私有配置

`lumi.server/v1` 使用严格字段：

- 稳定 `ownerId`
- `dataDir`、`workspace`
- `model.provider / model.model / model.maxTokens`
- 可选 `providerPatch / personalContextPath / turnTimeoutMs`
- 飞书 `appId / appSecret / ownerOpenId`

飞书可选 `replyMode: text | streaming-cards | native-cot`；省略保持文本。native-cot 使用原生进度消息与 Card 2.0 正文，streaming-cards 保留双卡片，命令仍使用文本。
可选 `groupChatIds` 控制群入口：省略或 `["*"]` 表示所有群中显式 @Bot 的消息均可进入；`[]` 关闭群聊；`["oc_..."]` 收窄到精确群 ID。Bot 身份在启动时通过官方 bot 信息接口获取，不写入私有配置。

配置文件必须禁止 group/other 读取。平台凭据不放环境变量；模型 Key 由白名单环境变量传入 DSH 子进程。

若 `profiles/providers/<provider>.patch.yml` 存在，Host 自动把它作为该 provider 的版本化定义加载；否则由 DSH 内置 catalog 解析。可选 `providerPatch` 仅用于实例级显式覆盖，优先于 tracked profile，不作为新增常用 provider 的默认位置。

## 组合端口

`host/` 是唯一组合根。可信 Channel 在进程内提供启动、发送、状态和关闭能力，并在完成平台认证后生成通道信封；这不是可由公网提交的协议。Host 不读取平台 SDK 事件，Channel 不读取 DSH Session。

能力 Plugin 通过 DSH profile 装配。插件可用 `src/plugin.*` 适配 DSH，但 `src/domain/` 的数据和规则不依赖 DSH 或平台 SDK。插件返回的数据、远端 Session ID 和工具可见性均不自动产生 owner 身份或动作授权。

## 通道信封

可信 channel 生成：

```text
id        = appId + platform message_id
chat      = appId + platform chat_id
conversation = platform-defined session scope
sender    = authenticated sender open_id
messageId = platform message_id
text      = normalized non-empty text
replyInThread = whether every reply belongs to this Feishu topic
```

私聊只接受 configured owner：根消息以自身 message ID 开启新话题/Session，话题回复按 `root_id` 续接该 Session。群聊只接受用户对当前 Bot 的显式 @，并按 `groupChatIds` 策略决定是否进入：群根消息共享该群的 @Bot Session，带 `root_id` 或 `thread_id` 的消息按话题根消息独立 Session。话题启动消息本身是新 Session 的第一条用户输入。该对象是进程内端口，不是公网身份声明。平台重投相同 ID/摘要不重复执行；相同 ID/不同摘要拒绝。

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

SQLite 与 DSH Session 不是一个事务，因此不宣称 exactly-once。稳定发送 UUID 只是附加保护。SQLite v4 在收件箱保存 conversation scope；取消和排队清理按同一 scope 进行，私聊根消息中的控制命令保持整个私聊的既有取消语义。

流式投递增加 SQLite v2 子记录：按输入 ID 和 part 保存卡片目标、发送回执、最终公开内容、递增 sequence 和终态；临时累计正文只在内存中，持久正文依据是 DSH assistant/message。每次发送/更新先落意图后调用 Channel，未知发送不重放；已确认卡片可以用更高 sequence 覆盖为最终正文或中断状态。重启不续跑模型，仅关闭已知未结束卡片。完整状态与迁移见 [SPEC-0020](../../specs/0020-feishu-streaming-replies.md)。

可选 `streaming` 端口提供 create/send/write/close/replace；`recoveryStreaming` 在回退文本模式后仍可结束历史卡片。Host 保持平台无关，Channel 接收累计正文、part、目标 ID 与已落盘的 sequence。每个子投递遵循 planned→created→sending→delivered，sending 重启归 unknown。整体 sent 需要两个 confirmed receipt 与两张卡片的终态更新成功；更新未决的 unknown 可在重启后仅对已知卡片覆盖成功后归 sent，发送未决始终保留 unknown。

SQLite v3 为流式子记录增加 kind、cot_id、事件预算、终止事件发送状态与终止原因，保留 v2 卡片记录。可选 progress 端口提供 start/append/complete；start 原子创建并发送，调用前直接 planned→sending，拿到目标和回执后 delivered。公开事件队列有界，追加前保留严格递增时间戳区间；追加结果不明不重放，单独记录 event_uncertain。终止事件至多尝试一次，之后对同一已知目标调用 Complete 设置终态。重启可以继续 Complete，但不重放增量或创建新消息；进度历史不确定与终态确认分别记录，正文仍独立收尾。回退模式仍可收尾旧 COT 和旧卡片。

## 会话与命令

conversation scope 映射到 DSH Session。恢复使用原生 `agents.resume()`；恢复前清除遗留 DSH inbox，避免把中断输入再次执行。

- `/new`：为当前话题或群 @Bot scope 创建新 Session 映射，保留旧历史；私聊主线会提示下一条普通消息自动开启新话题，不创建无调用方的控制 Session。
- `/cancel`、`/stop`：原生取消当前生成并清除同 scope 排队输入；私聊主线命令保留取消该私聊当前生成的兼容语义。后者接飞书原生停止按钮，同样经过输入认证，不进入模型或创建进度消息。
- `/status`：展示通道和收发计数。
- `/help`：展示当前命令和能力边界。

取消生成不撤销已经送达的回复或未来业务副作用。

## 个性化上下文

`lumi.personal-context/v1` 包含 owner、purpose、生成时间、canonical SHA-256 revision 和最多 32 个有 ID/revision/source 的条目。

快照是低优先级用户数据，不是 system instruction、凭据或动作授权。消费者校验 schema、owner、purpose、重复 ID、长度和摘要。文件只是当前载体，未来可替换为认证服务而不改变语义。

个人上下文文件必须是普通私有文件。领域服务与 DSH adapter 共享同一解析、canonical revision 和 prompt 渲染实现，避免同一 schema 在不同入口产生不同接受结果。

## 未来协议

新增终端时复用通道信封语义，并单独定义平台认证和回执。新增设备或远端 Agent Plugin 时再定义跨进程认证、Conversation 关联、取消和版本兼容。MCP/A2A 的外部 Session ID 不成为 lumi owner 或授权事实。
