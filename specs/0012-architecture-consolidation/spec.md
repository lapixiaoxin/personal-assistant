# SPEC-0012: v0.1 架构与仓库规范收敛

状态：Implemented / verified_once · v0.1 · 2026-09-25。

负责人：lumi Agent。关联 Goal：MVP 后的可维护性基线。关联 ADR：[ADR-004](../../docs/adr/0004-host-ownership-and-module-boundaries.md)。

授权来源与范围：用户要求 Agent 自主清理工程并持续维护规范。本切片可移除已合并且干净的临时 worktree，校正架构文档，按既有包边界拆分过大的源码入口，并在验证后提交本地 `main`；不得覆盖用户未提交改动，不停止现有服务，不改变运行行为或扩大授权。

## 问题和目标

v0.1 MVP 已实现动作门禁、持久记忆、单机恢复和一次性提醒，但部分设计文档仍把这些能力写成“尚未实现”；同时 `packages/task-ledger/src/index.ts` 集中了公开接口、SQLite 迁移、行映射和三类领域操作，维护时容易把事务语义、存储细节和公开 API 混在一起。

成功后，工程文档能直接回答“当前已有、后续拟建、明确未做”三个问题；`contracts` 与 `task-ledger` 按领域组织源码，但所有现有根包 import、Schema、错误类型、数据库版本、事务边界和测试行为保持兼容。

## 范围

- 移除 `main` 已包含、状态干净的 `feat/0001-action-boundary` 与 `feat/0005-dsh-action-bridge` worktree 和本地分支。
- 校正设计总纲、架构、DSH 专题、ADR 索引、文档导航和工程事实中的 v0.1 状态。
- 建立 ADR-004，记录 Host 对 Task/Action/Memory/Recovery/Reminder 的数据所有权，以及模块化单体内的文件级拆分原则。
- 将 `packages/contracts/src/index.ts` 拆为 common、task、recovery、reminder、action 领域文件，根入口继续完整 re-export。
- 将 `packages/task-ledger/src/index.ts` 拆为公开类型/错误、SQLite schema migration、row mapping/digest 和实现文件，根入口继续完整 re-export。
- 补充包级 README，说明责任、公开入口、事务和禁止依赖。

## 非目标

- 不增加新产品能力、HTTP/CLI 命令、Schema、枚举、表、索引或 migration。
- 不将 `task-ledger` 拆为多个数据库连接、多个包、微服务或可独立提交的 repository。
- 不拆分 `packages/reminders`；当前一次性 trigger 与本地通知同属一个原子投递边界。
- 不迁移 `TaskRecord.dshSessionId`，不实现分布式 lease/fencing、周期任务、外部通知、自动记忆或自主发布。
- 不清理 `data/mvp-local`、DSH 源码分析、工具缓存或 Playwright 浏览器；不修改三份用户 SVG。

## 需求

| ID | 行为 |
| --- | --- |
| FR-001 | 仅删除状态干净且提交已被 `main` 包含的临时 worktree；其他 `data/` 内容和监听服务保持不变。 |
| FR-002 | 架构文档必须把 v0.1 已实现基线与长期 Proposed 目标分开陈述，并消除已知过时描述。 |
| FR-003 | `@lumi/contracts` 根入口继续导出变更前全部运行时值和 TypeScript 类型，消费者无需修改 import。 |
| FR-004 | `@lumi/task-ledger` 根入口继续导出变更前全部 class、interface 和 error，消费者无需修改 import。 |
| FR-005 | Task、Action、Recovery 的跨对象写入继续由同一 `SqliteTaskLedger` 实例和同一 `BEGIN IMMEDIATE` 事务控制。 |
| FR-006 | 数据库最新版本保持 3；v1→v2→v3 migration SQL、顺序、历史记录和兼容行为不变。 |
| FR-007 | 新文件按领域职责命名，内部实现不从包外子路径公开；包 README 记录所有权和依赖规则。 |

| ID | 质量约束 |
| --- | --- |
| NFR-001 | 不修改现有测试断言来迁就重构；聚焦测试和完整 `pnpm check` 均通过。 |
| NFR-002 | 文档链接检查通过，Implemented/Verified/Proposed 用词符合工程状态规则。 |
| NFR-003 | 不提交用户 SVG、运行数据库、缓存、构建产物或其他私人数据。 |
| NFR-004 | 回滚只需恢复源码和文档；没有数据迁移或外部副作用需要撤销。 |

## 验收

| AC | Given / When / Then |
| --- | --- |
| AC-001 | Given 两个旧 worktree 均 clean 且已 merged，When 清理完成，Then `git worktree list` 只剩主工作区，约 1.5 GB 被释放。 |
| AC-002 | Given v0.1 当前能力，When 检查设计文档，Then动作门禁、持久记忆、单机恢复、一次性提醒不再被描述为全部待实现，长期缺口仍明确。 |
| AC-003 | Given现有所有根包消费者，When typecheck/build，Then无需改 import 且导出解析成功。 |
| AC-004 | Given全新、v1 和 v2 SQLite 样本，When打开重构后的 ledger，Then最新 `user_version=3`、历史 Task 保留且迁移记录不变。 |
| AC-005 | Given Task/Action/Recovery 现有测试，When并发授权、未知结果、恢复和验证路径执行，Then状态与事务断言全部保持通过。 |
| AC-006 | Given仓库完整门禁，When使用 Node 22.19.0 / pnpm 10.20.0 执行，Then lint、typecheck、版本检查、测试和构建全部通过。 |
| AC-007 | Given用户原有 SVG 和现有服务，When提交本切片，Then SVG 不在提交中，4310/4313 服务未被停止或改写。 |

## 约束、风险和未知

- TypeScript barrel 可能引入循环依赖；领域文件只依赖 `common` 或单向依赖 `task`，根 `index.ts` 不含实现逻辑。
- SQLite 私有方法若跨类拆分会放大事务风险；本切片保留一个实现类，只抽离纯映射、摘要和 migration 函数。
- 设计文档仍包含长期目标，不应把本次状态校正误写成 v0.2/v0.3 全面实现。
- 默认 shell 为 Node 18.20.8；最终验证必须显式使用仓库要求的 Node 22.19.0。
