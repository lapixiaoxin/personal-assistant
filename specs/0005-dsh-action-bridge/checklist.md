# SPEC-0005 检查单

## Ready

- [x] 固定版本的实际工具执行顺序、默认 profile 与 SDK env 接口已核对。
- [x] 受控 personal profile 与开发态 coding profile 的边界明确。
- [x] Host/插件依赖方向、短期身份、参数与 Action 引用范围明确。
- [x] 关键旁路、故障、并发和真实 I/O 验收可执行。
- [x] 不把进程内 guard 描述为通用 OS 沙箱。

## Done

- [x] Cordis 插件只能通过最小 bridge 调用既有 ActionService。
- [x] 未授权、越权引用、token 错误和参数异常全部失败关闭。
- [x] 文件写、Shell、网络、workflow/`run_code` 与未知工具在主体前被阻断。
- [x] DSH 子进程不继承 Host Bearer 或旧 bridge token。
- [x] Run 结束后 bridge 关闭，并发 token 不可交叉。
- [x] rc.1 真实子进程、完整测试与真实本地续接通过。
- [x] 文档、SOP、证据、能力状态和回滚同步。
- [x] 未覆盖的数据读取、OS 隔离、coding profile 与真实 Connector 仍明确标注。

## 发布

- [ ] 仅在 loopback 本地 MVP 启用。
- [ ] 真实 Connector 凭据未进入 DSH 环境或 workspace。
- [ ] 发布后重新执行受控 profile 负向探针。
