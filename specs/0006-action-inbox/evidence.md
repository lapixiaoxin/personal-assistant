# SPEC-0006 验收证据

状态：pending。

实现 commit：待完成。

| 证据 | 验收 | 状态 |
| --- | --- | --- |
| E-01 Action API client 测试 | AC-002–006 | pending |
| E-02 Workbench 组件测试 | AC-001–007 | pending |
| E-03 `pnpm check` | AC-001–007 | pending |
| E-04 mock DSH + 真实 Action Runtime 浏览器验收 | AC-001–007 | pending |

## 环境与边界

- 浏览器验收使用隔离 SQLite、artifact 目录和 mock executor，不调用真实模型或外部服务。
- Action prepare/authorize/execute/verify 经过真实 Gateway、Action Runtime、Ledger 和本地 artifact provider。
- 截图、浏览器二进制、数据库和 artifact 测试数据保存在 Git 忽略的 `data/`。
