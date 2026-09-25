# 本地 Web 工作台

状态：verified_once · 2026-09-25。适用版本：SPEC-0004 v0.1、SPEC-0006 v0.1、SPEC-0007 v0.1、SPEC-0008 v0.1、SPEC-0009 v0.1，本机 Node 22.19.0、pnpm 10.20.0。浏览器任务 executor 使用 mock；Action 与 Personal Memory 经过真实本地运行时和 SQLite。研究、会议和记忆真实模型的独立验收分别见对应 SOP。

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

打开 `http://127.0.0.1:4311/#token=<PA_HTTP_TOKEN>`。Vite 将 `/health`、`/v1` 和 `/v2` 请求代理到端口 4310。

预期观察：

- 左侧显示任务列表与连接状态。
- 中间可提交任务并读取最终结果。
- composer 可切换普通任务、研究简报与会议准备；研究模式要求逐行 HTTPS 来源，会议模式收集主题、目标、参与者、议程和背景。
- 右侧可查看事件、审计；待审批任务显示允许和拒绝操作。
- 运行中任务可以取消。
- 顶部“动作”视图列出当前 principal 的 Action，并显示待处理数量。
- `prepared` 动作可授权或取消；授权后可执行；`outcome_unknown` 只显示对账。
- 成功动作显示 Authorization、Receipt、Verification 和产物引用，不显示动作正文。
- 顶部“记忆”视图可按状态筛选记录，显式设置用途/scope/分级，并执行确认、纠正、撤回或二次确认遗忘。

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

测试启动 mock executor 的 Gateway，在桌面 Chrome 和移动 Chromium 视口执行五组流程：

1. 任务提交、任务级审批和状态刷新。
2. API 准备 Action，页面授权并执行，随后经 API 读取 Receipt/Verification，并从回执文件 URL 独立读回正文。
3. 提交两个显式来源的研究简报，确认路由与来源展示；mock 不伪造抓取，citation verifier 必须明确失败。
4. 提交结构化会议准备，确认路由、六段结果渲染和 structure verifier 通过。
5. 创建候选记忆并依次确认、纠正、撤回和彻底遗忘，API 读回确认正文已不可访问。

五组流程均检查横向溢出和浏览器 console error。截图、隔离数据库、artifact 与 trace 写入 `data/`，不提交。

## 已知限制

- 当前任务提交和审批请求会等待执行结束，页面通过预先生成 task ID 和并发轮询显示进度。
- 任务视图的审批仍是任务级；Action Inbox 才提供参数摘要绑定的动作授权，两者不合并。
- Action Inbox 当前只支持已注册的 `local-artifact@1.0.0 / artifact.write`，不代表真实外部 connector 已启用。
- Memory Vault 只管理显式记录；没有自动对话抽取、语义检索或跨设备同步。`personal` 会进入模型，sensitive/secret 不自动注入。
- 当前没有产品级 Conversation、token 流、远程认证、运行中任务跨进程恢复或原生桌面能力。

## 停止与清理

开发服务使用 `Ctrl-C` 正常停止。mock 验收数据库、浏览器二进制、截图和 trace 位于 `data/`，均被 Git 忽略；按需精确删除对应子目录，不删除真实 `data/assistant.db` 或 DSH home。
