# SPEC-0010: 可解释的任务重启恢复

状态：Implemented / verified_once · v0.1 · 2026-09-25。

负责人：lumi Agent。关联 Goal：超级个人助手 MVP；M3 最小恢复闭环。

授权来源与范围：用户授权 Agent 按既有方案持续开发、测试和维护文档，直至交付满意的 MVP。本切片只处理单机 lumi Host 进程退出后遗留的 queued / running Task 和受控本地 Action；不承诺恢复模型思维链，也不扩大外部写入权限。

## 问题和目标

SQLite 已保存 Task、事件、Action、回执和验证，但进程在执行中退出后，`running` 会永久悬挂。普通 Task 可能尚未产生副作用，也可能已通过工具改变环境；Action 可能已经写入文件但没有提交回执。统一把这些任务标记失败会丢失恢复事实，统一重跑则可能重复产生副作用。

成功后，runtime 启动会先检查遗留状态：

- 尚未开始执行的普通 queued Task 可安全重新调度。
- 普通 running Task 结束为 `interrupted`，并建立持久 Recovery 记录。
- 能证明没有潜在副作用的 Task 可由用户显式创建新的重试 Task；原 Task 历史保持不变。
- 有工具副作用迹象或属于宽权限 coding-agent 的 Task 只能人工确认，不能由恢复 API 重跑。
- executing / outcome_unknown / 已有回执但未验证的 Action Task 进入 `reconciling`，只能复用 Action 对账与独立验证完成。

## 范围

- Task 状态增加 `interrupted` 和 `reconciling`。
- 增加版本化 `RecoveryRecord`，记录 owner、principal、原 Task、可选 Action、恢复处置、原因、状态、替代 Task 和解决时间。
- Task Ledger 执行 v2 → v3 expand migration，新增 `task_recoveries` 表和必要索引。
- runtime 启动扫描当前 principal 的 queued / running Task，并在接受新请求前完成恢复判定。
- SQLite 保存单个本机 runtime ID / PID；PID 仍存活时其他入口不得接管其 running Task。
- 新增 `packages/task-recovery`，持有恢复分类、启动扫描、显式重试、人工确认和 Action 对账收口。
- Gateway、CLI 和 Workbench 提供 Recovery 查询与用户命令。
- 受控 Action 的 executing 状态在启动恢复中原子转为 outcome_unknown；对应 Task 转为 reconciling。

## 非目标

- 不恢复 DSH 内部思维链、token 流或未持久化的模型上下文。
- 不把“重新执行一个新 Task”描述为原地 resume。
- 不自动重跑任何从前处于 running 的 Task。
- 不实现多 worker lease、fencing token、分布式队列、跨设备接管或 7 天 soak。
- 不为 coding-agent 提供自动恢复；其文件、Shell 和网络工具尚未达到可证明的幂等边界。
- 不自动对账 Action；用户仍需在动作页或 API/CLI 发起明确 reconcile。

## 协议和状态

Task 新状态：

| 状态 | 语义 |
| --- | --- |
| `interrupted` | 原执行尝试因 Host 退出终止；结果未被验收，不再继续改变该 Task。 |
| `reconciling` | 受控 Action 可能已发生或已有回执但尚未完成独立验证；禁止重新 execute。 |

Recovery 处置：

| disposition | 判定 | 允许命令 |
| --- | --- | --- |
| `retry_available` | meeting/research，或未观察到工具/Action 迹象的 personal Task | retry、acknowledge |
| `manual_review` | coding-agent、未知 capability、或观察到工具/Action 迹象的普通 Task | acknowledge |
| `reconcile_action` | Action 为 executing / outcome_unknown / succeeded 且验证未完成 | Action reconcile |

Recovery 状态为 `pending | retrying | resolved`。retry 使用持久 replacementTaskId 和 replacementCreatedAt；进程在命令中途退出后，下一次启动继续对账该 replacement，而不是生成第二个重试 Task。

## 需求

| ID | 行为 |
| --- | --- |
| FR-001 | runtime 启动必须在接收 Gateway/CLI 命令前扫描当前 principal 的 queued / running Task；waiting_approval 和终态不得被改写。 |
| FR-002 | 普通 running Task 必须原子转为 interrupted 并创建唯一 Recovery；重复启动不得重复记录或重复事件。 |
| FR-003 | executing Action 必须原子转为 outcome_unknown，关联 Task 转为 reconciling；succeeded 未验证和既有 outcome_unknown 同样进入 reconcile_action。 |
| FR-004 | retry_available 只允许用户显式重试，且创建新 Task；原 Task、事件和结果不得覆写。 |
| FR-005 | manual_review 与 reconcile_action 必须拒绝普通 retry；错误明确 `safeToRetry=false`。 |
| FR-006 | retry 的 replacement ID / createdAt 必须持久，命令中途重启后不得创建第二个 replacement。 |
| FR-007 | queued 非 Action Task 可在启动时安全重新调度；queued Action Task 保持等待显式 execute。 |
| FR-008 | Action reconcile 完成后必须将 Recovery 解决为 reconciled，并由 Verification 决定 Task completed / failed。 |
| FR-009 | Recovery 读取和命令按认证 owner/principal 隔离；其他身份返回 not found。 |
| FR-010 | Gateway、CLI 和 Workbench 必须展示 interrupted / reconciling 及可用命令，不把二者显示为仍在运行或已失败。 |
| FR-011 | 本机已有存活 runtime 时，新入口必须跳过启动接管；stale PID 只能由一个新 runtime 原子替换。 |

| ID | 质量约束 |
| --- | --- |
| NFR-001 | Task、Action 与 Recovery 的启动判定在同一 SQLite 事务中完成；migration 保留 v1/v2 数据。 |
| NFR-002 | 恢复事件和普通审计不复制 Task 正文、Action 正文、token 或模型上下文。 |
| NFR-003 | 启动扫描和重试分类为确定性逻辑，可在无模型、无网络环境故障注入。 |
| NFR-004 | 现有 Task、Action、research、meeting、memory API 与数据保持兼容；新增状态由旧查询作为字符串返回。 |

## 验收

| AC | Given / When / Then |
| --- | --- |
| AC-001 | Given 普通 running meeting Task，When 关闭并重开 runtime，Then 原 Task 为 interrupted，唯一 Recovery 为 retry_available，且未自动调用 executor。 |
| AC-002 | Given running coding-agent 或已记录 tool.called 的 personal Task，When 重启，Then Recovery 为 manual_review，retry 返回 409 且无新 Task。 |
| AC-003 | Given running Task 对应 executing Action，When 重启，Then Action 为 outcome_unknown、Task 为 reconciling、Recovery 为 reconcile_action，且 provider.write 未被再次调用。 |
| AC-004 | Given Action 文件已存在但回执未提交，When 用户 reconcile，Then读回生成 recovered receipt、Verification passed、Task completed、Recovery resolved。 |
| AC-005 | Given retry_available，When retry，Then只创建一个新 Task；原 Task 仍 interrupted，Recovery 保存 replacementTaskId 并 resolved。 |
| AC-006 | Given retry 已 claim 后进程退出，When 重启，Then沿用持久 replacement 标识完成或关联恢复，不产生第二个替代 Task。 |
| AC-007 | Given 普通 queued Task 与 queued Action Task，When 重启，Then前者执行一次，后者保持 queued 且 Action authorization 不被自动消费。 |
| AC-008 | Given另一 principal 的 Recovery，When通过 service/Gateway 查询或命令，Then返回 not found 且不泄露记录存在。 |
| AC-009 | Given Workbench 桌面或移动视口，When查看 interrupted / reconciling，Then状态、原因与允许命令准确，无溢出或 console error。 |
| AC-010 | migration、unit、integration、CLI 独立进程、浏览器和 `pnpm check` 全部通过；未做的 DSH live/soak 明确标记。 |
| AC-011 | Given Gateway/runtime PID 仍存活，When另一 CLI/runtime 打开同一 SQLite，Then不改变其 running Task；PID 退出后新 runtime 才能恢复。 |

## 约束、风险和未知

- `retry_available` 只表示没有外部副作用重放风险，不表示模型费用、输出内容或耗时可重复。
- research 重试可能新增只读来源 snapshot；本切片不做孤儿 snapshot 垃圾回收。
- 当前是单 Host、单 principal 恢复器；本机 PID 所有权只阻止活跃进程被误接管，不是带心跳和 fencing 的 worker lease。多进程可以查询和提交，但只有 owner runtime 执行启动恢复。
- PID 复用会保守地延迟恢复，不会触发盲重试；跨主机共享数据库无法用本机 PID 判活，不属于支持范围。
- coding-agent 即使没有落下 `tool.called` 事件也按 manual_review 处理，因为当前工具执行与事件提交不是同一事务。
- rollback 使用 migration 前一致备份；旧二进制不能直接打开 v3 数据库。已发生 Action 必须先对账，不能靠数据库回滚撤销。
