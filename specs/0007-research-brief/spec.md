# SPEC-0007: 受控公开来源研究简报

状态：Implemented / verified_once · v0.1 · 2026-09-25。

负责人：lumi Agent。关联 Goal：超级个人助手 MVP；M1.5 研究报告场景。

授权来源与范围：用户授权 Agent 按既有方案持续开发、测试和维护文档，直至交付满意的 MVP。本切片只启用用户显式给出的公开 HTTPS 来源，不接入登录态网页、搜索引擎或外部发布。

## 问题和目标

当前 lumi 可以把通用请求交给 DSH，但受保护 profile 禁止所有网络工具，因此无法完成有来源证据的研究任务。直接重新开放 DSH 的 `web_fetch` 会让模型绕过 Host 的 URL 范围、SSRF、响应大小、来源留存和审计控制。

成功后，用户在 Workbench 或 CLI 中提交一个问题和 1-8 个明确 HTTPS 来源。lumi 将其路由到独立 `research-agent`，只允许 DSH 读取本次任务声明的 URL，保存规范化来源快照，并要求最终简报引用每个已声明来源的稳定 source ID。引用覆盖校验通过后任务才完成，正文直接作为任务结果显示。

## 范围

- 新增结构化 research brief 提交契约、Gateway API、CLI 命令和 Workbench 研究模式。
- 新增 `research-agent` capability，只由显式 workflow marker 路由，不靠模糊关键词抢占普通任务。
- 新增受控公开网页 provider：仅 HTTPS 默认端口、无 URL 凭据、DNS 地址全部为公共单播、限制重定向/响应大小/类型/时间。
- 使用 HTML parser 提取标题和可读文本；不执行脚本，不转发 cookie、Authorization 或用户自定义 header。
- 在独立本地目录保存不可变来源快照，记录 requested/final URL、抓取时间、媒体类型、内容摘要、截断状态和规范化文本。
- 在每 Run loopback bridge 中增加 `lumi_public_web_fetch`；只允许读取 Task `contextRefs` 明确声明的来源。
- 对研究结果执行确定性引用覆盖校验，并记录来源抓取与验证事件、审计元数据。

## 非目标

- 不提供搜索引擎、站内爬取、RSS、浏览器自动化、JavaScript 渲染、文件下载或认证网页。
- 不允许 HTTP、任意端口、IP literal、本机/私网/保留地址、用户信息或 fragment。
- 不把外部网页中的指令视为用户授权；不开放 Shell、通用网络、MCP 或文件写工具。
- 不自动把简报写成 Action artifact、发送消息或发布到外部系统。
- 不验证报告中每个自然语言事实为真；本切片只验证来源实际抓取、快照完整性和引用覆盖。
- 不实现全文索引、跨任务来源缓存策略、来源删除 UI 或长期研究调度。

## 需求

| ID | 行为 |
| --- | --- |
| FR-001 | research brief 提交必须包含问题和 1-8 个唯一的公开 HTTPS URL；服务端规范化并拒绝不支持的 scheme、凭据、端口、fragment 或超长 URL。 |
| FR-002 | workflow 必须生成稳定 marker 和逐来源 context ref，并路由到 `research-agent`；普通自由文本任务保持现有路由顺序。 |
| FR-003 | DSH Run 只能调用 `lumi_public_web_fetch` 读取本任务 context 中精确声明的规范化 URL；越界 URL 在 provider 调用前拒绝。 |
| FR-004 | provider 必须在每次请求及重定向前解析 DNS，并拒绝任何非公共单播地址；最多 3 次重定向、10 秒总超时、1 MiB 响应体。 |
| FR-005 | provider 只接受 UTF-8 `text/html`、`application/xhtml+xml` 或 `text/plain`，使用 parser 移除脚本/样式等非正文节点并限制规范化文本长度。 |
| FR-006 | 每次成功抓取必须保存不可变来源快照；相同 final URL 与内容摘要可幂等复用，冲突文件不得覆盖。 |
| FR-007 | 任务事件和审计必须记录 source ID、URL、摘要、来源引用和截断状态，不记录完整来源正文或 Run token。 |
| FR-008 | 研究执行结果必须引用全部声明来源对应的 source ID；缺少来源抓取或引用时，任务失败且记录 verification 失败原因。 |
| FR-009 | Workbench 必须提供普通任务/研究简报两种提交模式；研究模式提交问题和逐行 URL，并复用现有任务详情、轮询、事件和结果视图。 |
| FR-010 | CLI 必须提供等价的 `research` 命令，支持重复 `--source` 和可选 `--id`。 |

| ID | 质量约束 |
| --- | --- |
| NFR-001 | 受保护 DSH profile 继续 fail closed；`web_fetch`、`web_search`、Shell、文件写和未知工具仍在工具主体前被阻止。 |
| NFR-002 | 外部正文只进入来源快照和当前 DSH 工具结果，不进入审计、普通 task event payload 或错误响应。 |
| NFR-003 | Workbench 在 320px 以上窄屏与桌面视口无横向溢出、遮挡或不可达操作。 |
| NFR-004 | 既有 `/v1/tasks`、Action API、personal/coding 路由和 DSH Action Bridge 行为保持兼容。 |

## 验收

| AC | Given / When / Then |
| --- | --- |
| AC-001 | Given 合法问题与两个 HTTPS 来源，When 通过 Gateway、CLI 或 Workbench 提交，Then Task 带结构化 refs 并路由到 `research-agent`。 |
| AC-002 | Given Task 只声明来源 A，When DSH 请求 A，Then Host 返回带 source ID/digest/ref/text 的快照摘要；When 请求 B，Then 在 provider 前返回 `PERMISSION_DENIED`。 |
| AC-003 | Given localhost、私网 DNS、混合公私网 DNS、非 443 端口、HTTP、URL 凭据、超限正文或二进制内容，Then provider fail closed 且不写快照。 |
| AC-004 | Given HTML 含 script/style/导航与正文，When 抓取成功，Then 工具结果和快照不含脚本/样式正文，摘要与保存文本匹配。 |
| AC-005 | Given 同一 URL 与相同规范化正文重复抓取，Then 返回同一 source ID/ref；已有不同内容的目标文件不被覆盖。 |
| AC-006 | Given DSH 已抓取全部声明来源且最终结果引用全部 source ID，Then verification 通过、Task completed；任一来源未抓取或未引用则 Task failed。 |
| AC-007 | Given 恶意网页正文要求调用 `bash`、`web_fetch` 或准备外部动作，Then这些工具仍被 guard 阻断，且研究 profile 明确将网页视为不可信数据。 |
| AC-008 | Gateway/API、组件、DSH runtime contract、全量 `pnpm check` 和桌面/移动浏览器验收通过；真实公开 HTTPS smoke 至少完成一次并保存脱敏证据，若网络不可用则明确标记未验证。 |

## 约束、风险和未知

- DNS 在校验和连接之间可能重绑定。provider 必须把已验证地址固定到实际 TLS 连接的 lookup 结果，不能校验后再让默认 resolver 解析。
- URL 查询参数可能包含用户主动提供的敏感信息。Workbench 明示来源 URL，日志只记录 URL 元数据；本切片不尝试猜测并删除业务查询参数。
- 公开网页文本仍可能包含 prompt injection。研究 profile 将其标为不可信，且 Run 不具备通用网络或副作用工具；报告质量仍需用户判断。
- source snapshot 是内部证据缓存，不是用户授权的外部动作。它写入独立数据目录、不可变、权限为 owner-only，并在任务事件中可追踪。
- 引用覆盖只证明报告标记了实际抓取来源，不证明事实蕴含或来源权威性；后续语义引用验证独立演进。
