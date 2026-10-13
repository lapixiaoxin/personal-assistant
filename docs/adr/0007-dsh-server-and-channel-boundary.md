# ADR-007 · DSH 常驻服务器与外围通道边界

状态：Accepted · 2026-10-13。基础代码本地验证；飞书真实启用未完成。关联 [SPEC-0016](../../specs/0016-dsh-server-feishu/spec.md)。

## 背景

用户希望只部署一个自己的超级管家，由一个入口调用未来各平台的个人 Agent、Code Agent 和设备；明确 DSH 接管通用核心，本仓维护个人化与外围扩展。Dots、Muse 只是例子，当前只建设基础和飞书入口。

旧 MVP 由 lumi Task Core 路由后为每任务启动 DSH，适合原来的任务 API，但复制了新方向下不再需要的通用协调。直接用 SDK `session(id).run()` 也不满足通道的跨进程历史恢复与单会话取消。

## 决定

1. 使用官方 SDK 启动一个持久 DSH 进程；插件通过原生 Agent create/resume/followup/cancel 接口接线，不扩展 SDK wire protocol，不自研 Agent Loop。
2. 通道与 DSH 分层。`channels/feishu` 只负责官方传输与规范化；`plugins/dsh-channels` 装配它与领域存储。新 `channel-store` 只保管平台收发事实和会话映射。
3. 默认入口变为 server；旧 CLI/Gateway/Workbench 显式保留为 legacy。新 server 不依赖旧 Core、registry 或 Task Ledger；旧数据和保护性验收不删除。
4. 个人记忆与 `personal-context/v1` 沿用 ADR-006，独立于 DSH 和入口。默认不导入旧库；显式快照才进入模型。
5. 飞书只接受专用应用中的单 owner 私聊文本，只回复原消息。默认关闭业务工具与委派，后续具体能力经权限与结果验收再启用。
6. 依赖固定 DSH `0.2.0-rc.2` 完整 release 图；自动检查新版本，升级与部署分开。

## 取舍

原生 Agent API 比公共 SDK 请求面更深，升级必须运行恢复和取消契约。接受这层薄插件兼容成本，避免维护第二套 Session/Agent 系统。

平台回执、SQLite 和 DSH 历史无法组成分布式事务。保存输入/回复意图，遇到中断或发送结果未知就保留未决状态，禁止自动重放。这会使少数请求需要人工继续，但不把网络错误误判成可以再次发送。

进程内工具 guard 适用于受信插件；不承诺对恶意代码隔离。当前只开放文本对话，未来外部写能力必须沿既有动作授权与证据原则增加具体出口。

## 与既有 ADR 的关系

ADR-001/003/005 中独立通用 Task Core、Web 优先入口和每任务 SDK 包装的未来实施建议被本记录替代；其余原则保留。ADR-004 继续描述 legacy 数据事实，ADR-006 的个人资产所有权继续有效。旧源码并未因新决定而完成迁移。

## 验证与退役

本地通过真实 DSH + 官方 mock 模型的多轮、恢复、新会话、取消、权限和真实进程崩溃契约；通过飞书官方 EventDispatcher 离线协议测试。部署、真实飞书、真实模型与长期运行单独记录，不从代码存在推断。

旧包退役按 [迁移清单](../runbooks/legacy-retirement.md) 执行，先证明个人数据可读回、需要的能力已替代，再删除无调用方的实现。回滚须恢复匹配版本的 DSH 数据备份。
