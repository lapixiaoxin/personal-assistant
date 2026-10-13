# DSH 上游与持续升级

当前组合：**0.2.0-rc.2**，2026-10-13 验证。主路径为官方 SDK 启动常驻 DSH，加本仓 Cordis 插件；旧 Task adapter 与外部 Web bundle 保留兼容。证据见 [SPEC-0016](../specs/0016-dsh-server-feishu/evidence.md)。

## 依赖策略

通过 npm 精确依赖和 lockfile 复现，不复制 DSH 源码、不使用 submodule。SDK、umbrella、mock、tools 以及所有插件 peer 必须为同一个 release；部分子包 dist-tag 可能滞后，不能逐包直接追 `latest`。

DSH 负责全部通用核心。需要扩展时先查原生服务、插件、Skills、MCP/Agent 接口；若上游确实缺少必要能力，再以独立 adapter 或短期 fork 验证，并优先贡献上游。个人记忆、通道公开协议和领域模块不得泄漏 DSH 类型。

允许 DSH 兼容改动的边界：`apps/server`、`adapters/dsh`、`adapters/task-personal-context`、`plugins/dsh-*`、`profiles/*`、DSH 契约测试与检查脚本。`channels/*` 只依赖平台 SDK；领域包继续独立。

## 发现新版

`pnpm check:dsh:latest` 显式联网查询 `@deepseek-ai/dsh` 的 latest，并确认兼容包存在同 release。本次结果为 `latest=0.2.0-rc.2`、4 个兼容包匹配。registry 不可用或本地落后时明确失败，不静默当作最新。

[每日工作流](../.github/workflows/dsh-latest.yml) 每天 UTC 02:17 和手动触发执行同一检查，只有仓库读取权限；已配置，尚未观察远端 CI 运行。它不会改依赖、创建发布或重启线上服务。是否产生站外通知由仓库 GitHub 设置决定。alpha 仅作为专项评估候选，不自动提升为部署目标。

## 一次升级的完整顺序

1. 从新鲜度检查和 release notes 确认目标版本、兼容包与官方源码 tag。
2. 隔离 worktree，同步根和模块 manifests、peer overrides/packageExtensions、lockfile 与 `upstream.lock.json`。
3. 安装完整图，运行 `pnpm check:dsh`；它检查所有 workspace 声明、实际安装及 lockfile 的每个 DSH package。
4. 核对 SDK 生命周期、Agent create/resume/cancel、Session event、profile patch、tools guard 和 Preset 变化；不在领域层增加版本分支。
5. 执行 `pnpm check`。其中旧 SDK/动作边界契约和新原生通道契约均须通过，不能以改弱测试换兼容。
6. 执行 `pnpm test:dsh:bundle` 和 `pnpm check:dsh:latest`，记录结果；真实模型/飞书按改动风险另做 opt-in 验收。
7. 通过后普通提交并推送，记录验证环境、失败史和部署是否切换。必要时按已有授权开独立分支，无需强制每次开 PR。
8. 部署前停止进程并保存全数据快照与代码版本；切换后读回验证。失败恢复匹配版本备份，不让旧 DSH 直接打开新版本 Session。

`pnpm-workspace.yaml` 的 peer override 用于上游发布图兼容。每次升级重建并检查，不将当前列表当作永久 API。上游修复依赖声明后可在独立增量中删冗余项。

## 事实来源

`upstream.lock.json` 是选定组合与验证日期；`pnpm-lock.yaml` 是完整解析图；`package.json` 和各模块 manifests 是运行依赖。DSH `0.2.0-rc.2` 的官方源码锚为 `dsh-v0.2.0-rc.2`，用于接口核验，不打包进本仓。

Desktop 尚未接入。未来自己的 App/桌面端只是独立 Surface，不能直接拥有个人资产数据库或复制业务授权；入口更新与 DSH 升级分别验收。备份和回滚细节见 [服务器 SOP](runbooks/server-feishu.md)。
