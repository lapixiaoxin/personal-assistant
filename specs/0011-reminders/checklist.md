# SPEC-0011 检查单

## Ready

- [x] 一次性提醒、误点和通知确认语义明确。
- [x] reminder store 与 Task Ledger schema 所有权分离。
- [x] 本地通知不扩大 Action 或外部发送授权。
- [x] timer、离线 catch-up、skip、dedupe 和 owner 隔离可自动验收。
- [x] Workbench 桌面/移动真实时间触发可在隔离数据执行。

## Done

- [x] FR-001–012 已实现。
- [x] online/latest/skip 每种路径最多一条通知。
- [x] 创建、取消、ack 和 owner 状态规则通过。
- [x] active/passive runtime 不会启动两个 scheduler。
- [x] Task Ledger 与 DSH 调用数量不受提醒影响。
- [x] CLI/HTTP/Workbench 行为一致。
- [x] 独立进程、真实 timer、浏览器与完整门禁通过。
- [x] README、工程事实、SOP、evidence 和回滚说明已同步。

## 发布

- [x] 功能提交 `e2386a8` 与证据绑定提交 `5e643c3` 已集成本地 `main`。
- [ ] 远端 push 或部署具有独立授权和记录。
