# SPEC-0001 实现计划

状态：Proposed / 未执行。对应 spec v0.2。

## 实施切片

1. 先定义 Schema、身份和旧接口映射，建立关键负向 fixture。
2. 扩展账本事务与版本迁移，保持原任务路径可工作。
3. 实现 policy 与 action-runtime，接入一个受控 artifact provider。
4. 新动作路径接入 Core、CLI/HTTP，加入独立核验。
5. 注入故障并执行真实本地 I/O，补齐证据、SOP 和回滚。

## 模块与依赖

扩展 `packages/contracts`、`task-ledger`、`policy`。按实际消费者新增 `packages/identity`、`action-runtime`、`verification`；不要一次建立后续里程碑空模块。artifact provider 可先位于独立 `adapters/local-artifact`。

Core 调用 ActionService 端口，不知道实际文件路径；runtime 装配 identity、broker、ledger 和 provider。provider 只收已验证输入与本次执行上下文；外部输入无法伪造 AuthorizationResult。

进程内 TypeScript 类型不是安全隔离；本切片仅允许受控内置 provider。未验证 DSH 工具不能挂进同一动作能力清单宣称受保护。

## 身份与请求

初期本地 HTTP 使用随机高熵 bearer token，经环境或 OS secret 引用加载，并绑定一个配置 owner；服务不记录 token。无令牌的任务读写拒绝，loopback 继续保留。健康端点不返回任务/凭据。

CLI 使用本机配置身份，不允许 `--actor` 选择更高权限 principal；旧 actorId 仅作为请求元数据保留，不能用于授权。v1 调用需兼容说明和迁移文档，安全修复不得继续信任自报 actor。

业务幂等摘要以规范化 JSON 中的语义字段计算：owner、operation、target、contentDigest、版本等。排除 generated time、traceId；先写测试样例固定规范。唯一约束按 owner/operation/key 生效。

## 数据和执行

新增 actions、authorizations、receipts、verifications 和 migration_history。状态与迁移事件同事务；执行领取、额度消费和状态版本检查同一短事务，不在事务中等待模型或磁盘长操作。

建议端口：prepare(proposal)、authorize(actionId)、execute(actionId)、reconcile(actionId)、revoke(ref)、verify(taskId)。实际 API 采用 `/v2` 和 Schema 版本；仅为旧 `/v1` 提供可解释投影，不输出未知枚举。

artifact provider 将 action ID 映射到专用根下服务生成的文件名，使用独占创建/原子提交，记录内容摘要与 action 关联。禁止绝对路径、`..`、符号链接和覆盖；校验与打开之间的竞态需以文件句柄/平台可靠机制处理，不能只用字符串前缀判定。

授权撤销与执行跨系统不可能瞬间原子：记录本地授权消费的线性化点；在该点之前撤销阻止执行，之后只能停止可停止的步骤并报告已发生效果。执行前重验后仍有极短窗口，文档不得承诺能撤销已经发生的外部效果。

## 迁移与兼容

在脱敏的旧库副本重演迁移，保留旧表与字段。第一版只 expand；旧程序如会重置 user_version，必须修正版本检测或明确拒绝降级启动，不能假定旧二进制安全读取新库。

回滚优先停用新动作入口、保留历史只读查询。需要恢复数据时从一致性备份恢复；新文件与动作证据先对账，避免回滚账本后把已发生动作再执行。

## 验证

按 AC 构建契约、事务竞争、文件越界、撤销、取消、假成功和崩溃恢复检查。复用已有检查；只在实现变更后跑必要完整 `pnpm check`。测试失败不得修改 AC 使其通过。

真实本地验收在新目录执行：准备→审批→文件创建→独立读回→记录摘要→清理→核验清理。使用新数据库，保存回执，不触碰用户仓库文件和生产数据。

## 备选与后续

暂不依赖通用事件监听器执行门禁：关键决策需要同步返回、持久事务和失败关闭。暂不把原 Task 全面迁移到新的 Run/scheduler 模型：本切片仅保存动作所属执行尝试，M3 再引入持久领取和租约。

下一 spec 完成固定 DSH 版本接线 spike，再决定隔离实现和 connector 真实验收。若无法实现可靠阻断，保持该工具未启用并提交 ADR，不降级安全契约。
