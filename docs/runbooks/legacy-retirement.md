# 旧 MVP 兼容与退役

状态：candidate · SPEC-0016 / 2026-10-13。新启动入口与旧回归测试已本地验证；数据迁移和旧包删除尚未执行。

## 当前分工

| 代码 | 状态 | 后续处理 |
| --- | --- | --- |
| `apps/server`、`channels/feishu`、`plugins/dsh-channels`、`packages/channel-store`、`profiles/server` | 新默认路径 | 只沿 DSH 原生核心扩展 |
| `packages/personal-memory`、`packages/personal-context`、`plugins/dsh-lumi` | 保留的个人资产模块 | 按需增加可信管理入口与快照交付 |
| `apps/gateway`、`apps/local-runner`、`apps/runtime`、`apps/workbench` | 旧产品入口，兼容维护 | 新入口覆盖实际所需流程后退役 |
| `packages/assistant-core`、`packages/capability-registry`、`adapters/dsh`、旧 `profiles/dsh-*` | 旧任务协调与执行接线 | 不新增通用编排；调用方退役后删除 |
| `packages/task-ledger`、`packages/task-recovery`、`packages/contracts` | 旧任务/动作持久化及兼容协议 | 先保留历史查询、导出与恢复路径 |
| `packages/action-runtime`、`packages/policy`、`packages/identity`、`adapters/local-artifact`、`plugins/dsh-action-bridge` | 已验收控制能力 | 按具体能力迁入插件；授权和核验不弱化 |
| `packages/reminders`、meeting/research workflow、对应 adapters | 已验收业务服务 | 有需求再迁入；不自动开放给飞书 |

路径未强行移动到 `legacy/`：现有 imports、profile 相对路径和运维脚本仍引用这些位置，纯搬家会产生大量兼容修改。当前通过默认入口、依赖边界和此清单明确职责，删除动作跟随实际替代结果。

根 README 已删除重复 CLI/API 长清单及旧默认架构叙述；操作集中到已有专题 SOP。历史 spec、证据和用户 SVG 保留。临时验证产物只在忽略目录中，不充当源码。

## 继续使用旧入口

更新代码后先 `pnpm install --frozen-lockfile` 与 `pnpm build`。原 `pnpm dev/start` 已指向新 server；旧入口改用 `pnpm dev:legacy/start:legacy`。`pnpm cli` 与 `pnpm dev:web` 保持不变。`PA_*`、端口、认证、数据库格式和旧命令语义未变。

旧工作台见 [Workbench SOP](web-workbench.md)，个人资产见 [记忆 SOP](personal-memory.md)，未完成动作见 [动作门禁 SOP](action-boundary.md)，中断任务见 [恢复 SOP](task-recovery.md)。旧 HTTP 仍只用于可信本机环境；新飞书通道不调用这些 API。

## 删除前的最小条件

1. 列出真实在用的旧入口、数据目录、未完成动作与通知，停止新增旧路径依赖。
2. 备份并验证需要保留的数据可读回；逐项完成未决动作对账。迁移不能重跑旧 Task 或重发历史通知。
3. 为确实需要的能力增加 DSH 插件与新验收。个人数据契约保持独立，原有权限/核验测试必须由等价约束接续。
4. 确认目标进程已切到新路径、原模块无生产调用方后，删除旧 UI/协调包、依赖与 profile。数据删除另行确认，不随代码删除。
5. 再移除已无适用对象的历史测试与兼容 SOP；保留发布前证据和退役记录，不以删测试掩盖回归。

## 回退

新 server 停止后，旧服务仍可按 legacy 命令使用原数据。不要把 `data/server/channels.db` 当作 `assistant.db`，也不要让旧版本 DSH 写入新版本会话目录。代码回退不撤销已经送达的消息；需要匹配版本的数据备份。当前没有自动迁移或自动数据库回滚工具。
