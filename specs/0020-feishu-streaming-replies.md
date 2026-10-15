# SPEC-0020 · 飞书双消息流式回复

状态：CardKit 与原生 COT API 均 `verified_once`，当前实例 `native-cot enabled`；完整 Bot 新对话和客户端多级折叠观感待验收 · 2026-10-15。

## 范围

2026-10-15 原生进度增量：新增 `replyMode: native-cot`。第一条改用飞书 `POST/PUT /im/v1/message_cot` 与 `POST /im/v1/message_cot/complete/{cot_id}`，提供消息式任务状态、折叠进度和实际工具调用的内层折叠；第二条保留流式正文卡。`/stop` 与 `/cancel` 同义，复用认证、取消与队列语义。普通 text/post 编辑 API 的字段不代表原生 COT 的能力；此前以普通消息无折叠字段推断无此方案，结论不完整。

新边界：Host 投影中立公开事件，Channel 转换飞书事件。SQLite v3 新增 COT 目标、事件预算、严格递增时间戳和终止状态；SQLite v4 由 SPEC-0021 增加会话 scope，保留全部流式记录。创建即发送，必须先落 sending；未知创建不重试。增量队列有界，总预算留出终止事件；追加未知不重放，终止事件至多尝试一次，Complete 独立确认，正文独立收尾。只依据实际 DSH 工具生命周期展示调用；不读取 reasoning、工具参数/结果原文。

增量验收：真实 DSH + mock 覆盖原生进度与流式正文、`/stop`、未知创建、SIGKILL 和回退文本后的收尾；协议测试覆盖 COT 数据形状、业务码、顺序与错误净化；持久测试覆盖 v2→v3、追加未知不重放、Complete 恢复。完整离线门禁后停服备份，再进行 owner 私聊的明确部署验证并启用；API 验证与客户端视觉验收分开记录。

飞书普通对话采用两条 Card 2.0 消息：第一条默认折叠的「处理进度」，第二条「回复」按 DSH 正文增量流式更新。处理进度只展示可公开的阶段说明，不发送模型内部 reasoning、凭据、工具参数或原始异常。命令和未开始生成的取消通知继续使用单条文本。

使用官方 `cardkit.v1.card.create`、IM reply 卡片引用、`cardElement.content`、`card.settings` 与 `card.update`。Channel 只负责平台协议，Host 负责 DSH 事件投影、持久投递和恢复；不增加第二套推理或模型请求。

飞书配置新增可选 `replyMode: text | streaming-cards | native-cot`，省略时保持 text。正文卡需要 `cardkit:card:write` 和现有 Bot 发消息权限；真实实例只在权限与本机门禁通过后切换。

2026-10-15 展示调整：进度卡使用 compact 宽度和 8px 外层留白，面板无背景与描边；标题收起时按文字宽度排列，右侧紧跟显式下箭头，展开后旋转。正文卡保留原有样式。该调整仍使用 interactive 卡片，不宣称普通消息支持手动折叠；不改发送、持久化或授权协议，无数据迁移。

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

真实服务正常停止后备份完整 `data/server`（含 SQLite WAL），记录 commit/DSH 版本，再启动 v3 并配置 native-cot。已有消息记录不重放。

功能回退优先设 `replyMode: text` 或 `streaming-cards` 并重启，保留当前 v4 数据与未决记录。旧 v1/v2/v3 代码拒绝 v4 数据库；代码回退须使用匹配备份且先对账，不能通过恢复备份重复投递。已送达 COT/卡片不会因代码回退撤销。

## 官方依据

- [飞书 COT OpenAPI 指南](https://bytedance.larkoffice.com/wiki/ZfyXwOQImiLURtkRPtWcf2B2nNh)与其链接的[完整接口示例](https://feishu-agui-playground.gf-boe.bytedance.net/llms.txt)：原生消息 COT、AG-UI 事件子集和 Complete 生命周期；指南目前需组织内可见权限，公开文档入口不完整。生产 API 使用 open.feishu.cn，不使用示例站环境。
- COT 不支持 STEP/STATE/CUSTOM；本实现仅用 RUN、TEXT_MESSAGE、TOOL_CALL。停止按钮要求客户端 ≥7.71，自定义状态文案要求 PC ≥7.72；不声称所有旧版客户端展示一致。Complete 对外只用 done/error，timeout 不开放。
- [流式更新卡片](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/streaming-updates-openapi-overview)
- [创建卡片实体](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/create)
- [流式更新文本](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card-element/content)
- [更新卡片配置](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/settings)
- [更新卡片实体](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/update)
- [消息内容结构](https://open.feishu.cn/document/server-docs/im-v1/message-content-description/create_json?lang=zh-CN)：公开 text/post 字段没有手动折叠设置；post 的 md 明确不支持任意 raw HTML，因此不能使用 HTML details/summary 模拟。
- [编辑普通消息](https://open.feishu.cn/document/server-docs/im-v1/message/update?lang=zh-CN)：text/post 每条最多编辑 20 次；不替换当前 CardKit 流式协议。
- [折叠面板 JSON 2.0](https://open.feishu.cn/document/feishu-cards/card-json-v2-components/containers/collapsible-panel?lang=zh-CN)：支持 header.width、icon、icon_position、icon_expanded_angle。auto_when_fold 需要客户端 ≥7.32，旧客户端可能保留默认标题宽度，卡片整体仍要求 ≥7.20。本次仅采用这些公开样式字段。

官方文档说明 Card 2.0 要求客户端 ≥7.20；单卡操作 ≤10 次/秒，本文实现采用串行节流并主动关闭流式状态。单卡实体只能发送一次，有效期 14 天；流式模式最长 10 分钟，当前 turnTimeoutMs 上限 10 分钟内仍需显式结束。

## 实现与证据

- `channels/feishu/src/streaming.js` 封装 Card 2.0 与 SDK CardKit 端口，生产更新间隔 300ms；转义正文预算 12000 字节，包含双层 JSON 的请求低于 30KB。
- `host/src/stream-reply.js` 负责公共阶段投影、正文合并、节流和既有卡片终态；`channel-store.js` 自动迁移 v1→v2；`channel-host.js` 在同一 DSH Agent 中订阅真实 transient stream。
- 实际 DSH + mock 模型已观察到 turn/end 前正文增量；覆盖重复输入、取消、初次未知发送及 SIGKILL 后回退文本模式关闭旧卡片。
- 2026-10-14T15:58:38Z，当前应用通过真实 SDK 创建两张未发送卡片，并分别成功更新正文、关闭流式模式及全量覆盖。`messagesSent: 0`；这证明 CardKit 权限和卡片结构，不证明聊天展示或 Bot 流式收发。
- 完整 `pnpm check` 通过 9 文件 / 54 项测试、16 生产源码文件 / 1 内部依赖边；DSH bundle 与文档检查通过。补充验证「两张终态回执已落盘、整体 sent 尚未提交时崩溃」可仅凭账本归 sent，无新增 API 调用。
- 2026-10-14T16:06:08Z，正常停止旧服务后备份完整 v1 实例至本机私有 `data/server-backups/pre-streaming-xxgSdF/server`，匹配旧 commit `7445962` / DSH `0.2.0-rc.2`，保留此前 8 条 sent。随后设 `streaming-cards` 并启动 v2，状态 `ready / connected`、0 未决。
- 2026-10-14T16:10:21Z，绑定 owner 既有私聊完成一组明确标注「部署验证」的双卡片：2 个真实 IM message ID，progress sequence 3 / answer sequence 4，均 finished。使用独立私人投递账本 `data/feishu-streaming-live`，未向生产 inbox 插入假事件，也未调用真实模型。真实 API 投递、更新和关闭为 `verified_once`；完整真实 WS→模型→Bot 新对话与人工客户端展示尚未验收。
- 2026-10-15 紧凑样式增量通过完整 `pnpm check`（54 项）、DSH bundle 和文档检查。00:56:38Z 真实 CardKit 创建未发送进度卡，正文更新、关闭与最终替换成功，`messagesSent: 0`，样式 JSON 接受为 `verified_once`；展开箭头与留白的客户端观感待人工确认。
- 同次正常停止后整目录备份于私有 `data/server-backups/pre-compact-progress-AzaFg6/server`，对应旧 commit `6fab13e`；样式回退可恢复该提交的 `replyCard` 展示字段，无需还原数据库或重投历史消息。
- 原生 COT 增量通过完整 `pnpm check`（11 文件 / 67 项）、DSH bundle 和文档检查；覆盖 native/card/text、`/stop`、真实工具生命周期净化、未知创建、追加不确定、事件预算、SIGKILL 和 v1/v2→v3。
- 2026-10-15T03:34:36Z，当前应用在 owner 私聊通过真实 `message_cot` 创建 1 条明确标注部署验证的进度消息，2 次 UpdateCOT 与 Complete 均确认。独立私人投递账本为 complete；未向生产 inbox 插入假事件，也未伪造工具调用。真实 API 生命周期为 `verified_once`，不等同于完整 WS→模型→双消息对话或客户端视觉验收。
- 正常停止 v2 服务后完整备份至私有 `data/server-backups/pre-native-cot-FLoCPV/server`，匹配旧 commit `342d08e` / DSH `0.2.0-rc.2`，保留 11 条 sent。随后迁移 SQLite v3、设置 `native-cot` 并启动，状态 `ready / connected`、0 未决。
