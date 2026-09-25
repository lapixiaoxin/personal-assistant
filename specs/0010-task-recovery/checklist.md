# SPEC-0010 检查单

## Ready

- [x] 中断、重试和对账语义已区分。
- [x] coding-agent 与未知副作用默认失败关闭。
- [x] Task / Action / Recovery 事务和 v3 migration 边界明确。
- [x] queued Task 与 queued Action 的启动行为可判定。
- [x] unit、进程重启、Action 故障注入和浏览器验收可执行。

## Done

- [x] FR-001–011 已实现。
- [x] running Task 重启不再永久悬挂，也不被冒充为已恢复或已失败。
- [x] Action executing 重启只进入 outcome_unknown / reconcile，不重复 write。
- [x] retry 只创建一个新 Task，并保留原 Task 历史。
- [x] 活跃本机 runtime 不被其他入口误接管。
- [x] 跨 owner/principal 查询和命令被拒绝。
- [x] migration、unit、integration、CLI、浏览器和完整门禁通过。
- [x] README、工程事实、SOP、evidence 和回滚说明已同步。

## 发布

- [ ] 功能与证据提交已集成本地 `main`。
- [ ] 远端 push 或部署具有独立授权和记录。
