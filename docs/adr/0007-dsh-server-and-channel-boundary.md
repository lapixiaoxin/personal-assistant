# ADR-007 · DSH 常驻核心与外围通道

状态：Accepted · 2026-10-14。

## 决定

1. 官方 SDK 启动一个持久 DSH 进程；通道插件调用原生 Agent create/resume/followup/cancel，不扩展 SDK wire protocol。
2. DSH 是唯一通用推理、规划、Session、工具和 Agent 调度核心。
3. `channels/feishu` 只负责平台认证与传输；`channel-store` 只保存平台收发事实和 Session 映射。
4. 个人记忆与 `personal-context/v1` 独立于 DSH 和 Surface。
5. 飞书只接受专用应用的单 owner 私聊文本；入口身份不授予业务动作。
6. DSH 完整依赖图固定同一 release，发现新版本与实际升级/部署分离。

## 原因

旧 lumi Task Core 重复了 DSH 已有的 Harness 职责，并让原生多轮与恢复更难利用。原生 Agent API 比公共一次性 run API 更符合持久通道，同时保持本仓只做薄接线。

平台、SQLite 与 DSH 历史无法形成一个事务，因此选择保存意图并在不确定时停止，而不是自动重放。

## 后果

- 原生 Agent API 是明确的升级兼容边界，必须有真实运行时契约测试。
- 进程内工具 guard 只适用于受信插件；第三方代码仍需隔离。
- 旧 MVP 从当前工作树退役，Git 历史是恢复入口。
- 新 App、Agent 或设备通过具体规范接入，不预建通用适配层。

## 证据

离线契约覆盖多轮、恢复、取消、拒绝工具和真实进程中断；真实飞书收发于 2026-10-14 首次通过。范围见 [SPEC-0016](../../specs/0016-dsh-server-feishu.md)。
