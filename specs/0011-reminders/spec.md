# SPEC-0011: 持久一次性提醒与本地通知收件箱

状态：Implemented / verified_once · v0.1 · 2026-09-25。

负责人：lumi Agent。关联 Goal：超级个人助手 MVP；M3/M4 最小主动性闭环。

授权来源与范围：用户授权 Agent 按既有方案持续开发、测试和维护文档，直至交付满意的 MVP。本切片只在本地 SQLite 保存用户显式创建的一次性提醒，并投递到 Workbench/CLI 可见的本地通知收件箱；不调用外部推送、消息、日历、支付或设备能力。

## 问题和目标

lumi 已能持久完成任务、记忆和重启恢复，但不能在未来某个时间主动提醒用户。简单内存 timer 会在进程退出或设备休眠后丢失，盲目 catch-up 又可能重复通知。

成功后，用户可通过 CLI、HTTP 或 Workbench 创建一个带绝对触发时间、timezone、误点策略和幂等键的提醒。runtime 在线时到点只创建一条本地通知；离线错过后，`latest` 在下次启动补一条，`skip` 则明确标记跳过。通知可查询并确认，重启和重复 tick 不产生第二条。

## 范围

- 新增一次性 `ReminderRecord`：owner/principal、content、fireAt、timezone、misfirePolicy、idempotencyKey、status、nextFireAt 和终结时间。
- 新增 `NotificationRecord`：reminderId、dedupeKey、content、unread/acknowledged、创建与确认时间。
- 新增独立 `packages/reminders`，拥有提醒 SQLite 表、migration、调度服务和通知收件箱。
- runtime.ready 在 Task Recovery 后执行提醒 startup catch-up，再开放 Gateway/CLI。
- 复用本机 runtime 所有权；只有 owner runtime 启动 scheduler，其他临时入口以 passive 模式访问。
- 单 timer 始终指向最早 `nextFireAt`；创建/取消/触发后重排。
- Gateway、CLI 和 Workbench 提供创建、列表、取消、通知查询和 acknowledge。
- Workbench 提供提醒时间输入、误点策略、待触发列表和通知收件箱。

## 非目标

- 不实现 recurring/cron、bounded catch-up、自然语言时间解析、日历同步或跨时区自动改期。
- 不实现系统通知、邮件、飞书消息、移动 push、声音、后台常驻服务或离线设备唤醒。
- 不从 Task、记忆或模型输出自动创建提醒。
- 不从“提醒我”推导任何外部动作授权。
- 不实现安静时间、注意力预算、通知合并、多设备已读同步或 7 天 soak。

## 时间与误点语义

- `fireAt` 必须是未来的 RFC3339 timestamp，包含 `Z` 或明确 offset；持久化为规范 UTC ISO。
- `timezone` 必须是当前运行时 `Intl` 支持的 IANA timezone，只用于解释和展示；一次性绝对时刻不会因 DST 重新计算。
- `latest`：若 runtime 在 fireAt 离线，下一次启动创建且只创建一条通知。
- `skip`：若 reminder 在本次 runtime 启动前已过期，则标记 skipped，不创建通知。
- runtime 已启动后因 timer 抖动、事件循环阻塞或系统短暂休眠而迟到，仍投递一次；`skip` 只针对启动时已经错过的提醒。
- 每个 reminder 的 notification dedupe key 由 Host 确定，SQLite 唯一约束保证重复启动/tick 不重复投递。

## 需求

| ID | 行为 |
| --- | --- |
| FR-001 | 创建提醒必须由认证 principal 派生 owner/principal；请求只提交 content、fireAt、timezone、misfirePolicy 和 idempotencyKey。 |
| FR-002 | 同 owner/principal/idempotencyKey 的相同请求幂等返回原记录；参数不同返回 conflict。 |
| FR-003 | 创建时 fireAt 必须晚于 Host 当前时间，timestamp 和 timezone 无效时拒绝。 |
| FR-004 | 在线到点时 Reminder scheduled→fired 与 Notification 创建必须同一 SQLite 事务；重复 tick 不得重复通知。 |
| FR-005 | 启动时 due reminder 按 latest 补一次，按 skip 标记 skipped；两者均清空 nextFireAt。 |
| FR-006 | scheduled Reminder 可取消且不再通知；fired/skipped/cancelled 为终态，取消幂等。 |
| FR-007 | Notification 默认 unread，acknowledge 幂等转为 acknowledged；正文只向同 owner/principal 返回。 |
| FR-008 | scheduler 只维持一个最早 timer；创建更早提醒、取消或触发后必须重排，close 必须清除 timer。 |
| FR-009 | runtime.ready 必须在 reminder startup catch-up 完成后才允许 Gateway/CLI 命令。 |
| FR-010 | Gateway、CLI 和 Workbench 提供等价提醒/通知生命周期；其他 owner 的 ID 表现为 not found。 |
| FR-011 | Reminder/Notification 不进入 Task Ledger，不创建 Task，不触发 DSH 或 Action。 |
| FR-012 | 检测到另一活跃 runtime 时不得启动第二个 scheduler；passive 入口不得创建新提醒，但可查询、确认通知和取消已有提醒。 |

| ID | 质量约束 |
| --- | --- |
| NFR-001 | reminders 使用独立 migration 表，与 Task Ledger 共用文件但不修改 `PRAGMA user_version=3`。 |
| NFR-002 | timer 延迟按 Node 最大 timeout 分段；时钟回拨时重算，不忙循环。 |
| NFR-003 | 普通日志和审计不记录通知正文；当前模块不新增跨模块普通审计事件。 |
| NFR-004 | Workbench 在 320px 以上移动与桌面视口无横向溢出、遮挡或不可达命令。 |

## 验收

| AC | Given / When / Then |
| --- | --- |
| AC-001 | Given 未来提醒且 runtime 在线，When 到达 fireAt，Then只生成一条 unread Notification，Reminder fired。 |
| AC-002 | Given latest 提醒在 runtime 关闭期间过期，When下一独立进程启动，Then补一条通知且重复启动不重复。 |
| AC-003 | Given skip 提醒在 runtime 关闭期间过期，When启动，Then Reminder skipped 且没有通知。 |
| AC-004 | Given相同 idempotencyKey，When相同参数重复创建，Then返回同 ID；参数变化返回 conflict。 |
| AC-005 | Given scheduled Reminder，When取消并越过 fireAt，Then无通知；重复取消返回同终态。 |
| AC-006 | Given unread Notification，When acknowledge 两次，Then同 ID 保持 acknowledged 且 acknowledgedAt 不变。 |
| AC-007 | Given另一 owner 的 Reminder/Notification ID，When读取或修改，Then返回 not found，不泄露存在性。 |
| AC-008 | Given创建更早 Reminder，When scheduler 已有较晚 timer，Then旧 timer 被替换且两条各只触发一次。 |
| AC-009 | Given提醒创建/触发/确认，Then Task Ledger task 数量和事件均不变化，DSH executor 未被调用。 |
| AC-010 | Given Workbench 桌面或移动视口，When创建短期提醒、看到通知并确认，Then状态及时刷新，无溢出或 console error。 |
| AC-011 | unit、migration、独立进程 catch-up、真实本地 timer、浏览器和 `pnpm check` 全部通过；系统通知/外部推送明确未验证。 |
| AC-012 | Given owner runtime 存活，When第二 runtime 打开同一 SQLite，Then其 reminder service 为 passive、无 timer、create 被拒且原计划不变。 |

## 约束、风险和未知

- Gateway/runtime 必须运行才能准时投递；完全离线期间不能唤醒系统，只有下次启动 catch-up。
- `skip` 的启动边界由本次 ReminderService initialize 时间判定；启动完成后的迟到仍投递。
- 系统时钟大幅调整可能使 timer 提前重排或延后；每次 wake 都重新读取数据库和当前时间。
- 通知正文当前明文保存在本地 SQLite，没有字段级加密。不要把凭据或 secret 放入提醒。
- recurring、DST 本地墙钟重复/跳时和跨设备去重需后续独立规格；本切片的 IANA timezone 只是可解释元数据。
- 常驻 Gateway 运行时，CLI 新建提醒会被 passive 模式拒绝；应使用 Workbench/HTTP 让 owner runtime 同步重排 timer。查询、ack 和取消不要求重排到更早时间，因此仍可用。
