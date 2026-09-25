# SPEC-0013 工作项

| ID | 工作与产物 | 依赖 | 状态 | 角色 | FR / AC | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | 审计根目录、data、测试布局和 workspace 依赖图 | 无 | done | Architect | FR-001–007 / AC-001–004 | 待记录 |
| T-02 | 清理根 draft，建立 data 生命周期说明 | T-01 | done | Maintainer | FR-001、002 / AC-001、002、007 | 待记录 |
| T-03 | 将 ArtifactProvider 端口倒置到 action-runtime | T-01 | done | Builder | FR-003、004 / AC-003 | 待记录 |
| T-04 | 实现架构 checker、自测并接入 pnpm check | T-03 | done | Builder | FR-005、006 / AC-004、005 | 待记录 |
| T-05 | 校准 README、测试与发布 SOP | T-02–T-04 | done | Maintainer | FR-001、002、007 / AC-001、002 | 待记录 |
| T-06 | 完成聚焦/全量验证、evidence、提交与 push | T-05 | in_progress | Verifier | NFR-001–004 / AC-003–007 | 待执行 |

状态：todo / in_progress / blocked / done。
