# SPEC-0012 检查单

## Ready

- [x] 清理对象已确认 clean 且 merged。
- [x] 用户未提交 SVG 与运行中服务已识别并排除。
- [x] 重构不修改公开 API、协议、数据库或授权。
- [x] 文件职责、兼容策略、验证和回滚已写清。

## Done

- [x] 架构文档准确区分 v0.1 已实现与长期 Proposed。
- [x] contracts 根入口导出与消费者 import 保持兼容。
- [x] task-ledger 保持单连接、单实现类和跨对象事务。
- [x] `user_version=3` 与 v1→v2→v3 migration 行为不变。
- [x] 包 README 说明责任、公开入口和禁止边界。
- [x] 聚焦测试、docs checker 与完整 `pnpm check` 通过。
- [x] 用户 SVG 未进入暂存/提交，4310/4313 服务仍在。

## 发布

- [x] 变更与证据已提交本地 `main`。
- [ ] 远端 push 或部署具有独立授权和记录。
