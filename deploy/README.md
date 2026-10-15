# 部署资产与私有实例

状态：当前约定 · 2026-10-14。

`deploy/` 只保存可提交的部署模板，不保存任何机器的真实配置、凭据或运行状态。真实实例默认位于 `data/server/`；两者字段相似是“模板复制为私有配置”，不是两份同时生效的配置。

## 配置归属

| 路径 | 是否提交 | 作用 | 是否被运行时读取 |
| --- | --- | --- | --- |
| `deploy/server.config.example.json` | 是 | 配置 schema 示例和安全占位值 | 否 |
| `deploy/lumi.service` | 是 | Linux systemd 模板 | 安装为 unit 后由 systemd 使用 |
| `data/server/config.json` | 否 | 当前实例唯一权威配置，含飞书凭据和模型选择 | 是 |
| `.env` 或 secret store | 否 | 模型 API Key | 启动时读取并白名单传给 DSH |
| `profiles/providers/*.patch.yml` | 是 | 不含凭据的 provider 协议和模型能力 | 匹配 provider 时由 Host 加载 |
| `data/server/{channels.db,dsh,workspace,status.json}` | 否 | 收发事实、Session、工作目录和状态 | 是 |

Host 按以下顺序选择配置：

1. 若设置 `LUMI_SERVER_CONFIG`，读取该绝对或当前工作目录可解析的路径。
2. 否则读取仓库根目录下的 `data/server/config.json`。
3. `deploy/server.config.example.json` 永远不会被自动读取或作为 fallback。

## Agent 部署规则

1. 不得把真实 App ID、App Secret、owner `open_id` 或模型 Key 写入 `deploy/`、`profiles/`、文档、日志、命令输出或 Git。
2. 仅当目标机不存在 `data/server/config.json` 时，才从 example 创建；已有配置不得被模板覆盖。
3. `data/server` 设为 `0700`，`config.json` 和 `.env` 设为 `0600`。不要通过放宽权限解决启动失败。
4. 飞书 `appId`、`appSecret` 和 `ownerOpenId` 必须来自同一个应用；`ownerOpenId` 不可从其他应用复用。省略 `groupChatIds` 或配置 `["*"]` 表示所有群中显式 @Bot 的消息可进入；`[]` 关闭群聊，精确 `oc_...` 列表用于收窄入口。
5. provider/model 选择写入私有 JSON，模型 Key 写入 `.env` 或目标机 secret store。常用 provider 定义进入 `profiles/providers/`。
6. 不打印完整私有 JSON。检查配置时只输出字段名、非敏感模型选择和脱敏状态。
7. 启动前执行离线门禁；真实消息发送属于单独验收，不因服务启动成功而自动执行。
8. example 的 `feishu.replyMode` 默认 `text`。启用 `native-cot` 或双卡片流式回复前核对 `cardkit:card:write` 和客户端版本；启用群入口前核对 `im:message.group_at_msg:readonly`。已有 v1/v2/v3 收件箱升级前先正常停止并完整备份。新版使用 v4，回退文本模式保留 v4，不直接用旧代码打开新版库。详见[飞书服务器 SOP](../docs/runbooks/server-feishu.md)。

## 新机器首次部署

以下流程创建一个没有历史 Session 和收发记录的新实例：

```bash
git checkout <approved-commit>
pnpm install --frozen-lockfile
mkdir -p data/server
chmod 700 data/server
test ! -e data/server/config.json
cp deploy/server.config.example.json data/server/config.json
chmod 600 data/server/config.json
```

随后由授权操作者或 secret 注入流程填写 `data/server/config.json` 与 `.env`，再执行：

```bash
pnpm check
pnpm test:dsh:bundle
python3 scripts/check-docs.py
pnpm build
pnpm start
```

确认控制台出现 ready 后，用 `pnpm server:status` 核对 `connected` 和未决记录。首次真实飞书收发按[飞书服务器 SOP](../docs/runbooks/server-feishu.md)单独执行。

## 新部署与迁移不同

- **新部署**：只复制 example 生成私有配置；不要复制旧 `channels.db`、`dsh/`、`workspace/` 或 `status.json`。
- **同机恢复**：停止服务后，恢复匹配 commit/DSH 版本的整个 `data/server/`，不能只复制 SQLite 主文件。
- **跨机器迁移历史**：当前没有 hostname/owner 数据迁移工具，不支持直接复制后改数据库或强行启动。应创建新实例，或先新增迁移规范与验证工具。

## Linux systemd

`lumi.service` 假设仓库位于 `/opt/lumi`、运行用户为 `lumi`，并把 `LUMI_SERVER_CONFIG` 指向 `/opt/lumi/data/server/config.json`。安装前必须按目标机实际路径核对 `WorkingDirectory`、`ExecStart`、`Environment` 和 `ReadWritePaths`。

Linux systemd 当前仍是 `not_run` candidate。Agent 可以生成和检查安装步骤，但不得把模板存在或 unit 启动成功写成生产部署已验证。
