# SPEC-0010 工作项

| ID | 工作与产物 | 依赖 | 状态 | 角色 | FR / AC | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | 定义 Task 新状态与 Recovery contracts | 无 | done | Builder | FR-001–006 / AC-001–006 | E-01 |
| T-02 | 实现 Task Ledger v3 migration 与原子恢复操作 | T-01 | done | Builder | FR-002、003、006、009、011 / AC-001–008、011 | E-01、E-02 |
| T-03 | 实现 RecoveryService、queued dispatch 和 runtime.ready | T-02 | done | Builder | FR-001、004–008、011 / AC-001–007、011 | E-02、E-03 |
| T-04 | 增加 Gateway 与 CLI 恢复入口 | T-03 | done | Builder | FR-008–010 / AC-004、005、008 | E-03、E-04 |
| T-05 | 增加 Workbench 恢复状态与命令面板 | T-04 | done | Builder | FR-010 / AC-009 | E-05 |
| T-06 | 完成 migration、故障注入、独立进程和浏览器验证 | T-02–T-05 | done | Verifier | FR-001–011 / AC-001–011 | E-01–E-05 |
| T-07 | 完整门禁、事实文档、SOP、证据和 main 集成 | T-06 | done | Maintainer | NFR-001–004 / AC-010 | E-06 |

状态：todo / in_progress / blocked / done。
