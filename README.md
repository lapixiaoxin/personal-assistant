# lumi

属于自己的超级管家：多个终端通过独立通道接入同一个 DSH Host，个人习惯和各种能力以插件形式按需扩展。

DSH 负责推理、规划、Session、工具与子 Agent 调度；lumi 只维护 Host、个人资产、可信插件、通道和部署。私聊每条主线消息开启独立飞书话题与 DSH Session；可选白名单群聊只处理显式 @Bot 的消息。其他终端、外部 Agent、设备和业务动作尚未接入。

## 结构

```text
host/                       DSH 进程、通道宿主、持久收件箱和本地状态
channels/feishu/            飞书认证、输入规范化和消息回复
plugins/personal-context/   个人记忆、上下文投影和 DSH 插件
profiles/                   可版本化的 Host 与模型 provider 组合
deploy/                     配置样例和 systemd 模板
tests/                      跨层 DSH 契约
docs/                       当前事实、设计和运行规程
specs/                      当前增量规范
```

新增终端时增加 `channels/<surface>`；新增个人能力时增加 `plugins/<capability>`。Channel 不依赖 DSH，Plugin 的 `src/domain/` 不依赖 DSH 或平台 SDK，Host 是唯一组合与持久运行入口。

历史 MVP、设计轮次和验收记录保留在 Git 历史，不在当前工作树重复维护。

## 启动

要求 Node `>=22.19.0`、pnpm `10.20.0`。DSH 固定为 `0.2.0-rc.2`。
仓库包含 `.node-version`；pnpm 脚本也会优先使用本机未跟踪的 `data/tooling/node-v22.19.0`，否则检查 PATH 中的 Node。

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

example 只用于首次复制，不会被运行时读取，也不得写入真实凭据。若私有配置已经存在，禁止用模板覆盖。在 `data/server/config.json` 中配置模型、飞书 App ID / Secret 和同一应用下的 owner `open_id`；群入口另需精确 `groupChatIds` 白名单。模型 Key 放在未提交的 `.env`。完整边界见[部署资产说明](deploy/README.md)，操作步骤见[飞书部署](docs/runbooks/server-feishu.md)。

Bot 私聊支持普通文本和：

```text
/help
/new
/cancel
/stop
/status
```

普通对话可在私有配置中设置 `feishu.replyMode: "native-cot"`，使用飞书原生折叠进度和流式正文两条消息；`streaming-cards` 保留双卡片形式。默认保持文本模式；正文需 CardKit 权限，步骤见[飞书部署](docs/runbooks/server-feishu.md#双消息流式回复)。

本机状态：

```bash
pnpm server:status
```

## 数据与恢复

当前权威数据位于 `data/server/`：

- `channels.db`：平台输入、回复意图和回执。
- `dsh/`：原生 Session。
- `workspace/`：DSH 工作目录。
- `config.json`：私有实例选择与飞书凭据。

不含凭据的 provider 定义位于 `profiles/providers/` 并随代码版本管理；模型 Key 放在 `.env` 或部署 secret store。`providerPatch` 只保留给实例级自定义覆盖。

重复平台消息只处理一次。重启只继续尚未执行的 `queued` 和尚未发送的 `ready`；`running` 变为 `interrupted`，`sending` 变为 `unknown`，两者均不自动重复。

收件箱新版为 SQLite v4。它按飞书话题/群 @Bot scope 保存 DSH Session 映射，并额外保存流式卡片/COT ID、回执、更新 sequence 和进度事件状态；重启只收尾已知消息，不重放模型或未知发送。进度追加结果不明保留独立证据，不自动重复追加。

## 开发

```bash
pnpm check
pnpm test:dsh
pnpm test:dsh:bundle
pnpm check:dsh:latest
python3 scripts/check-docs.py
```

完整门禁覆盖 lint、类型、架构、DSH 版本、单元/契约测试与 Host 构建。真实 Bot 成功只标 `verified_once`，不外推为长期稳定。

[工程事实](docs/current-state.md) · [架构](docs/design/02-architecture.md) · [安全](docs/design/05-safety.md) · [路线](docs/design/07-roadmap.md) · [文档导航](docs/README.md)
