# 本机数据目录

`data/` 只保存本机运行状态、可再生缓存和隔离验证产物，不保存工程源码。除本说明外，目录内容默认被 Git 忽略。

## 数据类别

| 类别 | 常见路径 | 处理规则 |
| --- | --- | --- |
| 权威运行数据 | `assistant.db*`、`mvp-local/`、`dev/`、`dsh/`、`dsh-web/` | 可能含任务、记忆、会话或凭据；运行服务存在时禁止删除，备份/迁移须按对应 SOP |
| 工具缓存 | `tooling/`、`playwright-browsers/` | 可再生但体积较大；仅在确认近期不运行验证时清理 |
| 隔离测试数据 | `workbench-e2e/`、各能力的 `*-smoke/` 或临时目录 | 测试结束后按本次明确路径删除，不使用覆盖整个 `data/` 的通配清理 |
| 本机证据与研究副本 | `design-*/`、`dsh-source-analysis-*/`、`workbench-evidence/` | 不是代码事实源；确认 tracked evidence 已记录关键结论后可删除 |
| 发布草稿 | `publication-drafts/` | 从 `docs/` 生成，用后清理；禁止在仓库根生成 `draft_*_folder` |

## 边界

- 不提交数据库、凭据、模型会话、截图、trace、下载内容或发布回执。
- 删除前检查相关服务 PID、文件路径与任务归属；不要把“被 Git 忽略”理解为“可以安全删除”。
- 可复现结论写入 `docs/evidence/` 或 `specs/*/evidence.md`；忽略目录中的原始文件不能作为远端仓库唯一证据。
