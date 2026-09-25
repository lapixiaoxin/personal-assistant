# SPEC-0007 实现计划

状态：Complete。对应 `spec.md` v0.1。

## 边界

- `packages/research-workflow`：拥有 workflow 提交映射、context ref 编解码、来源抓取端口、来源快照端口、来源记录服务和研究结果引用校验。
- `adapters/research-sources`：实现受控 HTTPS 抓取、HTML/text 规范化及本地不可变快照。
- `packages/capability-registry`：注册 `research-agent`，只根据精确 workflow marker 路由。
- `adapters/dsh`：把当前 per-Run bridge 扩展为可选 research broker 路由；不把 provider 或文件存储实现带入 DSH 子进程。
- `plugins/dsh-action-bridge`：在 Host 明确启用时注册 `lumi_public_web_fetch`，沿用同一 Run URL/token 和单调 guard。
- `apps/runtime`：装配 workflow、source service、provider/store 和 research verification executor。
- `apps/gateway`、`apps/local-runner`、`apps/workbench`：提供三个等价入口，不复制 URL 授权与验证逻辑。

依赖方向为 Entry → Research Workflow port → Assistant Core，以及 DSH plugin → per-Run bridge → Research Source Service → fetch/store adapters。Core 不增加研究领域分支。

## 协议和状态

Research brief 输入：

```json
{
  "schemaVersion": "lumi.research-brief/v1",
  "question": "比较两个方案",
  "sources": ["https://example.com/a", "https://example.com/b"],
  "id": "task-optional"
}
```

workflow 生成：

- `lumi-workflow:research-brief/v1`
- `lumi-public-source:<base64url(canonical-url)>`

Bridge `POST /v1/research/fetch` 接收 `lumi.research-fetch/v1` 与 URL，返回 source ID、requested/final URL、title、media type、fetchedAt、content/text digest、sourceRef、truncated 和规范化 text。桥接响应不会包含 token、cookie 或 provider 内部地址。

状态继续复用 v1 Task 六状态。Research verification 是 executor decorator：只有 `research-agent` 执行后读取该 Task 的 `research.source_captured` 事件，要求所有声明 URL 均已抓取且每个 source ID 出现在最终输出中；通过后才把结果交给 Core 完成。

## 数据与兼容

来源快照保存在 `PA_RESEARCH_ROOT` 或 `data/research/sources`，文件名由 source ID 决定，JSON schema 为 `lumi.research-source/v1`。source ID 由 final URL 与规范化文本摘要确定；重复内容幂等读回复用，不覆盖冲突目标。

SQLite 不新增表。新增 `research.source_captured` Task event 类型，payload 只含元数据。现有 v1 event 消费者必须容忍新增事件；Workbench 已按通用事件展示，不依赖封闭 switch。

既有 Task/Action schema、数据库 user_version 和 artifact provider 不变化。`LUMI_ACTION_BRIDGE_*` 保持兼容；research Run 额外注入 `LUMI_RESEARCH_BRIDGE_ENABLED=1` 与 `LUMI_ACTION_BRIDGE_ENABLED=0`。

## 安全

- 输入 URL 在 workflow 服务和 provider 双重规范化。
- provider 只允许 HTTPS 默认端口，不允许 URL credentials、fragment 或 IP literal。
- 每一跳 DNS 解析结果必须全部为公共单播；TLS socket 使用已验证地址的自定义 lookup，减少 DNS rebinding 窗口。
- 不发送 cookie、Authorization、Referer 或用户自定义 header；User-Agent 固定且不包含身份。
- 超时、重定向、bytes、content type 和规范化文本均有限额；失败前不写 snapshot。
- DSH bridge 比较 canonical URL 与本 Run allowlist；外部正文视为数据，不是指令。
- 研究 profile 只注册 research fetch；Action broker、通用网络与副作用工具保持关闭。

## 切片与取舍

1. 固化 spec、context ref 和 source snapshot 契约。
2. 实现并单测 provider/store 的 URL、DNS、TLS、重定向、正文和不可变写入边界。
3. 扩展 DSH bridge/plugin 和 research profile，加入越界及旁路负向测试。
4. 注册 capability，装配 workflow 与 verification executor，增加 Gateway/CLI。
5. 在 Workbench 任务 composer 增加研究模式，复用任务详情和轮询。
6. 完成 DSH contract、浏览器与真实公开 HTTPS smoke，更新事实、SOP、证据。

不复用 DSH 原生 `web_fetch`：它无法表达本任务 URL allowlist、Host 快照和审计语义。暂不把公开读取建模为 Action：这是 P0 读取和内部证据缓存，没有外部写入，且每次 Run 已由显式来源范围约束。

## 验证与回滚

- Unit：URL/ref schema、路由优先级、DNS/IP 分类、重定向、类型/大小/超时、HTML parser、snapshot 幂等与冲突、引用覆盖。
- Contract：per-Run bridge 认证/allowlist/取消；真实 DSH SDK 发现并调用 research tool；通用 web/Shell 旁路继续失败。
- Integration：Gateway/CLI → workflow → Core → research capability；隔离 SQLite 与 research root。
- Browser：桌面和移动提交两个来源，检查路由、任务结果/失败与布局。
- Live smoke：只读一个稳定公开 HTTPS 页面，检查 TLS、source snapshot、digest 和清理；不发送或发布任何内容。
- Full gate：Node 22.19.0 / pnpm 10.20.0 执行 `pnpm check`。

回滚移除 SPEC-0007 新 package/adapter/profile/入口和装配，并删除新增 event 枚举。SQLite 无迁移；测试和 smoke 创建的数据只在 Git 忽略的隔离目录，按 source ID 精确清理。
