# SPEC-0011 工作项

| ID | 工作与产物 | 依赖 | 状态 | 角色 | FR / AC | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | 定义 Reminder / Notification contracts 与时间边界 | 无 | done | Builder | FR-001–003、007 / AC-004、006 | E-01 |
| T-02 | 实现独立 SQLite store、migration、misfire 和 dedupe | T-01 | done | Builder | FR-002、004–007、011 / AC-001–007、009 | E-01、E-02 |
| T-03 | 实现单 timer ReminderService 与 runtime.ready 接线 | T-02 | done | Builder | FR-008、009、012 / AC-001–003、008、012 | E-02、E-03 |
| T-04 | 增加 Gateway 与 CLI 提醒/通知入口 | T-03 | done | Builder | FR-001、006、007、010 / AC-002–007 | E-03、E-04 |
| T-05 | 增加 Workbench 提醒与本地通知收件箱 | T-04 | done | Builder | FR-010 / AC-010 | E-05 |
| T-06 | 完成独立进程、真实 timer、浏览器与完整门禁 | T-02–T-05 | done | Verifier | FR-001–012 / AC-001–012 | E-01–E-05 |
| T-07 | 同步事实文档、SOP、证据并集成 main | T-06 | in_progress | Maintainer | NFR-001–004 / AC-011 | E-06 |

状态：todo / in_progress / blocked / done。
