# SPEC-0007 检查单

## Ready

- [x] 用户结果、授权、公开读取范围和非目标可判定。
- [x] research workflow 与普通任务路由边界明确。
- [x] URL allowlist、SSRF、来源快照与引用覆盖验收可自动执行。
- [x] 外部写入、登录态来源、搜索和自动发布不在本切片。
- [x] 浏览器及真实只读 smoke 可使用隔离数据目录执行。

## Done

- [x] FR-001–010 已实现。
- [x] URL、DNS rebinding、重定向、类型、大小和超时负向测试通过。
- [x] source snapshot 不可变、可读回且摘要匹配。
- [x] DSH 只能读取本次 Task 声明来源，通用 web/Shell/写入旁路仍阻断。
- [x] 引用覆盖成功与失败场景均有证据。
- [x] Gateway、CLI 与 Workbench 入口行为一致。
- [x] 桌面与移动视口无溢出、遮挡和 console error。
- [x] 真实公开 HTTPS smoke 完成。
- [x] `pnpm check` 通过。
- [x] README、工程事实、SOP、evidence 和回滚说明已同步。

## 发布

- [x] 功能提交 `356159e` 与证据提交 `653c9cc` 已快进集成本地 `main`。
- [ ] 远端 push 或部署具有独立授权和记录。
