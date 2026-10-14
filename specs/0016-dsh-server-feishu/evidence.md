# SPEC-0016 · 证据

状态：passed / locally verified；飞书 live not_run。基础提交：`648ae62`。日期：2026-10-13。

## 环境和版本

macOS，Node 22.19.0 / pnpm 10.20.0。默认 shell Node18 不满足项目约束，使用本机已安装的 Node22 PATH；不降低项目要求。隔离 worktree 开发，主工作区三份用户 SVG 未修改。

DSH 精确 release `0.2.0-rc.2`，官方源码 tag `dsh-v0.2.0-rc.2`；飞书 SDK `1.75.0`。源码核验覆盖原生 Agent create/resume、setup/created、inbox、followup/cancel/whenIdle 与工具 restrict/guard。未复制上游源码进仓库。

## 已执行验证

| 命令/场景 | 实际结果 | 证明范围 |
| --- | --- | --- |
| `pnpm check`，修正正式 profile 后再次执行 | 32 文件 / 223 测试通过；lint、typecheck、架构、DSH 版本与 server/CLI/Gateway/Workbench 构建通过 | 新基础与旧保护性回归；JS 不属于 TypeScript 静态检查范围 |
| 架构门禁 | 27 包、53 生产文件、66 内部生产边、14 项规则自测通过 | channels 不依赖 DSH，领域包不依赖 DSH/飞书，插件可装配通道 |
| `check:dsh` | 280 lockfile DSH 包全部为同 release，workspace 声明与安装结果一致 | 无混合 DSH 运行图 |
| `check:dsh:latest` | `latest=0.2.0-rc.2, 4 compatible packages` | 当天 registry 最新 release，不是自动升级服务 |
| `test:dsh:bundle` | tarball、隔离安装、组合、临时 Web 启动通过 | 旧外部 lumi bundle 在新 DSH 的兼容性；临时目录由脚本清理 |
| 新 DSH 通道契约 5 项 | 使用正式 server profile，替换真实传输为测试专用 loopback；全部通过 | 多轮去重、原生跨进程 resume、新会话、陌生用户拒绝、未知发送不重发、工具拒绝、取消、真实 SIGKILL 后不重放 |
| 飞书边界测试 10 项 | 官方 EventDispatcher 接收真实 v2 事件形状；fake 发送客户端 | app/owner/p2p/text 校验、重投语义、业务回执和错误正文隔离、UTF-8 截断；未连接飞书 |
| ChannelStore 3 项、配置 2 项 | SQLite 与私有临时配置通过 | 幂等冲突、单进程所有权、重启状态、配置权限和环境白名单 |
| 正式 profile `--dump-config` | 修正后成功展开 | DSH launcher 能解析真实部署 overlay；未运行真实平台连接 |
| 构建后 `pnpm start`，指定不存在配置 | 按预期退出 1，只有固定诊断文本 | 构建入口和包链接可加载；缺配置不启动宽权限降级 |
| `python3 scripts/check-docs.py` | passed | 本地文档链接、既有 SPEC-0001 追溯约束保持通过 |

正式 profile 验证中发现 `disabled: !!js !process.env...` 被 YAML 当作重复 tag，改为引用 JS 表达式后解析成功。原生契约现在先加载正式 overlay，再禁用真实飞书装配、换入测试传输；不再使用独立 persona 配置掩盖正式配置错误。修正后 5 项定向契约及全门禁重跑通过。

初期新会话用例还曾因 mock 响应序列耗尽失败，已明确配置 repeatLast；旧保护性 DSH 契约 11 项未改。安装时内部镜像元数据不全及 pnpm 写入位置受限，使用公开 registry、隔离 tooling 目录和既有 store 完成安装，没有关闭检查或放宽版本要求。

## 2026-10-14 · 默认构建边界收口

此前 `start/dev` 已切到新 server，但根 `pnpm build` 仍同时生成旧 CLI、Gateway 与 Workbench，默认产物与架构主线不一致。现将 `tsup.config.ts` 收敛为 server 单入口，旧入口移到 `tsup.legacy.config.ts` 和显式 `build:legacy`；`test:e2e` 相应只构建 legacy。

首次加入产物检查时发现 tsup 的 `clean: true` 不会删除另一配置产生的 `dist/server`，证明两套构建仍可能混装。改为每次构建前由 `scripts/clean-dist.mjs` 删除完整 `dist/`，再由 `check-build-output.mjs` 检查顶层集合：

- legacy 必须且只能包含 `cli / gateway / workbench`；
- 默认 server 必须且只能包含 `server`。

完整 `pnpm check` 最终通过：32 文件 / 223 项测试、架构与 DSH 版本检查、两类构建边界均通过，结束时 `dist/` 只含 `server/main.js` 及 source map。首次全量运行有一个既有 CLI recovery 用例在 5 秒阈值超时；未修改测试或实现，单独重跑 2/2 通过，随后无其他并行验证负载的完整门禁 223/223 通过。

## 交付与迁移

新增 SDK server、原生会话接线插件、飞书通道、收发存储、server profile 与部署配置。默认构建及启动均转到 server，旧入口保留显式 legacy 命令；README/架构/路线删除重复旧默认叙述，专题 SOP 保留操作。ADR-007 明确 DSH 通用核心与个人外围职责。

[退役计划](../../docs/runbooks/legacy-retirement.md) 逐项列出旧入口与数据；未强行移动仍有调用方的包，没有删除旧库、用户 SVG 或旧保护性测试。[服务器 SOP](../../docs/runbooks/server-feishu.md) 包含专用 Bot、故障、备份、升级和回滚。

新的 `channels.db` schema v1 独立于旧 Task Ledger，未作生产数据 migration。回滚先停止 server，保留未决结果，再恢复匹配代码版本的全数据备份；回滚不会撤销已经送达的消息。

本实现提交可由本文件 Git 历史定位。普通 commit/push 按既有授权执行，远端同步状态以交付报告与 Git 引用为准，不能由本文推断部署完成。

## 未验证与剩余工作

- 专用飞书凭据未配置；未实测平台收发、租户权限、网络断线重连和真实云模型。未复用 lark-cli 的其他应用身份或向任何人发送测试消息。
- systemd 为 candidate，未操作服务器；未重启/切换现有 Gateway 或 Web 服务。新默认命令不等于已部署。
- 每日 GitHub 新鲜度工作流已配置，远端执行尚未观察；不自动修改依赖或重启服务。
- 当前只有对话和可选个人快照状态；没有具体个人 Agent、ACP/A2A、设备、App、自动记忆、周期推送或业务动作。
- 单机单进程；没有跨主机迁移、分布式 fencing、OS 恶意插件隔离、磁盘加密、数据保留自动清理或长期 soak。终止性飞书连接错误在运行后只记录状态，需人工检查/重启。
- 快照内容进入 DSH 历史，纠正不会抹除旧会话。`interrupted/unknown` 保留人工处理，不提供盲重试或未知结果清除命令。

下一步是配置专用应用并按 SOP 完成真实收发与服务器启停验收；后续扩展由实际需求选取一种能力，不默认接入 Dots/Muse。
