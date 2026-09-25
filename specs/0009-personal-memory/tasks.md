# SPEC-0009 工作项

| ID | 工作与产物 | 依赖 | 状态 | 角色 | FR / AC | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | 定义 memory schema、状态机、错误和 SQLite migration | 无 | done | Builder | FR-001–004 / AC-001、003–005 | E-01 |
| T-02 | 实现持久 store、纠正/撤回/遗忘和单元测试 | T-01 | done | Builder | FR-001–005 / AC-001–005 | E-01 |
| T-03 | 实现受控检索、prompt data block、executor decorator 和无正文事件 | T-01 | done | Builder | FR-005–007 / AC-002、006 | E-02 |
| T-04 | 装配 runtime，增加 Gateway 与 CLI 入口 | T-02、T-03 | done | Builder | FR-008–010 / AC-001、005、006 | E-02、E-03 |
| T-05 | 增加 Workbench 记忆库和用户控制 | T-04 | done | Builder | FR-009、010 / AC-007 | E-04 |
| T-06 | 完成 unit、integration、独立进程和浏览器正负验证 | T-02–T-05 | done | Verifier | FR-001–010 / AC-001–007 | E-01–E-04 |
| T-07 | 执行真实 DSH smoke、完整门禁并同步事实/SOP/证据 | T-06 | done | Maintainer | NFR-001–004 / AC-008 | E-05、E-06 |

状态：todo / in_progress / blocked / done。
