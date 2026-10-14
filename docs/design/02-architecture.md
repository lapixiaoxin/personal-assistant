# 系统架构

状态：当前实现 · 2026-10-14。

## 核心边界

```text
Feishu private chat
        |
channels/feishu          platform auth, normalize, reply
        |
plugins/dsh-channels     durable queue <-> native DSH Agent
        |                     |
packages/channel-store       DSH Session / Model / Tools / Agents
                              |
                       plugins/dsh-lumi
                              |
                   personal-context/v1 snapshot
                              |
                 personal memory (lumi-owned)
```

DSH 是唯一通用 Harness。lumi 不实现规划器、模型循环、专家路由或第二套 Session。个人身份、记忆、授权和结果证据不因插件运行在 DSH 进程中而归 DSH 所有。

## 模块

| 路径 | 唯一职责 | 禁止 |
| --- | --- | --- |
| `apps/server` | 配置、SDK 子进程、关闭与本地状态 | 规划、业务路由、平台逻辑 |
| `channels/feishu` | 官方 SDK 长连接、身份与消息格式 | DSH 依赖、业务授权 |
| `plugins/dsh-channels` | 组装 channel/store，调用原生 Agent 服务 | 自研 Agent Loop |
| `packages/channel-store` | 输入、回复意图、回执、Session 映射 | 平台 SDK、模型状态 |
| `plugins/dsh-lumi` | 将显式个人快照注入 DSH | 读取记忆数据库、授予动作 |
| `packages/personal-memory` | 可确认、纠正、撤回、遗忘的个人记录 | DSH/Surface 类型 |
| `packages/personal-context` | 有摘要的 Harness-neutral 快照 | 数据库和平台 SDK |
| `profiles` | DSH/server/provider 组合 | 凭据 |
| `deploy` | 配置样例和服务模板 | 私人运行数据 |

依赖方向由 `pnpm check:architecture` 检查：portable package 只依赖 package；channel 只依赖 package；plugin 可装配 package、plugin 和 channel；生产图无环。

## 对话流程

1. 官方飞书 SDK 建立认证长连接。
2. channel 校验 App、owner `open_id`、私聊、文本和长度。
3. 输入按稳定平台 message ID 先落 SQLite，再返回事件回执。
4. Host 串行取队列，创建或恢复映射的 DSH Agent。
5. DSH 管理 Session、提示词、模型和工具循环。
6. Host 保存回复意图，只向原消息发送一次。
7. 平台业务码和 message ID 有效后标 `sent`；不明确则标 `unknown`。

## 扩展原则

新能力先找 DSH 原生 Skills、MCP、Agent 或 Cordis 服务。只有上游缺少必要协议时才增加薄 adapter。没有实际调用方时不预建 `a2a/`、`devices/`、注册中心或调度器。

每项扩展必须先定义身份、最小上下文、动作权限、取消、幂等、结果证据和故障恢复。飞书身份只允许进入对话，不自动获得任何业务写权限。

## 部署假设

当前只支持一台主机、一个进程、一个 owner。SQLite 绑定 owner/app/open_id/hostname；跨主机复制需要显式迁移。私有配置、收件箱和 Session 均可能含敏感信息。

旧 MVP 已从当前工作树退役。需要历史代码时通过 Git 恢复匹配 commit，不在新 server 内重新接回旧 Core。
