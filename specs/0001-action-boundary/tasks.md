# SPEC-0001 工作项

状态：done / locally verified。角色为责任边界记录，不表示曾分配真人。

| ID | 产物 | 依赖 | 角色 | 状态 | 需求 / 验收 |
| --- | --- | --- | --- | --- | --- |
| T-01 | 按授权建立源码基线、分支及旧接口/旧库 fixture | 无 | Maintainer | done | NFR-003 / AC-009 |
| T-02 | 身份、动作、授权、回执与错误 Schema；兼容映射 | T-01 | Builder | done | FR-001、002、010 / AC-001、002、009 |
| T-03 | 版本化迁移、动作事务、唯一幂等约束和额度消费 | T-02 | Builder | done | FR-004、006、007 / AC-004、006、009 |
| T-04 | 确定性策略、摘要绑定、重验、撤销和预算 | T-03 | Builder | done | FR-003、004、009 / AC-003、004、008 |
| T-05 | action-runtime 与受控 artifact provider；越界阻断 | T-04 | Builder | done | FR-005、007 / AC-005、006 |
| T-06 | 独立核验和显式对账；假成功拒绝 | T-05 | Builder | done | FR-007、008 / AC-006、007 |
| T-07 | CLI/HTTP 共享接线、身份控制、版本化接口和脱敏审计 | T-06 | Builder | done | FR-001、009、010、011 / AC-001、008、009、010 |
| T-08 | 独立执行全部 AC 负向、并发和故障验证 | T-07 | Verifier | done | AC-001–009 |
| T-09 | 专用目录真实 I/O 验收、清理和读回 | T-08 | Verifier | done | AC-010 |
| T-10 | evidence、事实文档、SOP、迁移/回滚和交接更新 | T-09 | Maintainer | done | 全部 AC |

实现位置为 `packages/{contracts,identity,policy,task-ledger,action-runtime}`、`adapters/local-artifact`、`apps/{runtime,gateway,local-runner}`。负向、并发、迁移、故障恢复和真实 I/O 的命令及结果统一记录在 `evidence.md`。

Builder 完成本地实现和自检；发布仍与本地 Done 分离。DSH 任意工具接线继续作为独立后续切片，不因本表完成而视为启用。
