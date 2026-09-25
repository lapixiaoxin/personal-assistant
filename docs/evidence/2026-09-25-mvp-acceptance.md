# lumi v0.1 本地 MVP 总体验收

状态：accepted_local_mvp / verified_once。日期：2026-09-25。验收范围：单机、单 owner、loopback Gateway、当前固定 DSH `0.1.7-rc.1`。

## 结论

lumi 已达到可交付的本地超级个人助手 MVP：用户可从 Web 或 CLI 提交任务，在同一控制层完成路由、审批、执行和审计；可安全准备并核验本地产物，生成受控研究/会议简报，管理个人记忆，在 Host 崩溃后区分重试与 Action 对账，并创建持久一次性提醒和处理本地通知。

该结论不等于公网生产、多用户 SaaS、长期无人值守或通用外部执行已经完成。

## 已验收能力

| 能力 | 用户结果 | 证据 |
| --- | --- | --- |
| 任务与审批 | CLI/HTTP/Workbench 共用 Task、Policy、Ledger；高风险文字任务等待确认 | SPEC-0001、0004 |
| 可信 Action | 参数摘要、一次授权、原子额度消费、真实文件写入、读回 Verification、未知结果对账 | SPEC-0001、0005、0006 |
| Web 工作台 | 任务、动作、记忆、提醒四视图；桌面与移动可操作 | SPEC-0004、0006、0009、0010、0011 |
| 公开来源研究 | 显式 HTTPS allowlist、SSRF 防护、不可变 snapshot、source ID 引用覆盖 | SPEC-0007 |
| 会议准备 | 结构化输入、隔离 profile、固定六段输出验证 | SPEC-0008 |
| 个人记忆 | 持久、确认、纠正、撤回、遗忘；purpose/scope/classification 受控注入 | SPEC-0009 |
| 重启恢复 | queued 续调度、running 中断分类、新 Task 重试、Action reconciling、stale PID 接管 | SPEC-0010 |
| 提醒通知 | 单次绝对时间、latest/skip、单 timer、去重、本地 inbox/ack | SPEC-0011 |

## 总体验证

- `SPEC-0011` 最终 `pnpm check`：退出码 0；25 个 Vitest 文件、195 项测试通过；10 项 contract 启动真实 DSH SDK 子进程。
- 最终 Playwright：desktop 7 + 320px mobile 7，共 14/14；无横向溢出或 console error。
- 文档检查：88 个 Markdown、185 个本地链接，无错误。
- Recovery：真实子进程在 Task running 后 `SIGKILL`，独立 CLI 识别 stale PID；活跃 runtime 不被第二进程接管。
- Reminder：250ms 真实本机 timer；独立 CLI 进程覆盖 latest 补发、skip、去重和 acknowledge。

2026-09-25 20:22 左右在当前 main `31decb4` 上执行真实模型 smoke：

```text
Task: task-mvp-live-20260925
Route: personal-assistant
DSH session: pa-task-mvp-live-20260925
Result: LUMI_MVP_READY
State: completed
Elapsed: about 4.2s
Tool calls: 0
```

输入仅要求返回固定 token，不含个人或公司信息。隔离数据库和 DSH home 在记录后删除。该结果仅为当前 provider/configuration 的一次连通性验证，不代表模型质量分布。

## MVP 边界

以下不阻塞本地 MVP，但在扩大部署或自主范围前必须继续建设：

- 没有产品级多轮 Conversation、流式 token 或语音实时交互。
- coding-agent 仍是开发态宽权限 profile；没有 OS 级沙箱或通用 Connector Broker。
- 没有真实邮件/飞书/日历 connector、系统通知或移动 push。
- 没有周期调度、安静时间、注意力预算、跨设备同步或分布式 lease/fencing。
- 记忆没有自动抽取、语义索引、字段级加密和备份删除传播。
- M1 三场景各 10 个真实样本、M3 7 天 soak 和量化 Human Effort Reduction 尚未完成。
- 自主发布、灰度和自动回滚未启用；远端 push 与部署不包含在本次授权记录。

## 运行入口

生产构建后，本机运行：

```bash
pnpm build
PA_EXECUTOR=mock pnpm start
```

真实模型移除 `PA_EXECUTOR=mock`，使用 `.env` 中已配置的 provider。打开 `http://127.0.0.1:4310/#token=<PA_HTTP_TOKEN>`。当前只应监听 loopback。

## 版本结论

建议将完成本报告的 main revision 标记为本地 `v0.1.0-mvp`。后续工作从真实个人任务样本与 Conversation/connector 需求中选择，不以继续增加页面或插件数量替代可靠性和价值验证。
