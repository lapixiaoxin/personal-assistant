# 本地 Web 工作台

状态：verified_once · 2026-09-25。适用版本：SPEC-0004 v0.1，本机 Node 22.19.0、pnpm 10.20.0。当前仅验证 mock executor；真实模型和外部业务能力未包含在本记录。

## 前置

- 在仓库根目录执行，Node >=22.19.0、pnpm 10.20.0。
- `.env` 可配置 DSH provider；CLI 和 Gateway 会自动加载该文件。
- Gateway 仅监听 loopback，不把当前接口暴露到公网。

## 开发运行

在两个终端分别运行：

```bash
PA_EXECUTOR=mock pnpm dev
pnpm dev:web
```

打开 `http://127.0.0.1:4311`。Vite 将 `/health` 和 `/v1` 请求代理到端口 4310。

预期观察：

- 左侧显示任务列表与连接状态。
- 中间可提交任务并读取最终结果。
- 右侧可查看事件、审计；待审批任务显示允许和拒绝操作。
- 运行中任务可以取消。

## 生产构建运行

```bash
pnpm build
PA_EXECUTOR=mock pnpm start
```

打开 `http://127.0.0.1:4310`。完整构建先生成 Node 入口，再生成 `dist/workbench`；不要单独执行 `pnpm build:server` 后期待旧的 Workbench 产物仍存在，因为 tsup 会清理 `dist`。

## 验证

首次安装 Playwright Chromium：

```bash
PLAYWRIGHT_BROWSERS_PATH=./data/playwright-browsers pnpm exec playwright install chromium
```

运行浏览器验收：

```bash
PLAYWRIGHT_BROWSERS_PATH=./data/playwright-browsers pnpm test:e2e
```

测试启动 mock Gateway，在桌面 Chrome 和移动 Chromium 视口执行任务提交、审批、状态刷新及横向溢出检查。截图与 trace 写入 `data/`，不提交。

## 已知限制

- 当前任务提交和审批请求会等待执行结束，页面通过预先生成 task ID 和并发轮询显示进度。
- 当前审批是任务级，不显示 DSH 产生的真实工具参数。
- 当前没有产品级 Conversation、token 流、远程认证、运行中任务跨进程恢复或原生桌面能力。

## 停止与清理

开发服务使用 `Ctrl-C` 正常停止。mock 验收数据库、浏览器二进制、截图和 trace 位于 `data/`，均被 Git 忽略；按需精确删除对应子目录，不删除真实 `data/assistant.db` 或 DSH home。
