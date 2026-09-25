# SPEC-0007 工作项

| ID | 工作与产物 | 依赖 | 状态 | 角色 | FR / AC | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | 定义 research brief、source snapshot 和 context ref 契约 | 无 | done | Builder | FR-001、002 / AC-001 | E-01 |
| T-02 | 实现受控 HTTPS provider 与不可变 snapshot store | T-01 | done | Builder | FR-004–007 / AC-003–005 | E-02、E-05 |
| T-03 | 扩展 per-Run bridge、DSH plugin 与 research profile | T-01、T-02 | done | Builder | FR-003、007 / AC-002、007 | E-02、E-03 |
| T-04 | 注册 research capability 并装配 workflow 与结果 verifier | T-01–T-03 | done | Builder | FR-002、008 / AC-001、006 | E-01、E-03 |
| T-05 | 增加 Gateway、CLI 与 Workbench 入口 | T-04 | done | Builder | FR-009、010 / AC-001、008 | E-01、E-04、E-05 |
| T-06 | 完成 unit、contract、integration 和浏览器负向/正向验证 | T-02–T-05 | done | Verifier | FR-001–010 / AC-001–008 | E-01–E-04 |
| T-07 | 执行真实公开 HTTPS smoke、完整门禁并同步事实/SOP/证据 | T-06 | done | Maintainer | NFR-001–004 / AC-008 | E-05、E-06 |

状态：todo / in_progress / blocked / done。
