# lumi

属于自己的超级管家：部署一套服务，通过一个入口对话，后续按需组织 Agent、工具和设备。

DSH 负责推理、规划、Session、工具与子 Agent 调度；lumi 只维护个人资产、可信插件、通道和部署。当前能力是单 owner 飞书 Bot 私聊文本，已完成一次真实收发验证。具体外部 Agent、设备和业务动作尚未接入。

## 结构

```text
apps/server/              SDK 启动、DSH 生命周期、本地状态
channels/feishu/          飞书长连接、身份校验、消息回复
plugins/dsh-channels/     通道与 DSH 原生 Agent 接线
plugins/dsh-lumi/         可移植个人上下文插件
packages/channel-store/   收件箱、会话映射、回执与故障状态
packages/personal-*/      独立于 DSH 的个人记忆与上下文
profiles/                 server 与模型 provider 配置
deploy/                   配置样例和 systemd 模板
docs/                     当前事实、设计和运行规程
specs/                    当前增量规范
```

历史 MVP、设计轮次和验收记录保留在 Git 历史，不在当前工作树重复维护。

## 启动

要求 Node `>=22.19.0`、pnpm `10.20.0`。DSH 固定为 `0.2.0-rc.2`。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

首次运行：

```bash
mkdir -p data/server
cp deploy/server.config.example.json data/server/config.json
chmod 700 data/server
chmod 600 data/server/config.json
```

在私有 JSON 中配置模型、飞书 App ID / Secret 和同一应用下的 owner `open_id`；模型 Key 放在未提交的 `.env`。完整步骤见[飞书部署](docs/runbooks/server-feishu.md)。

Bot 私聊支持普通文本和：

```text
/help
/new
/cancel
/status
```

本机状态：

```bash
pnpm server:status
```

## 数据与恢复

当前权威数据位于 `data/server/`：

- `channels.db`：平台输入、回复意图和回执。
- `dsh/`：原生 Session。
- `workspace/`：DSH 工作目录。
- `config.json` 与 provider patch：私有运行配置。

重复平台消息只处理一次。重启只继续尚未执行的 `queued` 和尚未发送的 `ready`；`running` 变为 `interrupted`，`sending` 变为 `unknown`，两者均不自动重复。

## 开发

```bash
pnpm check
pnpm test:dsh
pnpm test:dsh:bundle
pnpm check:dsh:latest
python3 scripts/check-docs.py
```

完整门禁覆盖 lint、类型、架构、DSH 版本、单元/契约测试与 server 构建。真实 Bot 成功只标 `verified_once`，不外推为长期稳定。

[工程事实](docs/current-state.md) · [架构](docs/design/02-architecture.md) · [安全](docs/design/05-safety.md) · [路线](docs/design/07-roadmap.md) · [文档导航](docs/README.md)
