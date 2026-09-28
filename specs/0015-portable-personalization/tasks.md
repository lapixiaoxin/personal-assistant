# SPEC-0015 工作项

| ID | 工作与产物 | 依赖 | 状态 | 角色 | FR / AC | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| T-01 | 固化可迁移个性化、surface 与 Harness 边界，新增 ADR-006 | 无 | done | Builder | FR-001、011 / AC-001 | ADR-006、架构与协议文档 |
| T-02 | 提取 personal-context 领域包与 Task adapter，保持现有行为 | T-01 | done | Builder | FR-001–004 / AC-001–003 | 单元与全量测试通过 |
| T-03 | 升级 DSH rc.2 并增加 online 新鲜度门禁 | T-01 | done | Builder | FR-009、010 / AC-007、008 | `check:dsh`、`check:dsh:latest` 通过 |
| T-04 | 实现并打包外部 dsh-lumi bundle | T-02、T-03 | done | Builder | FR-005–008 / AC-004–006 | plugin 测试与 bundle verifier 通过 |
| T-05 | 完成单元、契约、隔离 Web profile 和完整门禁 | T-02–T-04 | done | Verifier | NFR-001–004 / AC-001–009 | `pnpm check`、docs check 通过 |
| T-06 | 同步事实、SOP、evidence，集成 main 并推送 | T-05 | in_progress | Maintainer | FR-011 / AC-009 | 文档已同步；待 commit / push |

状态：todo / in_progress / blocked / done。
