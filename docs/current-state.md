# lumi 工程事实

更新：2026-10-14。

## 当前能力

| 范围 | 事实 |
| --- | --- |
| 核心 | 官方 SDK 启动 DSH `0.2.0-rc.2` 常驻进程；DSH 拥有 Agent、Session、模型和工具循环 |
| 入口 | 飞书自建 Bot，单 owner 私聊文本，官方长连接，无公网回调 |
| 会话 | 原生 Agent create/resume/followup/cancel；支持多轮、`/new`、`/cancel` |
| 收发 | SQLite 去重、串行处理、回复意图和平台 message ID 回执 |
| 恢复 | queued/ready 继续；running→interrupted，sending→unknown，不自动重放 |
| 权限 | 默认无文件、Shell、网络、外部 Agent 或业务动作工具 |
| 个性化 | 可选 `personal-context/v1` 快照；个人记忆/上下文独立于 DSH |
| 模型 | 当前私有部署为 MiniMax M3.1 Flash Preview；仓库样例保持稳定 catalog 模型 |
| 部署 | macOS 前台运行已验证；systemd 仅为 Linux candidate |

## 证据

- 完整离线门禁在精简前通过 32 个文件 / 223 项测试。
- DSH 原生通道契约覆盖多轮、重启、取消、新会话、工具拒绝和真实 `SIGKILL`。
- 飞书边界测试使用官方 EventDispatcher，覆盖身份、消息类型、重复和发送回执。
- 2026-10-14 真实服务观察到 4 条 `sent`、1 个 Session、0 个 `interrupted/unknown`；状态为 `verified_once`。
- MiniMax 中国区模型列表以当前 Key 返回并包含 `MiniMax-M3.1-Flash-Preview`。

本次仓库精简后的最终文件数、测试数与磁盘结果记录在 [SPEC-0017](../specs/0017-repository-simplification.md)。

## 未实现

- 具体外部 Agent、MCP/A2A 业务接入、设备和自己的 App。
- 群聊、附件、语音、逐 token 流式展示。
- 自动记忆写入、语义检索、跨设备同步。
- 周期调度、主动推送、无人审批外部写入。
- 多实例/多主机 lease、fencing、跨主机恢复和长期 soak。
- 恶意插件的 OS 级隔离、磁盘字段级加密和自动 retention。

## 数据

`data/server` 是当前权威运行目录，不入 Git。旧 MVP 数据归档后只用于读回或回滚，不由当前服务加载。完整私人配置、消息和 Session 仍是敏感数据；“普通日志不打印凭据”不等于全盘加密。

## 状态词

- `proposed`：方案。
- `implemented`：代码存在。
- `locally verified`：指定本机离线证据通过。
- `verified_once`：真实环境成功一次。
- `enabled`：目标部署正在启用。

后一个状态不能由前一个自动推断。历史 MVP、设计和验收细节使用 Git 历史查看，不在当前事实文件重复保存。
