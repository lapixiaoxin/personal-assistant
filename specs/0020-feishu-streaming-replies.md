# SPEC-0020 · 飞书双消息流式回复

状态：`locally verified`、当前实例 `enabled` · 2026-10-14。真实 CardKit + IM 接口 `verified_once`；完整 Bot 新对话和客户端展示待验收。

## 范围

飞书普通对话采用两条 Card 2.0 消息：第一条默认折叠的「处理进度」，第二条「回复」按 DSH 正文增量流式更新。处理进度只展示可公开的阶段说明，不发送模型内部 reasoning、凭据、工具参数或原始异常。命令和未开始生成的取消通知继续使用单条文本。

使用官方 `cardkit.v1.card.create`、IM reply 卡片引用、`cardElement.content`、`card.settings` 与 `card.update`。Channel 只负责平台协议，Host 负责 DSH 事件投影、持久投递和恢复；不增加第二套推理或模型请求。

飞书配置新增可选 `replyMode: text | streaming-cards`，省略时保持 text。目标应用需要 `cardkit:card:write` 和现有 Bot 发消息权限；真实实例只在权限与本机门禁通过后切换。

## 输出与持久协议

- DSH `agent/assistant-stream` 按 Agent 身份过滤，并按 attempt 区分重试/新步骤；revision 每帧递增，按 revision/index 去重，只投影 text 块。reasoning 事件只触发固定阶段说明，不读取/保存/发送其原文。
- 正文按 block index 累积；`assistant/message` 持久事件是最终正文依据，失败/取消不得把未完成正文标为完成。
- 开始模型生成前分别记录两条投递意图、卡片实体 ID 和发送回执。原消息 ID + part 生成稳定发送 UUID，未知发送不得重复。
- 在 SQLite v2 新增按 inbox ID/part 关联的 stream delivery 表，不修改已有 v1 收件箱记录。卡片创建和消息发送分离；发送前先标 sending，明确收到 message ID 后标 delivered。
- 每张卡片更新 sequence 在调用前落盘，操作串行且节流。累计文本使用原生文本更新 API；完成时先关闭 streaming_mode 并更新 summary，再全量覆盖持久最终正文。每个 API 响应都验证业务码。临时累计正文只在内存中，收件箱保存最终展示内容。
- 卡片内容按 UTF-8/JSON 转义后的大小限制，长正文在两张卡片内截断并提示完整内容保留于 DSH，不为长正文额外发送消息。
- 有已确认卡片的流式对话结束后只更新这两张卡片，禁止再次走文本 send。整体 sent 需要两条消息已确认且最终卡片更新成功。
- 初次发送未知停止生成与后续新消息发送，保留 unknown。普通更新失败停止增量请求，允许用更高 sequence 对同一已知卡片执行最终全量覆盖；最终覆盖失败保留未决更新。
- 重启把 running 归为 interrupted，sending 归为 unknown。仅对已知卡片/回执补写中断状态或已持久的最终答案，关闭流式状态；不恢复模型请求、不创建/补发未知消息。

## 验收

1. 单次普通对话两张卡片引用同一原消息；进度卡默认折叠，回复卡正文流式增长，结束后均关闭 streaming_mode。
2. 命令保持文本单消息；text 模式兼容已有行为。
3. 实际 DSH + mock 模型验证正文在 turn/end 前到达通道；reasoning 原文不进入展示，跨 Session 和重复事件不污染正文。
4. Channel 测试验证 Card 2.0 结构、业务码、卡片 ID/回执、UTF-8 大小、sequence 与限频。
5. SQLite v1→v2 保留记录；拒绝未来版本前不修改数据库；发送未知不重放，取消/进程崩溃后的已知卡片关闭。
6. 完整 `pnpm check`、`pnpm test:dsh:bundle`、文档检查通过。真实 API 创建/更新验证与真实 Bot 收发证据分别记录，不混写为已验证。

## 迁移与回滚

真实服务正常停止后备份完整 `data/server`（含 SQLite WAL），记录 commit/DSH 版本，再启动 v2 并配置 streaming-cards。已有消息记录不重放。

功能回退优先设 `replyMode: text` 并重启，保留 v2 数据与未决记录。旧 v1 代码拒绝 v2 数据库；代码回退须使用匹配备份且先对账，不能通过恢复备份重复投递。已送达卡片不会因代码回退撤销。

## 官方依据

- [流式更新卡片](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/streaming-updates-openapi-overview)
- [创建卡片实体](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/create)
- [流式更新文本](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card-element/content)
- [更新卡片配置](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/settings)
- [更新卡片实体](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/update)

官方文档说明 Card 2.0 要求客户端 ≥7.20；单卡操作 ≤10 次/秒，本文实现采用串行节流并主动关闭流式状态。单卡实体只能发送一次，有效期 14 天；流式模式最长 10 分钟，当前 turnTimeoutMs 上限 10 分钟内仍需显式结束。

## 实现与证据

- `channels/feishu/src/streaming.js` 封装 Card 2.0 与 SDK CardKit 端口，生产更新间隔 300ms；转义正文预算 12000 字节，包含双层 JSON 的请求低于 30KB。
- `host/src/stream-reply.js` 负责公共阶段投影、正文合并、节流和既有卡片终态；`channel-store.js` 自动迁移 v1→v2；`channel-host.js` 在同一 DSH Agent 中订阅真实 transient stream。
- 实际 DSH + mock 模型已观察到 turn/end 前正文增量；覆盖重复输入、取消、初次未知发送及 SIGKILL 后回退文本模式关闭旧卡片。
- 2026-10-14T15:58:38Z，当前应用通过真实 SDK 创建两张未发送卡片，并分别成功更新正文、关闭流式模式及全量覆盖。`messagesSent: 0`；这证明 CardKit 权限和卡片结构，不证明聊天展示或 Bot 流式收发。
- 完整 `pnpm check` 通过 9 文件 / 54 项测试、16 生产源码文件 / 1 内部依赖边；DSH bundle 与文档检查通过。补充验证「两张终态回执已落盘、整体 sent 尚未提交时崩溃」可仅凭账本归 sent，无新增 API 调用。
- 2026-10-14T16:06:08Z，正常停止旧服务后备份完整 v1 实例至本机私有 `data/server-backups/pre-streaming-xxgSdF/server`，匹配旧 commit `7445962` / DSH `0.2.0-rc.2`，保留此前 8 条 sent。随后设 `streaming-cards` 并启动 v2，状态 `ready / connected`、0 未决。
- 2026-10-14T16:10:21Z，绑定 owner 既有私聊完成一组明确标注「部署验证」的双卡片：2 个真实 IM message ID，progress sequence 3 / answer sequence 4，均 finished。使用独立私人投递账本 `data/feishu-streaming-live`，未向生产 inbox 插入假事件，也未调用真实模型。真实 API 投递、更新和关闭为 `verified_once`；完整真实 WS→模型→Bot 新对话与人工客户端展示尚未验收。
