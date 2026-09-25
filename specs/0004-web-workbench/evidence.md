# SPEC-0004 验收证据

状态：passed。本次使用 mock executor 验证本地产品闭环；未调用真实模型或外部服务。

| 证据 | 验收 | 状态 |
| --- | --- | --- |
| E-01 API 与展示逻辑测试 | AC-001、003、005 | passed：`apps/workbench/tests/api.test.ts` 8 项 |
| E-02 组件交互测试 | AC-002、004、007 | passed：`apps/workbench/tests/App.test.tsx` 2 项 |
| E-03 Gateway 静态托管测试 | AC-006 | passed：`apps/gateway/tests/server.test.ts` 共 4 项 |
| E-04 `pnpm check` | AC-001–007 | passed：11 文件、34 测试；lint/typecheck/DSH pin/build 全部通过 |
| E-05 mock 实际浏览器验收 | AC-001–005 | passed：Playwright 桌面 Chrome 与移动 Chromium 共 2 项 |

## 浏览器证据

运行：

```bash
PLAYWRIGHT_BROWSERS_PATH=./data/playwright-browsers pnpm exec playwright test
```

两种视口均通过任务提交、waiting_approval、允许后 completed、无横向溢出和无浏览器控制台错误检查。主 Agent 查看了两张实际截图：

- `data/workbench-evidence/desktop.png`
- `data/workbench-evidence/mobile.png`

最终截图分别为 130511 / 297030 字节，SHA-256 为
`1b3733bab33a1b178c0ef75c699e8bfd3aed817b51e71ede380aa31657c884b4` 和
`5ba39e16d5f089e429f6e82ab4d4e312bcc4d31d02d8ab98764098c985d7125f`。

截图、浏览器二进制、测试数据库和 trace 均在 Git 忽略的 `data/` 下。mock 验收不标为真实模型服务验证。

## 边界

- 生产静态入口与 JS 哈希资源均通过实际 HTTP 200 检查。
- 现有同步提交 API 未改变，页面使用预生成 task ID 和轮询呈现状态。
- 参数级动作审批、产品级多轮对话、远程身份和跨进程恢复仍属于后续规格。
