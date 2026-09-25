# SPEC-0012 工作项

| ID | 工作与产物 | 依赖 | 状态 | 角色 | FR / AC | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | 复核并移除已合并的干净 worktree/分支 | 无 | done | Maintainer | FR-001 / AC-001、007 | 待记录 |
| T-02 | 建立 spec、ADR 并校正架构/事实文档 | T-01 | in_progress | Architect | FR-002 / AC-002 | 待执行 |
| T-03 | 按领域拆分 contracts，保持根导出 | T-02 | todo | Builder | FR-003、007 / AC-003 | 待执行 |
| T-04 | 拆分 task-ledger 辅助职责，保持单类事务 | T-03 | todo | Builder | FR-004–007 / AC-003–005 | 待执行 |
| T-05 | 增加包 README 并执行聚焦/完整验证 | T-04 | todo | Verifier | NFR-001–004 / AC-003–007 | 待执行 |
| T-06 | 完成 evidence、差异审查和本地 main 提交 | T-05 | todo | Maintainer | 全部 | 待执行 |

状态：todo / in_progress / blocked / done。
