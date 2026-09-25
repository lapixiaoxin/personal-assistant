# SPEC-0009 检查单

## Ready

- [x] owner、状态、分级、用途与 scope 边界可判定。
- [x] SQLite 表所有权和 Task Ledger migration 边界明确。
- [x] candidate、纠正、撤回和彻底遗忘语义可自动验收。
- [x] 自动注入的选择、预算、prompt 标记和失败方式明确。
- [x] 真实模型验收可使用非敏感虚构偏好和隔离数据。

## Done

- [x] FR-001–010 已实现。
- [x] 持久化、状态机、跨 owner、tombstone 与检索矩阵测试通过。
- [x] Task 原文和 contextRefs 不被记忆注入改写。
- [x] candidate、sensitive、secret、retracted 不进入模型或任务事件。
- [x] Gateway、CLI 与 Workbench 生命周期入口一致。
- [x] 桌面与移动视口无溢出、遮挡和 console error。
- [x] 真实 DSH 非敏感记忆 smoke 完成。
- [x] `pnpm check` 通过。
- [x] README、工程事实、SOP、evidence 和回滚说明已同步。

## 发布

- [x] 功能提交 `edefa73` 已形成，等待证据绑定后集成本地 `main`。
- [ ] 远端 push 或部署具有独立授权和记录。
