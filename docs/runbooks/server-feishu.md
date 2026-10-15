# 单机 DSH 管家与飞书入口

状态：`verified_once` · 2026-10-14。适用 [SPEC-0016](../../specs/0016-dsh-server-feishu.md)、Node >=22.19.0、pnpm 10.20.0、DSH `0.2.0-rc.2`、飞书 Node SDK `1.75.0`。macOS 前台、MiniMax M3.1 Flash 与真实 Bot 已观察到 4 条成功回复；Linux systemd 仍为 `not_run`。

## 准备专用飞书应用

在 [飞书开放平台](https://open.feishu.cn/app) 创建企业自建应用，启用机器人能力。此服务使用专用应用身份，不复用 lark-cli、个人网页登录或其他机器人的授权。

1. 获取该应用的 App ID、App Secret；只写入本机私有配置。
2. 为应用申请接收用户与机器人私聊消息的权限 `im:message.p2p_msg:readonly`，以及以机器人发送消息的权限 `im:message:send_as_bot`。若启用群白名单，还需 `im:message.group_at_msg:readonly`；不要申请读取所有群消息的权限。租户可能要求管理员审批。
3. 在事件与回调中选择使用长连接接收事件，订阅 `im.message.receive_v1`。无需公网回调域名。
4. 通过开放平台该应用的用户查询/调试能力取得自己的 `open_id`。它必须属于同一个 App ID，不能从另一个应用的 `ou_...` 推断。
5. 配置应用可用范围包含自己，按租户要求发布或启用可用版本。先运行服务建立连接，再完成需要在线连接才能保存的事件订阅设置。

当前支持飞书中国版、owner 私聊文本，以及可选白名单群中用户明确 @Bot 的文本。其他群、未 @Bot 的群消息、陌生私聊、图片/语音/卡片不会进入模型，也不会自动回复。不要把陌生人的试发当作 Bot 故障。

## 配置权威与模板

[`deploy/server.config.example.json`](../../deploy/server.config.example.json) 是可提交的初始化模板，其中 App ID、App Secret 和 owner `open_id` 都是占位值。Host 不读取该文件；它只在首次部署时被复制为私有配置。

当前机器唯一生效的配置是 `LUMI_SERVER_CONFIG` 指向的文件；未设置该变量时默认为 `data/server/config.json`。真实飞书凭据只写入这份 `0600` 私有 JSON，模型 Key 只写入 `.env` 或 secret store。不得直接编辑 example 填入真实值，也不得用 example 覆盖已经存在的私有配置。

跨机器首次部署、同机恢复和当前不支持的历史迁移是三种不同操作，完整边界与 Agent 执行规则见[部署资产说明](../../deploy/README.md)。

## 本机配置与启动

在仓库根目录执行：

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
mkdir -p data/server
chmod 700 data/server
cp deploy/server.config.example.json data/server/config.json
chmod 600 data/server/config.json
```

上面的复制命令只适用于首次部署。若 `data/server/config.json` 已存在，应停止并核对当前实例，禁止覆盖。

仓库以 `.node-version` 声明 Node 版本。所有 pnpm 脚本通过 `scripts/with-project-node.sh` 选择 runtime：本机存在 `data/tooling/node-v22.19.0` 时优先使用，否则要求 PATH 中的 Node 满足版本下限。

编辑 `data/server/config.json`，替换全部 `REPLACE` 占位值。`ownerId` 是 lumi 稳定个人身份；`feishu.ownerOpenId` 是这个应用里的通道身份。数据库绑定 owner、App ID 和 open_id，不能改配置后复用别人的数据。

| 配置 | 含义 |
| --- | --- |
| `schemaVersion` | 固定 `lumi.server/v1` |
| `dataDir` | 收件箱、DSH home 与状态文件目录；样例 `.` 指配置所在目录 |
| `workspace` | DSH 工作目录；建议独立于源码和旧数据 |
| `model` | `provider`、`model`、`maxTokens`；token 上限 1–32768 |
| `turnTimeoutMs` | 单次生成时限；默认 120000，允许 1000–600000 |
| `providerPatch` | 可选的实例级 DSH provider 覆盖；相对配置文件解析 |
| `personalContextPath` | 可选的 `personal-context/v1` 快照；默认不加载 |
| `feishu` | 专用 appId、appSecret、ownerOpenId；可选 replyMode、groupChatIds |

所有相对文件路径都相对于配置文件，进程工作目录则须为仓库根目录。未知配置键被拒绝，JSON 权限必须禁止 group/other 访问。凭据和真实配置不入 Git。

根 `.env` 只需模型凭据，例如 `MINIMAX_CN_API_KEY`；模型选择在 server JSON 中，旧 `PA_DSH_*` 不控制新入口。DeepSeek 使用 `deepseek-official / deepseek-v4-flash` 与 `DEEPSEEK_API_KEY`。若 `profiles/providers/<provider>.patch.yml` 存在，Host 自动加载该版本化定义；MiniMax M3.1 Flash bridge 因此随 Git commit 管理。只有真正的实例级实验才设置 `providerPatch`，密钥可引用白名单变量 `LUMI_MODEL_API_KEY`。不要打印 Key，`.env` 权限也设为 `600`。

`config.json` 和个人上下文快照必须禁止 group/other 访问。显式 provider patch 可以被其他用户读取，但必须是普通文件且不可被 group/other 写入；patch 可能包含 DSH `!!js` 表达式，应视为受信代码配置。

```bash
pnpm build
pnpm start
```

预期控制台显示 `lumi ready · DSH host + Feishu private chat`。配置缺失或长连接未就绪时退出失败；只输出固定错误提示，不转储 SDK 错误正文。可以用 `LUMI_SERVER_CONFIG=/absolute/private/config.json pnpm start` 指定配置位置。开发入口为 `pnpm dev`。

可选个人快照的 owner 必须等于配置 owner，purpose 为 `general_assistance`；格式、生成和纠正限制见 [个人上下文插件](../../plugins/personal-context/README.md) 与 [bundle SOP](dsh-native-bundle.md)。旧记忆库不会自动同步；删除快照内容不清除已存在的 DSH 历史。

## 话题与群聊

私聊主线每条非命令消息都会由 Bot 以话题回复，根消息对应一个 DSH Session；继续在该话题内发送时，飞书事件的 `root_id` 会恢复同一 Session。另一条私聊主线消息不会带入旧话题上下文。

群入口默认关闭。要启用，在私有 `feishu.groupChatIds` 写入要授权的精确 `oc_...` 群 ID，并申请 `im:message.group_at_msg:readonly` 后发布应用版本。启动时会通过官方 bot 信息接口获取 Bot open_id；只有白名单群中用户消息的 `mentions` 精确包含该身份才进入模型。白名单群根 @Bot 消息共享已接收的 @Bot 上下文；群话题的根消息创建独立 Session，话题启动消息本身是首条上下文。服务不会读取未 @Bot 的群消息或补拉群历史。

群话题内发送 `/stop` 或 `/cancel` 仅取消该话题；群主线命令仅影响群 @Bot scope。私聊主线控制命令保持取消当前私聊生成和排队输入的兼容语义。`/new` 只为当前 scope 重新创建 Session。

## 双消息流式回复

普通对话可配置 `feishu.replyMode: "native-cot"`：第一条为飞书原生可折叠进度消息，实际工具调用显示内层折叠；第二条为 Card 2.0 流式正文。`"streaming-cards"` 保留双卡片，默认及样例 `"text"` 保留文本模式。进度只显示固定阶段说明和实际工具调用状态，不发送 reasoning、工具参数/结果原文。命令和未开始生成的排队取消通知仍是单条文本。

原生 COT 通过独立的 message_cot 接口提供，不能只查 text/post 的编辑字段来判断其是否支持。原生停止按钮要求客户端 ≥7.71，产生的 `/stop` 复用 `/cancel`；自定义状态标题要求 PC ≥7.72。旧卡片的紧凑折叠标题要求 ≥7.32。依据见 [SPEC-0020](../../specs/0020-feishu-streaming-replies.md#官方依据)。

启用前在专用应用中申请 `cardkit:card:write`，保留现有 Bot 消息权限，并按租户要求发布可用版本。客户端要求 ≥7.20。卡片权限不足时首次创建失败，该输入保留 `unknown`，不会调用模型或补发文本；应先核对配置、权限和原消息，再发送新请求。

升级代码前正常停止服务并备份完整 `data/server`。新版自动迁移 SQLite v1/v2/v3→v4，保留既有记录、回执和 Session 映射；v4 记录消息的 conversation scope，v3 历史记录回填旧 chat scope，绝不重放。`stream_deliveries` 保留 kind、cot_id、事件预算、终止状态和进度不确定标记。修改唯一私有配置的 replyMode 或 groupChatIds 后重启。验收时发送普通文字，确认私聊话题、折叠、正文在生成中增长及结束后停止加载；`pnpm server:status` 的 `streams` 显示未决消息或不完整的进度历史。

每张卡片更新串行节流，生产间隔 300ms；正文按转义 JSON 大小限制截断并提示完整内容保留于 DSH，不因超长增加第三条消息。取消或失败会覆盖已确认卡片的正文并关闭流式状态。发送不明不重发；更新失败可在结束时对同一已知卡片作最终覆盖。重启仅关闭已知卡片或补写已持久最终内容，不续跑模型或补发未知消息。

原生进度同样串行节流，事件使用严格递增时间戳，单批不超过 48 个、每个不超过 4KB，预留终止预算。创建即发送，未知时不重试、不自动切文本补发。追加失败不重放；终止事件至多尝试一次，再独立调用 Complete 结束已知任务。`event_uncertain: 1` 表示进度历史可能不完整，即使 `finished: 1` 也保留供核对；这不阻止独立保存最终正文。

功能回退可改为 `"text"` 或 `"streaming-cards"` 并重启；仍使用 v4 数据，新代码会处理历史已确认 COT/卡片。旧 v1/v2/v3 代码不能直接打开 v4 数据库。代码回退必须使用匹配备份并先对账，不能通过恢复旧收件箱重复回复。完整验收与证据见 [SPEC-0020](../../specs/0020-feishu-streaming-replies.md) 与 [SPEC-0021](../../specs/0021-feishu-threaded-sessions.md)。

## 首次真实验收

在专用机器人私聊依次发送 `/help`、一段不含隐私的测试文字、在其话题内引用的第二轮、另一条私聊主线消息；确认新旧话题 Session 边界。运行较长生成时在相同话题内发送 `/cancel`，确认后续同话题排队输入未再调用模型。群验收前先确认群 ID 已显式列入私有白名单：从两位成员分别 @Bot，确认群主线共享已接收 @Bot 上下文；再在群话题中 @Bot，确认话题不继承群主线。本文测试内容只是示例，执行真实发送须属于当前授权。

先记录运行版本和时间，再执行：

```bash
pnpm server:status
```

预期 `sent` 随确认送达的回复增加，未决记录单独可见。还需完成正常停止/重启后的话题续接、网络断开后的重连、陌生私聊/未授权群/未 @Bot 拒绝。观察 SDK 重投时同一平台 ID 只执行一次。测试飞书发送失败时不要反复手动补发以“试通”，先核对实际消息与本地状态。

2026-10-14 首次真实验收观察到 4 条 `sent`、1 个 Session、0 个未决记录，因此标 `verified_once`。这不证明长期稳定、断网重连或任意租户权限配置。

## 运行与故障

`/help` 显示当前能力；`/new` 排队开始新会话，旧历史保留；`/cancel` 或 `/stop` 立即请求取消当前生成和排队输入；`/status` 返回通道及收发计数和未决消息数。所有回复绑定原消息；文本模式超过 12000 UTF-8 字节会截断并提示，完整生成保留在本机 DSH。

默认待处理上限 100；单输入上限 12000 UTF-8 字节。超限输入不进入模型。持续超限、磁盘满或数据库不可写时应检查服务，不能依赖平台无限重投保住所有消息。

| 观察 | 含义和处理 |
| --- | --- |
| `queued / ready` | 明确未开始执行/发送，重启继续 |
| `interrupted` | 生成时进程退出；不自动重放。核对会话后发送新请求，恢复失败可 `/new` |
| `unknown` | 回复可能已经送达；核对原飞书消息，禁止自动重发。记录保留，当前无状态清除/强制重试命令 |
| `streams` 未决 | 核对 part、card_id、receipt 和 sequence；初次发送不补发，已确认卡片可在重启时关闭并覆盖。中断记录即使卡片已关闭也保留 interrupted |
| `channel_stream_reply_unresolved / channel_stream_update_unconfirmed` | 卡片投递或更新未确认；查应用 CardKit 权限和原消息，不把占位卡片送达视为最终回复完成 |
| `channel_progress_append_unconfirmed / channel_progress_event_limit` | COT 追加不确定或达到展示预算；不会重放追加，核对原进度消息。正文独立收尾，事件限制不扩大工具权限 |
| `feishu_reconnecting` | SDK 正在恢复连接；观察后续 `feishu_connected` 和实际收发 |
| `feishu_connection_failed` | 查应用凭据、权限、启用状态；启动时会失败退出，已启动后的终止性连接故障需要检查并重启服务 |
| `channel_storage_or_driver_failed` | 已停止接收/处理；修复本机数据或磁盘问题后再重启 |

`status.json` 是最近事件快照，有时间戳，不是持续心跳。暂未提供远程健康端点、自动未知结果对账或长期监控。SDK 日志仅保留固定标签，禁止打开可能包含事件/请求凭据的完整日志转储。

## Linux 常驻部署

[deploy/lumi.service](../../deploy/lumi.service) 是待目标机验证的 systemd 模板：仓库在 `/opt/lumi`，专用用户/组 `lumi`。启动先经过 Node 版本 wrapper；目标机通常使用 PATH 中的 `/usr/bin/node`。部署单元是匹配 commit 的完整只读仓库 checkout、`node_modules` 和 `dist/server/main.js` launcher，不是单独复制 `dist/`。先在该机安装匹配版本、依赖与构建产物；确保运行用户可读源码、profiles 与私有配置，可写 `/opt/lumi/data`，再安装 unit。

模板使用 `Restart=on-failure`、进程组停止、`UMask=0077` 和受限写目录。它不等于完整容器沙箱；不会打开任意工具权限。目录若在其他位置必须同步 `WorkingDirectory`、环境、ExecStart 与 ReadWritePaths。前台真实验收通过后再由管理员安装并执行 `systemctl enable --now lumi`。本次未操作任何目标服务器。

## 停止、备份和升级

前台 Ctrl-C 或向父进程发送 SIGTERM；systemd 使用 `systemctl stop lumi`。等待父子进程退出，确认没有运行实例，再复制整个 `data/server/` 与私有配置/快照，备份权限保持私有。保存 Git commit、`upstream.lock.json` 和 `pnpm-lock.yaml`；tracked provider profile 由 commit 一并确定。不要只复制运行中的 SQLite 主文件而漏掉 WAL。

新数据与旧 `data/assistant.db` 不混用。仅支持同机同 hostname 的恢复；数据库的主机绑定目前没有跨主机转移工具。更换机器需单独迁移规范，不能直接编辑 owner 表绕过。

升级按 [上游策略](../upstream-strategy.md) 在隔离目录验证后切换。回滚恢复匹配代码版本的数据备份，旧 DSH 不直接打开新版 Session；发送过的消息不因回滚消失。保留未知回执，不通过恢复旧备份来批量重播历史输入。失败时保留现场，先对账再继续。
