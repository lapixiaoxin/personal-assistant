# SPEC-0013 检查单

## Ready

- [x] 根 draft 已确认未跟踪、可再生且无唯一事实。
- [x] 运行数据库、凭据、缓存和两个监听服务已识别并排除。
- [x] 生产依赖图当前无环，唯一 package→adapter 反向依赖已定位。
- [x] 端口迁移保持 adapter 类型兼容出口。
- [x] 测试分层与架构门禁验收可自动执行。

## Done

- [x] 根目录 draft 为零，未来草稿路径已规范。
- [x] `data/README.md` 可跟踪，其他 data 内容继续忽略。
- [x] action-runtime 不再生产依赖 local-artifact。
- [x] LocalArtifactProvider 行为和兼容类型导出保持通过。
- [x] 架构 checker 当前仓库检查及负向 self-test 通过。
- [x] README、测试约定、publication SOP 与当前事实一致。
- [x] 聚焦测试、`pnpm check` 和 docs checker 通过。
- [x] 用户 SVG 未提交，4310/4313 服务和数据保持不变。

## 发布

- [ ] 变更与证据已提交并普通 push 到 `origin/main`。
- [ ] 未执行 release、部署或飞书发布。
