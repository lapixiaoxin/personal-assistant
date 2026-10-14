# lumi 工程事实

更新：2026-10-14。

## 当前能力

| 范围 | 事实 |
| --- | --- |
| 核心 | `host/` 通过官方 SDK 启动 DSH `0.2.0-rc.2` 常驻进程；DSH 拥有 Agent、Session、模型和工具循环 |
| 入口 | 飞书自建 Bot，单 owner 私聊文本，官方长连接，无公网回调 |
| 结构 | Host 负责组合与持久运行，`channels/*` 负责终端，`plugins/*` 负责个人上下文和能力 |
| 会话 | 原生 Agent create/resume/followup/cancel；支持多轮、`/new`、`/cancel` |
| 收发 | SQLite 去重、串行处理、回复意图和平台 message ID 回执 |
| 展示 | 可选 Card 2.0 双消息流式回复：折叠的公开进度 + 累计正文；当前实例已启用 |
| 恢复 | queued/ready 继续；running→interrupted，sending→unknown，不自动重放 |
| 权限 | 默认无文件、Shell、网络、外部 Agent 或业务动作工具 |
| 个性化 | 可选 `personal-context/v1` 快照；个人记忆/上下文独立于 DSH |
| 模型 | 当前私有部署为 MiniMax M3.1 Flash Preview；临时 provider bridge 已作为 tracked profile 管理 |
| 部署 | macOS 前台运行已验证；systemd 仅为 Linux candidate |

## 证据

- 完整离线门禁在精简前通过 32 个文件 / 223 项测试。
- DSH 原生通道契约覆盖多轮、重启、取消、新会话、工具拒绝和真实 `SIGKILL`。
- 飞书边界测试使用官方 EventDispatcher，覆盖身份、消息类型、重复和发送回执。
- 当前三层结构为 3 个生产 workspace、16 个生产源码文件和 1 条内部生产依赖边；9 个测试文件 / 54 项通过。
- 2026-10-14 三层结构切换后真实服务为 `ready / connected`，保留 7 条 `sent`、0 个 `interrupted/unknown`；状态为 `verified_once`。
- MiniMax 中国区模型列表以当前 Key 返回并包含 `MiniMax-M3.1-Flash-Preview`。
- SPEC-0020 完整门禁及 DSH bundle 通过。实际 DSH + mock 模型已验证 turn/end 前流式正文、取消、未知发送及 SIGKILL 后卡片关闭。
- 2026-10-14T16:10:21Z，真实飞书 API 双卡片验证取得 2 个 IM message ID，并完成正文增量和两张卡片终态；状态 `verified_once`。该验证未模拟 WS 输入或调用真实模型，不等同于一次完整 Bot 新对话或人工客户端展示验收。
- 当前私有实例已设 `streaming-cards`，SQLite 已迁至 v2，服务恢复 `ready / connected`；此前 8 条收件箱 sent 保留，0 个未决。上述验证使用独立私人投递账本，不伪造生产输入。

仓库精简的文件与磁盘结果记录在 [SPEC-0017](../specs/0017-repository-simplification.md)；三层目录收敛记录在 [SPEC-0018](../specs/0018-host-channels-plugins.md)。

## 未实现

- 具体外部 Agent、MCP/A2A 业务接入、设备和自己的 App。
- 群聊、附件、语音。
- 自动记忆写入、语义检索、跨设备同步。
- 周期调度、主动推送、无人审批外部写入。
- 多实例/多主机 lease、fencing、跨主机恢复和长期 soak。
- 恶意插件的 OS 级隔离、磁盘字段级加密和自动 retention。

## 数据

`data/server` 是当前权威实例配置与运行状态目录，不入 Git；不含凭据的 provider 定义位于 `profiles/providers/`。旧 MVP 数据归档后只用于读回或回滚，不由当前服务加载。完整私人配置、消息和 Session 仍是敏感数据；“普通日志不打印凭据”不等于全盘加密。

## 状态词

- `proposed`：方案。
- `implemented`：代码存在。
- `locally verified`：指定本机离线证据通过。
- `verified_once`：真实环境成功一次。
- `enabled`：目标部署正在启用。

后一个状态不能由前一个自动推断。历史 MVP、设计和验收细节使用 Git 历史查看，不在当前事实文件重复保存。
