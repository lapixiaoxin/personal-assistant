# lumi

属于自己的超级管家：在自己的服务器部署，通过一个入口对话，逐步组织个人助手、Code Agent、工具与设备。DSH 负责推理、规划、会话、工具和子 Agent 调度；lumi 维护个人资产、插件、通道和部署。

当前交付是基础架构与飞书文本入口。**代码和离线契约已验证，真实 Bot 收发尚未验证，也未切换现有运行服务。** Dots、Muse 是产品例子，当前未接入任何具体外部 Agent。完整边界见 [工程事实](docs/current-state.md) 和 [SPEC-0016 证据](specs/0016-dsh-server-feishu/evidence.md)。

## 工程结构

```text
apps/server/              SDK 启动、DSH 进程生命周期、本地状态查询
plugins/dsh-channels/     通道与 DSH 原生 Session 的接线
channels/feishu/          飞书官方长连接、身份校验、文本回复
packages/channel-store/   收件箱去重、会话映射、投递回执与故障状态
plugins/dsh-lumi/         可移植个性化上下文插件
packages/personal-*/      独立于 DSH 的个人记忆与上下文契约
profiles/server/         管家 profile、persona、能力启用边界
profiles/providers/      模型提供方配置
deploy/                  私有配置样例与单机服务模板
docs/                    架构、路线、部署与验收
specs/                   每个工程增量的范围和证据
```

新入口不依赖旧 Assistant Core、任务正则路由或每任务 SDK 子进程。通道队列只保证收发可靠性，执行与历史由 DSH 原生 Agent 服务管理。未来能力优先复用 DSH 的 Skills、MCP 和子 Agent 扩展；需要 ACP/A2A 或设备协议时再增加具体适配器，不预建空框架。

[架构与职责](docs/design/02-architecture.md) · [发展路线](docs/design/07-roadmap.md) · [旧模块退役计划](docs/runbooks/legacy-retirement.md) · [文档导航](docs/README.md)

## 启动管家

要求 Node **>=22.19.0**、pnpm **10.20.0**。DSH 全依赖图固定 **0.2.0-rc.2**。

```bash
pnpm install --frozen-lockfile
mkdir -p data/server
chmod 700 data/server
cp deploy/server.config.example.json data/server/config.json
chmod 600 data/server/config.json
```

编辑私有 `data/server/config.json`，填入专用飞书应用的 App ID、App Secret 和该应用下你的 `open_id`。在根目录 `.env` 配置模型 Key；样例使用 `minimax-cn / MiniMax-M3`，对应 `MINIMAX_CN_API_KEY`。飞书凭据不写入 `.env` 或仓库。配置路径相对于配置文件解析。

按 [飞书部署 SOP](docs/runbooks/server-feishu.md) 完成机器人、权限、事件与应用可用范围设置后：

```bash
pnpm build
pnpm start
# 查看连接最近状态、收发计数和未决记录
pnpm server:status
```

开发使用 `pnpm dev`。可用 `LUMI_SERVER_CONFIG` 指定私有配置路径。新服务采用出站长连接，不开放公网 HTTP 回调端口。

私聊支持普通文本、`/help`、`/new`、`/cancel`、`/status`。当前只启用对话；默认不开放文件、Shell、网络工具、外部 Agent 和设备操作。可选 `personalContextPath` 只读取显式选定的快照，不自动导入旧库或写入长期记忆。

## 数据与恢复

默认新数据目录为 `data/server/`：`channels.db` 保存收发状态，`dsh/` 保存原生会话，`workspace/` 为工作目录。均为本机私有数据，不入 Git。

重复消息按平台 ID 去重。重启后只继续未开始输入和未开始发送的回复；模型处理中断为 `interrupted`，发送结果不确定为 `unknown`，均不自动重复。`/new` 保留旧会话，`/cancel` 停止生成并清除排队输入，不撤销已经送达的回复。备份与恢复应覆盖整个数据目录，见部署 SOP。

## 验证与升级

```bash
pnpm check
pnpm test:dsh:bundle
pnpm check:dsh:latest
python3 scripts/check-docs.py
```

`check` 覆盖 lint、TypeScript 检查、架构边界、DSH 精确版本、测试与构建。新插件使用 ESM JavaScript，其行为由运行时契约验证。真实 DSH + 官方 mock 模型测试不代表真实飞书或云模型验收。依赖镜像缺少预发布包时可显式指定 `--registry=https://registry.npmjs.org`。

每日 CI 及手动新鲜度检查比较 DSH 官方最新 release；实际升级须同步锁定组合并通过契约、bundle 和完整门禁，再切换部署。不会自动更新运行中的服务。见 [上游策略](docs/upstream-strategy.md)。

## 旧 MVP 兼容入口

旧 CLI、Gateway、Workbench 及任务/动作/记忆/提醒数据保留，进入维护与逐项退役阶段。`pnpm start`、`pnpm dev` 已改为新服务器，旧 Gateway 改用：

```bash
PA_EXECUTOR=mock PA_DATA_DIR=./data/legacy-smoke pnpm dev:legacy
# 构建后的旧 Gateway
pnpm start:legacy
# 原 CLI 与前端开发命令继续有效
pnpm cli --help
pnpm dev:web
```

旧环境变量 `PA_*` 与 `data/assistant.db` 保持兼容。旧能力尚未迁入飞书 profile；旧工作台通过 Gateway 访问，[操作规程](docs/runbooks/web-workbench.md) 与 [原 MVP 验收](docs/evidence/2026-09-25-mvp-acceptance.md) 继续保留。宽权限 coding profile 仍只用于本机开发。

开发者从 [AGENTS](AGENTS.md) 接手；生产代码位于模块 `src/`，自有测试位于同级 `tests/`。打开 [lumi.code-workspace](lumi.code-workspace) 可隐藏生成目录；保留 pnpm 依赖链接，不手动合并 `node_modules`。
