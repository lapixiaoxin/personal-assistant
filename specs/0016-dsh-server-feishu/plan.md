# SPEC-0016 · 实施设计

状态：基础实现与本地验证完成 · 2026-10-13；飞书真实启用待专用应用。

## 职责

- `apps/server`：配置校验、官方 SDK 进程生命周期、运行目录、退出状态。
- `plugins/dsh-channels`：DSH 原生会话接线、持久输入/回复状态、平台传输装配；不做规划、模型调用或专家路由。
- `channels/feishu`：官方 SDK 长连接、事件规范化、目标绑定回复与平台回执；无 DSH 业务逻辑。
- `packages/channel-store`：平台无关的 SQLite 收件箱、会话映射、投递意图及单进程所有权。
- `plugins/dsh-lumi` / `packages/personal-*`：沿用可移植个人数据和上下文。
- `profiles/server`：最小 SDK 配置、lumi 人格、工具白名单；新增能力通过 DSH 插件扩展。
- `deploy`：单实例服务配置；`docs/runbooks`：配置、备份、故障恢复与升级。

插件可装配通道与领域服务；领域服务不依赖 DSH/飞书 SDK。不提前创建没有调用方的设备或 A2A 实现。

## 持久化与故障

独立 `data/server`，旧 `data/assistant.db` 不受影响。平台输入键绑定 app、chat、sender、message；摘要冲突拒绝。串行持久队列降低同一 Session 回复错配。启动将 `running` 标为 `interrupted`，将 `sending` 标为 `unknown`，不重跑模型或重发未知回复。只继续明确尚未开始的 queued 输入及尚未发送的 ready 回复。未知记录可本地查询，人工确认后以新输入继续。

Session ID 由通道映射持有，历史与执行归 DSH。恢复调用 `agents.resume()`；恢复失败不静默新建同名会话。输入结束只说明生成完成；不将回复作为外部动作核验证据。

飞书事件处理先做同步 SQLite 提交，迅速返回，后台异步执行。Owner 私聊是通道认证边界，不扩大工具权限。默认工具管线关闭文件、Shell、网络、MCP 和委派，待具体能力的权限/回执验收后再启用。

## 备选与迁移

不采用 SDK `session(id).run()` 处理长期通道：当前公共 SDK 不自动恢复未知 Session，也缺少单会话取消。采用 SDK 引导 + DSH 内插件调用公开的原生 Agent 服务；不私自扩展 SDK wire protocol。

旧控制层与工作台保留兼容入口，旧保护性测试照常运行。新路径运行验收后才变更默认命令。真正删除旧包须有数据读回/导出、所需能力替代和用户明确退役范围，不能把旧功能静默带入新权限环境。

实施收敛：默认命令已基于本地原生会话契约与构建切换，实际服务未切换。冗余默认叙述与重复操作清单已从 README/架构/路线移除；旧生产包尚有调用方，暂不物理搬目录或删除，按退役 SOP 逐项处理。DSH 进程内插件用 ESM JavaScript，与现有外部 bundle 一致；JS 行为由 lint 和真实运行时契约覆盖，不能把 TypeScript 检查解释为对全部 JS 的静态类型证明。

## 验证与回滚

相关负向/持久化测试 → 真实 DSH mock-provider 契约 → 完整 `pnpm check` → bundle 安装 → 文档链接/新鲜度检查。飞书 live 单独记录。

停止服务器并备份整个新数据目录、配置和精确版本。回滚代码不自动降级 DSH Session 格式；恢复匹配版本的备份，新旧数据不混写。旧路径继续使用旧库，不能并行多实例写新收件箱。
