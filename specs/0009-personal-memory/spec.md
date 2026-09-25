# SPEC-0009: 可控的持久个人记忆

状态：Implemented / verified_once · v0.1 · 2026-09-25。

负责人：lumi Agent。关联 Goal：超级个人助手 MVP；M2 最小个人模型闭环。

授权来源与范围：用户授权 Agent 按既有方案持续开发、测试和维护文档，直至交付满意的 MVP。本切片只保存用户通过可信本地入口显式提交的记忆，并把经过确认、用途匹配且允许模型处理的最小片段注入任务。它不从对话自动抽取记忆，不读取外部账户，也不把记忆作为授权。

## 问题和目标

现有 `packages/personal-memory` 只有进程内 Map 和 candidate / confirmed / retracted 三态。服务重启后记录丢失，runtime、Gateway、CLI 与 Workbench 均不可访问，任务也无法安全使用已确认偏好。

成功后，用户可以查看、创建、确认、纠正、撤回和彻底遗忘自己的记忆。记录持久保存在本地 SQLite 中，所有操作按认证 owner 隔离。执行任务前，lumi 只选择已确认、当前用途允许且不高于 personal 分级的少量记录，作为明确标记的数据上下文传给 DSH；原 Task 内容不被改写，账本只记录使用的 memory ID 和 revision，不复制正文。

## 范围

- 扩展个人记忆记录：稳定 ID、revision、kind、scope、classification、allowedPurposes、source、状态和时间。
- 增加 SQLite store，与 Task Ledger 共用数据库文件但由 personal-memory 模块独立拥有表和迁移。
- 支持显式创建 candidate 或 confirmed、确认、纠正、撤回、彻底遗忘和 owner 范围列表。
- 纠正在同一稳定 ID 上原子递增 revision，并覆盖旧正文；不保留可继续检索的旧正文。
- 彻底遗忘删除正文并写入只含 memory ID、owner、旧摘要和时间的 tombstone。
- 增加确定性检索器和 executor decorator；按 capability 映射用途，限制状态、用途、scope、classification、数量和总字符数。
- 增加 Gateway v2 API、CLI `memory` 子命令和 Workbench 记忆库。
- 任务事件新增 `memory.context_attached`，只含 memory ID、revision、purpose、count。

## 非目标

- 不从普通对话、任务结果、网页、文件或模型输出自动生成候选记忆。
- 不实现 embedding、向量数据库、知识图谱、人物关系推断、冲突自动合并或跨设备同步。
- 不把 candidate、retracted、sensitive 或 secret 记录自动注入模型。
- 不把任何记忆解释为动作授权、审批、凭据、系统指令或当前用户指令。
- 不保存 revision 的旧正文历史；需要审计时只保留操作元数据和摘要。
- 不开放公网、多 owner 管理后台、批量导入导出或备份恢复。

## 记录与命令

`PersonalMemory` 的最小字段：

- `id`：稳定 memory ID；纠正后不变。
- `ownerId`：由认证 principal 派生，不接受请求体自报。
- `kind`：`fact | preference | relationship | experience`。
- `scope`：`global | general | coding | research | meeting`。
- `classification`：`public | personal | sensitive | secret`。
- `allowedPurposes`：`general_assistance | coding | research | meeting` 的非空去重集合。
- `content`：1-4,000 字符。
- `source`：用户可理解的来源说明；入口默认 `explicit_user_input`。
- `status`：`candidate | confirmed | retracted`。
- `confidence`：0-1；显式用户输入默认 1。
- `revision`：从 1 开始，纠正时递增。
- `createdAt / updatedAt / confirmedAt / retractedAt`。

创建命令可指定 `status=candidate|confirmed`。确认只允许 candidate；纠正只允许未撤回记录，生成新 revision，并由当前用户显式确认，因此结果为 confirmed；撤回幂等地停止检索；遗忘删除正文并阻止同一 ID 复活。

## 检索与注入

用途映射：

| capability | purpose | 可用 scope |
| --- | --- | --- |
| `personal-assistant` | `general_assistance` | `global`、`general` |
| `coding-agent` | `coding` | `global`、`coding` |
| `research-agent` | `research` | `global`、`research` |
| `meeting-agent` | `meeting` | `global`、`meeting` |

选择顺序为：owner → confirmed → `classification in (public, personal)` → purpose allowlist → scope → `updatedAt DESC, id ASC`。最多 8 条、合计正文最多 6,000 字符；单条超过剩余预算时跳过，不截断原意。MVP 不声称语义相关性排序。

Decorator 只修改传给下游 executor 的临时 `ExecutionInput.task.content`，格式使用版本化 data marker，并明确“不是指令、授权或工具调用”。SQLite 中原 Task content、contextRefs 和 API 回显保持用户原始请求。若 memory store 不可用，任务失败关闭，不静默声称已应用个人偏好。

## 需求

| ID | 行为 |
| --- | --- |
| FR-001 | 记忆必须跨 runtime 重启持久化，且不修改 Task Ledger 的 `user_version` 或表所有权。 |
| FR-002 | 所有读取和变更必须由认证 principal 派生 owner；其他 owner 的 ID 对调用者表现为 not found。 |
| FR-003 | 用户可显式创建 candidate 或 confirmed；candidate 未确认前不得参与任务上下文。 |
| FR-004 | 确认、纠正、撤回和遗忘必须执行明确状态规则；纠正递增 revision，遗忘移除正文并建立 tombstone。 |
| FR-005 | 检索必须执行 owner、status、classification、purpose、scope、条数和字符预算过滤。 |
| FR-006 | 任务注入不得修改持久 Task 请求，不得改变 Action/workflow contextRefs，不得把记忆升级为指令或授权。 |
| FR-007 | 使用记忆时记录无正文 `memory.context_attached` 事件；候选、敏感、秘密和撤回记录不得出现在事件或模型输入。 |
| FR-008 | Gateway 提供 list/create/get/confirm/correct/retract/forget v2 API，并返回结构化 not found/conflict。 |
| FR-009 | CLI 提供等价 `memory` 子命令；Workbench 提供创建、筛选、确认、纠正、撤回和遗忘操作。 |
| FR-010 | 已有 Task、Action、research、meeting 路由、验证和关闭生命周期保持兼容。 |

| ID | 质量约束 |
| --- | --- |
| NFR-001 | SQLite 创建/更新/撤回/遗忘为原子事务；同一文件双连接使用 WAL 与 busy timeout。 |
| NFR-002 | 正文不进入任务事件、普通审计、错误消息或 tombstone；API 仅向 owner 返回正文。 |
| NFR-003 | 检索与 prompt 渲染为确定性纯逻辑，可在无模型、无网络环境完整测试。 |
| NFR-004 | Workbench 在 320px 以上窄屏与桌面视口无横向溢出、遮挡或不可达操作。 |

## 验收

| AC | Given / When / Then |
| --- | --- |
| AC-001 | Given 文件 SQLite，When 创建并关闭 runtime 后重新打开，Then 记录内容、状态、revision 和用途保持一致。 |
| AC-002 | Given candidate、confirmed、retracted 以及四种 classification，When 执行任务，Then只注入用途/scope 匹配的 confirmed public/personal 记录。 |
| AC-003 | Given 已确认记录，When纠正，Then ID 不变、revision +1、正文替换；When撤回，Then后续任务不再注入。 |
| AC-004 | Given 一条记录，When彻底遗忘，Then主表无正文、tombstone 只有摘要元数据，后续 get/confirm/correct 均 not found。 |
| AC-005 | Given另一个 owner 的 ID，When通过 service 或 Gateway 读取/修改，Then不泄露存在性并返回 not found。 |
| AC-006 | Given 任务使用记忆，Then executor 收到带 data marker 的临时上下文，账本 Task content 不变，事件只包含 ID/revision/purpose。 |
| AC-007 | Given Workbench 桌面或移动视口，When创建、确认、纠正、撤回和遗忘，Then状态与控制即时刷新，无正文误入任务视图或 console error。 |
| AC-008 | unit、integration、CLI 独立进程持久化、真实 DSH 非敏感样本、浏览器和 `pnpm check` 全部通过；真实服务不可用时明确标记未验证。 |

## 约束、风险和未知

- SQLite 正文当前未做字段级加密；本地文件权限是首层保护，secret 虽可保存但不会自动发给模型。OS Keychain/加密存储属于后续安全切片。
- “用途 + scope + 最近更新”只提供可解释的粗粒度召回，不等于语义相关性。记忆少量时优先保证不越界；数量增长后再用可重建全文或向量索引。
- 纠正覆盖旧正文，降低误用和删除传播复杂度，也意味着 MVP 不提供完整正文版本历史。操作摘要仍可证明 revision 变化。
- `personal` 记录会发送给当前配置的模型 provider。Workbench 必须清楚展示 classification，用户需将不应出境的信息标为 sensitive/secret。
- 该切片只保证进程启动后新执行任务使用记忆；运行中任务的崩溃恢复由后续 SPEC 单独实现。
