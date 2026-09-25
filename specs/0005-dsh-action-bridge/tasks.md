# SPEC-0005 工作项

状态：done / locally verified。角色为责任边界记录。

| ID | 产物 | 依赖 | 角色 | 状态 | 需求 / 验收 |
| --- | --- | --- | --- | --- | --- |
| T-01 | rc.1 工具链、profile 与 SDK env 证据；完整 Spec 包 | 无 | Maintainer | done | NFR-001 / AC-007 |
| T-02 | Cordis typed tools 与全局单调 guard 插件 | T-01 | Builder | done | FR-003、005 / AC-002、004 |
| T-03 | 每 Run loopback bridge、token、请求边界与 Action scope | T-01 | Builder | done | FR-001、002、004、007 / AC-001、003、006 |
| T-04 | DSH 子进程环境清理与 runtime composition | T-02、T-03 | Builder | done | FR-006、008 / AC-005、007 |
| T-05 | rc.1 真实子进程 prepare/execute/旁路契约 | T-04 | Verifier | done | AC-002–005 |
| T-06 | 并发、取消、token 隔离与真实本地 I/O 验收 | T-04 | Verifier | done | AC-003、006 |
| T-07 | 完整 `pnpm check`、事实文档、SOP、证据与回滚 | T-05、T-06 | Maintainer | done | 全部 |
