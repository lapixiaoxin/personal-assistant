# SPEC-0007 验证证据

时间：2026-09-25。验证者：lumi Agent。规范：`spec.md` v0.1。实现基线：`33fd434`；实现提交：`356159e`。

环境：macOS arm64；Node `22.19.0`；pnpm `10.20.0`；DSH、SDK、tools、mock server 均为 `0.1.7-rc.1`。安装使用仓库忽略目录 `data/tooling/{npm-cache,pnpm-store}`；新增直接依赖固定为 `ipaddr.js@2.5.0`、`parse5@7.3.0`，未升级其他依赖。

## E-01 · 契约、路由、Gateway 和 Workbench 单元/集成

覆盖：

- research submission URL 规范化、唯一性、context ref 编解码和 owner 限制。
- 精确 workflow marker 优先路由到 `research-agent`，普通 personal/coding 路由回归。
- Gateway `/v2/workflows/research-brief` 服务端生成 refs；非法 HTTP/loopback 来源被 schema 拒绝。
- citation verifier 的全来源抓取、全部 source ID 引用成功，以及漏引用失败。
- Workbench 普通任务/研究简报 segmented composer、逐行来源提交和绑定来源展示。

聚焦命令退出码 0，8 个测试文件、65 个用例通过。最终全量门禁见 E-03。

## E-02 · URL、SSRF、正文和不可变快照

`adapters/research-sources/tests/index.test.ts` 最终 20 个用例通过，覆盖：

- 公网 IPv4/IPv6 与 loopback、RFC1918、link-local、CGNAT、ULA、IPv4-mapped loopback、documentation range 分类。
- 每次重定向重新解析并校验 DNS；公私混合结果在 transport 前拒绝。
- Node 22 lookup 的 single/all 两种调用只返回已验证地址。
- 非文本类型、重定向超限、非 UTF-8、正文截断。
- parse5 移除 script/style 正文。
- snapshot 独占创建、相同记录幂等复用、冲突不覆盖。

真实 HTTPS provider smoke：

```text
URL: https://example.com/
result: 200-equivalent provider success
mediaType: text/html
title: Example Domain
normalized text length: 142
truncated: false
```

首次 smoke 暴露 Node 22 默认 `lookup({all:true})` 与单地址 callback 不兼容，错误为 `ERR_INVALID_IP_ADDRESS`。修复为按 lookup mode 返回已验证单地址或完整地址集，并增加回归用例；同一 smoke 随后通过。

## E-03 · 真实 DSH SDK contract 与旁路负向

`pnpm check` 中 `tests/contract/dsh-runtime.test.ts` 启动 9 次真实 DSH SDK 子进程：

- coding 路由、MiniMax catalog、bridge readiness。
- Action prepare、authorized execute/read-back。
- research Run 只发现 `lumi_public_web_fetch`，通过 Host capture fixture source，最终引用覆盖 passed。
- `write`、`bash`、原生 `web_fetch` 均在工具主体前返回错误。

研究 contract 还确认 source snapshot 含 fixture 正文，而 Task event/audit 不含该正文。模型服务为官方本地 mock，不是云模型质量证据。

## E-04 · 桌面与移动浏览器

命令：

```bash
PLAYWRIGHT_BROWSERS_PATH=/Users/bytedance/Documents/personal-assistant/data/playwright-browsers pnpm test:e2e
```

退出码 0；desktop Chrome 与 Pixel 7 viewport 共 6 个场景通过：

- 任务审批。
- Action authorize → execute → receipt/verification。
- 研究简报提交两个来源，路由为 `research-agent`，绑定来源可见；`PA_EXECUTOR=mock` 不伪造抓取，因此 verifier 明确将 Task 标为 failed。

每个场景检查无 console error 和页面横向溢出。截图位于 Git 忽略的 `data/workbench-evidence/`。首次命令未设置既有 browser cache 路径，因找不到 Chromium 在启动前失败；补充 SOP 已记录的 `PLAYWRIGHT_BROWSERS_PATH` 后通过，未修改产品代码规避。

## E-05 · 真实 MiniMax + 公开 HTTPS 只读样本

使用仓库外既有 MiniMax China 凭据、隔离 SQLite/DSH home/research root 执行：

```text
question: 用一句话说明 Example Domain 的用途，并引用来源
source: https://example.com/
task: spec0007-live-example
capability: research-agent
DSH session: pa-spec0007-live-example
elapsed: about 7 seconds
final state: completed
```

关键证据：

- 实际工具：`lumi_public_web_fetch`，无 Action、Shell 或通用 web 调用。
- source ID：`source_b6884ffc9252983d798adc5a`。
- content digest：`sha256:e639c656ee40993c86c194936ccd14fb20b5c9d483d5b49d90e3246a8a2b87d3`。
- snapshot 文件 SHA-256：`885414c4d35eed5d820e94bab3f85b2746f955cd1735a3261e9b56d6a8bf2674`。
- 最终中文简报显式引用该 source ID。
- `verification.completed` 为 `passed`，verifier `research-citation-coverage/1`，sourceCount `1`。
- audit/event 序列化内容不含来源正文；snapshot 含规范化公开正文。

样本结束后精确删除 `/Users/bytedance/Documents/personal-assistant/data/spec0007-live`，二次检查目录不存在。该操作无外部写入或发布影响。

## E-06 · 完整工程门禁

命令：

```bash
PATH=<workspace-node-22.19.0>:$PATH pnpm check
```

退出码 0：

- ESLint 通过。
- TypeScript `tsc --noEmit` 通过。
- DSH 精确版本对齐检查通过，保持 `0.1.7-rc.1`。
- 19 个测试文件、118 个测试通过，其中 DSH runtime contract 9 项。
- CLI、Gateway 和 Workbench production build 通过。

第一次全量门禁为 117/118：Workbench fake API 在提交后返回旧任务，覆盖新详情中的 source refs。修正测试桩使其像真实 Gateway 一样更新任务列表后，组件测试和完整门禁通过；产品实现未为测试放宽。

## 未验证与适用边界

- 只完成 1 个真实模型/真实公开站点样本，状态为 `verified_once`，未达到路线图建议的 10 个研究样本。
- 没有验证登录态网页、搜索、JavaScript 渲染、PDF/附件、非 UTF-8、跨站爬取或长期缓存治理。
- citation verifier 只检查抓取覆盖和 source ID 出现，不证明自然语言事实蕴含、来源质量或引用位置精确。
- DSH guard 是受信 profile 内的进程内控制，不是恶意插件或同机进程的 OS 沙箱。
- 当前 snapshot 没有产品级 retention/delete UI；来源文本可能含个人数据，启用前仍需遵循用户选择和本地数据边界。

## 回滚

移除 `packages/research-workflow`、`adapters/research-sources`、`profiles/dsh-research` 及对应 runtime/Gateway/CLI/Workbench/bridge 接线，删除新增 event 枚举和两个精确依赖。没有 SQLite schema migration。只清理本次明确隔离目录，不删除共享 research snapshot。
