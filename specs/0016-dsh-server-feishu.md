# SPEC-0016 · DSH 管家基础与飞书入口

状态：`verified_once` · 2026-10-14。

## 范围

单机、单 owner 的 lumi 由官方 SDK 启动持久 DSH。DSH 拥有推理、规划、Session、工具和 Agent 调度；lumi 只维护个人资产、可信插件、通道与部署。

当前入口为飞书自建 Bot 私聊文本。通道校验 App、owner `open_id`、私聊和文本；输入先持久化，按平台 message ID 去重。回复保存发送意图与平台回执；中断生成和发送结果未知均不自动重放。

默认只开放对话与可选 `personal-context/v1` 状态工具。文件、Shell、网络、外部 Agent、设备和业务动作未启用。具体产品接入不在本规范范围。

## 实现边界

- `host`：配置、SDK 子进程、通道宿主、持久收件箱、回执和生命周期。
- `channels/feishu`：官方长连接、事件规范化和回复。
- `plugins/personal-context`：可迁移的个人记忆、上下文快照和 DSH 注入。
- `profiles/server`、`profiles/providers`：最小 DSH 组合。

物理目录由 [SPEC-0018](0018-host-channels-plugins.md) 收敛，配置、数据库和收发协议未变化。

私有配置必须为 `0600`，不进入 Git；SDK 子进程只继承白名单环境变量。数据默认位于 `data/server`，只支持同机单进程。

## 验证

- DSH `0.2.0-rc.2` 精确依赖图。
- 真实 DSH + 官方 mock 模型通过多轮、重启恢复、`/new`、`/cancel`、工具拒绝和真实进程中断测试。
- 飞书官方事件分发和发送协议通过离线测试。
- 2026-10-14 真实 Bot 观察到 4 条 `sent` 回执、1 个 Session、0 个未决结果；状态为 `verified_once`，不是长期稳定性保证。
- MiniMax `MiniMax-M3.1-Flash-Preview` 使用 tracked OpenAI-compatible provider profile；官方模型列表查询确认当前 Key 可见该模型。

## 回滚

停止服务，保留 `interrupted/unknown` 记录，恢复匹配代码版本的完整 `data/server` 备份。代码回滚不撤销已经送达的飞书消息，也不允许旧 DSH 直接打开新版 Session 数据。
