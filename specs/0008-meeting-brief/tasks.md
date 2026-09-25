# SPEC-0008 工作项

| ID | 工作与产物 | 依赖 | 状态 | 角色 | FR / AC | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | 定义 meeting brief 输入、规范化 Task content 和固定输出协议 | 无 | done | Builder | FR-001、002、006 / AC-001–003 | E-01 |
| T-02 | 实现 meeting workflow、verifier 与单元测试 | T-01 | done | Builder | FR-001、002、006、007 / AC-001–003 | E-01 |
| T-03 | 注册 meeting capability 并泛化 protected bridge/profile | T-01 | done | Builder | FR-003–005 / AC-004、005 | E-02 |
| T-04 | 装配 runtime，增加 Gateway 与 CLI 入口 | T-02、T-03 | done | Builder | FR-008、010 / AC-001、002 | E-03 |
| T-05 | 增加 Workbench meeting composer 和上下文展示 | T-04 | done | Builder | FR-009、010 / AC-006 | E-04 |
| T-06 | 完成 unit、contract、integration 和浏览器正负验证 | T-02–T-05 | done | Verifier | FR-001–010 / AC-001–007 | E-01–E-04 |
| T-07 | 执行真实 MiniMax smoke、完整门禁并同步事实/SOP/证据 | T-06 | done | Maintainer | NFR-001–004 / AC-007 | E-05、E-06 |

状态：todo / in_progress / blocked / done。
