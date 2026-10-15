# SPEC-0021 · 飞书话题与群聊会话作用域

状态：`locally verified`、私聊话题 API `verified_once`、当前实例 v4 `enabled`；默认全群 @Bot 策略已部署，真实 Bot 群客户端验收待完成 · 2026-10-15。

## 范围

飞书私聊的每条非话题用户消息都由 Bot 以 `reply_in_thread: true` 回复，创建独立话题；该根消息及其后续话题消息映射同一个 DSH Session。另一条私聊主线消息不复用旧 Session。

群聊默认接受用户对当前 Bot 的显式 @；`feishu.groupChatIds` 可设为 `[]` 关闭群入口，也可设为精确群 ID 列表收窄范围，`["*"]` 与省略等价。群根消息共享该群的 @Bot Session，不读取或注入未 @Bot 的群消息。带 `root_id` 或 `thread_id` 的群消息属于独立话题 Session，话题的启动消息就是该 Session 的第一条 DSH 用户输入。

`/new` 作用于当前会话 scope；`/cancel`/`/stop` 作用于当前话题或群 @Bot scope。私聊主线控制消息保留取消该私聊当前生成与排队消息的兼容行为。文本、CardKit 与 native-cot 的所有回复使用同一 `replyInThread` 标记，进度与正文不会脱离话题。

## 授权与数据

- 私聊仍只接受 `ownerOpenId`；群消息发送者必须是 user。省略 `groupChatIds` 或 `["*"]` 允许所有群；`[]` 关闭群；精确 `oc_...` 列表只允许这些群。
- 群入口启用时，Host 启动前由 Channel 调用 `GET /open-apis/bot/v3/info` 取得当前应用 Bot `open_id`；群事件必须在 `mentions` 中精确匹配该身份。无法确认 Bot 身份时拒绝启动群入口。
- 事件只保存/投影已通过上述认证的文本、话题标识与回执。没有额外拉取群历史、成员目录或话题历史。
- 收件箱 SQLite v4 增加持久 `conversation` scope。v3 记录回填为原 `chat` scope，已有回复、回执和 DSH Session 均不重放。

## 验收

1. 私聊根消息的所有输出带 `reply_in_thread: true`；同一 `root_id` 恢复同一 DSH Session，另一主线消息使用新 Session。
2. 非 user、未 @当前 Bot、无有效 Bot 身份、或被显式 `groupChatIds` 策略排除的群消息被丢弃；默认不因缺省配置排除群。
3. 群根 @Bot 消息在同一群共享已接收 @Bot 上下文；群话题与群主线互不污染，且启动消息出现在话题 Session 首次模型请求中。
4. 取消按 conversation scope 清理，不会取消其他话题队列；私聊主线控制命令保留当前私聊控制。
5. v3→v4 保留 records、Session 映射与流式收尾；完整 `pnpm check`、`pnpm test:dsh:bundle`、文档检查通过。

## 回滚

停止服务并备份完整 `data/server`（含 WAL）后才能升级。功能回退到不支持 v4 的代码必须恢复匹配的 v3 备份；不可恢复新库或重放历史消息。关闭群入口只需在私有配置中设置 `groupChatIds: []` 并重启；收窄入口可写入精确群 ID 列表。不撤销既有消息或 Session。

## 官方依据

- [接收消息事件](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive.md)：`root_id`、`thread_id`、`mentions` 和群 @Bot 权限。
- [话题概述](https://open.feishu.cn/document/im-v1/message/thread-introduction.md)：`reply_in_thread: true` 创建/继续话题，`thread_id` 表示话题。
- [获取机器人信息](https://open.feishu.cn/document/client-docs/bot-v3/obtain-bot-info.md)：bot `open_id` 无额外权限要求。

## 证据

- 完整 `pnpm check` 通过 11 个文件 / 73 项测试，覆盖私聊话题创建/续接/重启、群 @Bot 主线共享、群话题隔离、话题取消隔离、未 @Bot 拒绝和 v3→v4。
- `pnpm test:dsh:bundle` 与文档检查通过。
- 2026-10-15T07:33:44Z，正常停止 v3 服务后完整备份至私有 `data/server-backups/pre-threaded-sessions-cCY2Kd/server`，匹配旧 commit `2616e70` / DSH `0.2.0-rc.2`，保留 15 条 `sent`。
- 随后迁移到 SQLite v4、恢复 `native-cot` 服务，状态 `ready / connected`、15 条 `sent`、0 个未决。原实现中 `groupChatIds` 未配置会关闭群入口；本增量将缺省改为所有群可用。
- 同日对 owner 私聊既有原消息执行独立部署验证：原生 COT 与最终文本均使用 `reply_in_thread: true`，共 2 条确认回执；独立私人投递账本为 complete，未向生产 inbox 插入假输入。该结果只证明接口创建话题，不等同于一次真实 WS→模型→用户话题续接或群展示验收。
- 默认全群增量通过完整 `pnpm check`（11 文件 / 74 项）、`pnpm test:dsh:bundle` 和文档检查。当前实例已重启为 `groupChatPolicy: "all"`，状态 `ready / connected`、18 条 `sent`、0 个未决；仍只处理事件中显式 @当前 Bot 的群消息。
