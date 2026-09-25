# SPEC-0008 检查单

## Ready

- [x] 用户结果、输入字段、工具边界和非目标可判定。
- [x] meeting workflow 与普通任务路由边界明确。
- [x] 固定 marker、标题顺序和非空段落可自动验收。
- [x] 不接入外部 connector，不执行 Action 或发布。
- [x] 浏览器和真实模型 smoke 可使用虚构会议与隔离数据执行。

## Done

- [x] FR-001–010 已实现。
- [x] 输入边界、路由优先级和 verifier 正负测试通过。
- [x] meeting profile 完成 protected handshake 且没有 Host tools。
- [x] Shell、文件写和通用网络旁路仍阻断。
- [x] Gateway、CLI 与 Workbench 入口行为一致。
- [x] 桌面与移动视口无溢出、遮挡和 console error。
- [x] 真实 MiniMax 虚构会议 smoke 完成。
- [x] `pnpm check` 通过。
- [x] README、工程事实、SOP、evidence 和回滚说明已同步。

## 发布

- [ ] 功能提交 `36db187` 与证据绑定提交已集成本地 `main`。
- [ ] 远端 push 或部署具有独立授权和记录。
