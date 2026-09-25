# SPEC-0006 验收证据

状态：passed · 2026-09-25。

实现 commit：`2d52f10 feat: add Workbench action inbox (SPEC-0006)`。

环境：macOS，Node 22.19.0，pnpm 10.20.0，DSH 0.1.7-rc.1。浏览器验收使用 Playwright Chromium 的 Desktop Chrome 与 Pixel 7 配置。

| 证据 | 验收 | 状态 |
| --- | --- | --- |
| E-01 Action API client 测试 | AC-002–006 | passed：9 项，覆盖 list/get/authorize/execute/reconcile/cancel 路径、Bearer 与错误信封 |
| E-02 Workbench 组件测试 | AC-001–007 | passed：6 项，覆盖任务回归、摘要事实、授权、取消、未知结果对账和失败恢复 |
| E-03 `pnpm check` | AC-001–007 | passed：lint、typecheck、DSH pin、16 文件/78 测试及生产构建，退出码 0 |
| E-04 mock executor + 真实 Action Runtime 浏览器验收 | AC-001–007 | passed：桌面/移动共 4 项，无 console error 或横向溢出 |

## 浏览器证据

运行：

```bash
PLAYWRIGHT_BROWSERS_PATH=/Users/bytedance/Documents/personal-assistant/data/playwright-browsers pnpm test:e2e
```

每个视口均完成既有任务审批流程，以及 Action `prepared → authorized → succeeded`。Action 流程经 Gateway、Action Runtime、SQLite Ledger 和 local artifact provider 实际落文件；测试从 Receipt 的文件 URL 读回正文，并确认 Verification 为 `passed`。

| 截图 | 字节 | SHA-256 |
| --- | ---: | --- |
| `data/workbench-evidence/desktop.png` | 130636 | `27d0128ebc823a3da42feffa538ad512e25fd94bdfbf83ed07e2fbfdad1644f9` |
| `data/workbench-evidence/mobile.png` | 297453 | `ccfc839ea33181be36865ca62c8fc777dbddbc71ce97ed6240d32d6cad37308c` |
| `data/workbench-evidence/action-desktop.png` | 200142 | `895bf431d6b2b9c8d142bc8588b947dd1b8cd68f74f7b7d7b4a9900b0691cdde` |
| `data/workbench-evidence/action-mobile.png` | 538857 | `70e656f073adbcdeb5f6019071e6e223506438b0fdae088d7ed4553072331dd3` |

主 Agent 实际查看了 Action 桌面与移动截图。长 ID、摘要和 artifact URL 均在容器内换行，操作区和证明链无重叠。

## 边界与清理

- 任务 executor 为 mock；没有调用真实模型、外部服务或公网 connector，不能标为 live。
- Action 生命周期使用真实本地实现，未模拟 Authorization、Receipt、Verification 或文件读回。
- 截图、浏览器二进制、隔离数据库和 artifact 测试数据位于 Git 忽略的 `data/`，不进入提交；没有修改默认 `data/assistant.db`。
- 无 Schema 或配置迁移。回滚只移除 Workbench/SPEC-0006 变更；已存在 Action 仍可由 CLI/HTTP 管理。
