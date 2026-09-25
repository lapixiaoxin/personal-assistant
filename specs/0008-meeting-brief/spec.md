# SPEC-0008: 结构化会议准备简报

状态：Implemented / verified_once · v0.1 · 2026-09-25。

负责人：lumi Agent。关联 Goal：超级个人助手 MVP；M1.6 会议准备场景。

授权来源与范围：用户授权 Agent 按既有方案持续开发、测试和维护文档，直至交付满意的 MVP。本切片只处理用户显式提交的会议上下文，不读取日历、通讯录、历史文档、网页或外部系统，也不执行会后动作。

## 问题和目标

普通自由文本可以让 DSH 生成会议建议，但输入结构、输出完整性和工具边界都不可稳定验收。用户无法确认简报是否覆盖会议目标、参与者、议程、待决问题、风险和跟进项，也无法区分模型完成生成与实际产物合格。

成功后，用户可在 Workbench、Gateway 或 CLI 中结构化提交会议主题、目标、参与者、议程和背景。lumi 将请求规范化后路由到独立 `meeting-agent`，在无 Host Action、研究或外部 connector 工具的受保护 profile 中生成固定结构的会议准备简报。Host 只有在首尾 marker、六个必需段落、顺序及非空内容全部通过确定性校验后才完成 Task。

## 范围

- 新增 meeting brief 输入 schema、workflow service、Gateway API、CLI 命令和 Workbench 第三种 composer 模式。
- 输入字段固定为 topic、objective、participants、agenda 和可选 background；服务端统一裁剪空白、限制数量和长度。
- workflow 生成稳定 marker，并把结构化字段渲染为规范化 Task content；调用方不能自行伪造 capability。
- 新增 `meeting-agent` capability，只由精确 workflow marker 路由，优先级高于自由文本 coding 规则。
- 新增独立 DSH protected profile；加载 guard 和启动握手，但不注册 lumi Action 或 research tool。
- 最终输出必须使用版本化首尾 marker，并包含固定顺序的六个非空 Markdown 二级标题段落。
- verifier 在 DSH 返回后、Core 标记完成前执行，并记录结果事件及审计元数据。

## 非目标

- 不连接日历、会议室、通讯录、邮件、IM、云文档、网页、MCP 或其他外部数据源。
- 不自动邀请参与者、创建日程、发送材料、写文档、录音、转写或发布纪要。
- 不从自由文本猜测或触发 meeting workflow；普通“帮我准备会议”仍按现有个人助手路径执行。
- 不验证参与者身份、背景事实或建议质量为真；本切片只验证结构完整性和受保护执行边界。
- 不实现会后纪要、行动项追踪、提醒调度或跨会议历史检索。

## 输入与输出协议

输入：

```json
{
  "schemaVersion": "lumi.meeting-brief/v1",
  "topic": "季度路线评审",
  "objective": "确定下一季度三项优先级",
  "participants": ["产品负责人", "研发负责人"],
  "agenda": ["回顾目标", "比较候选项", "确认责任人"],
  "background": "预算保持不变",
  "id": "task-optional"
}
```

输出首行必须为 `<!-- lumi.meeting-brief/v1 -->`，末行必须为 `<!-- /lumi.meeting-brief/v1 -->`。中间必须依次且仅出现一次：

1. `## Objective`
2. `## Participant Considerations`
3. `## Agenda`
4. `## Decisions and Questions`
5. `## Risks and Preparation`
6. `## Follow-ups`

每个段落在下一标题或末尾 marker 前至少包含一个非空正文字符。正文语言应跟随用户输入，协议标题保持稳定。

## 需求

| ID | 行为 |
| --- | --- |
| FR-001 | meeting brief 必须包含非空 topic、objective、1-30 个唯一 participants、1-20 个 agenda 项；background 可选，所有字段有明确长度上限。 |
| FR-002 | workflow 必须生成 `lumi-workflow:meeting-brief/v1` 并把规范化结构渲染进 Task content；普通 Task 无法通过 channel 或关键词进入 `meeting-agent`。 |
| FR-003 | Router 必须在 coding 关键词判断前识别精确 meeting marker，并选择独立 `meeting-agent` capability。 |
| FR-004 | meeting DSH Run 必须加载 protected guard 和 ready handshake，但不注册 `lumi_artifact_prepare`、`lumi_action_execute` 或 `lumi_public_web_fetch`。 |
| FR-005 | meeting profile 必须明确禁止网络、文件修改、Shell、Action、research、MCP 和外部 connector，并只基于 Task content 生成简报。 |
| FR-006 | verifier 必须检查首尾 marker、六个标题的唯一性、顺序和非空正文；任一条件不满足时 Task failed。 |
| FR-007 | verification 必须记录 workflow、verifier version、状态和安全原因；不得把完整会议背景复制到审计记录。 |
| FR-008 | Gateway 必须提供 `POST /v2/workflows/meeting-brief`；CLI 必须提供等价 `meeting` 命令。 |
| FR-009 | Workbench 必须提供会议准备 composer，收集五类输入并复用已有任务详情、轮询、结果和审计视图。 |
| FR-010 | 已有普通任务、研究简报、Action API 和 capability 路由保持兼容。 |

| ID | 质量约束 |
| --- | --- |
| NFR-001 | protected bridge 按 capability 显式开启：Action tools 只给 personal，research tool 只给 research，meeting 不获得 Host tool。 |
| NFR-002 | 输入规范化与输出验证为纯确定性逻辑，可在无模型、无网络环境完整单测。 |
| NFR-003 | Workbench 在 320px 以上窄屏与桌面视口无横向溢出、遮挡或不可达操作。 |
| NFR-004 | 真实模型验收只使用虚构会议样本，不包含个人身份、公司机密、凭据或外部副作用。 |

## 验收

| AC | Given / When / Then |
| --- | --- |
| AC-001 | Given 合法结构化输入，When 通过 Gateway、CLI 或 Workbench 提交，Then Task 带 server-owned marker 并路由到 `meeting-agent`。 |
| AC-002 | Given 重复参与者、空 agenda、超长字段或非 owner principal，Then 在执行 DSH 前拒绝，且不创建可执行 Task。 |
| AC-003 | Given 完整且顺序正确的六段输出，Then verification passed、Task completed；缺 marker、缺段落、重复标题、乱序或空段落时 Task failed。 |
| AC-004 | Given meeting Run，Then模型工具列表不含三个 lumi Host tools，bridge 仍完成 ready 握手；尝试 Shell、文件写或通用网络仍由 guard 阻断。 |
| AC-005 | Given 输入含 coding 关键词，Then精确 meeting marker 仍优先路由 `meeting-agent`；无 marker 的同样文本维持 coding 路由。 |
| AC-006 | Given Workbench 桌面或移动视口，When 填写会议字段并提交，Then可看到 meeting capability、固定结构结果和 verification 事件，无布局溢出或 console error。 |
| AC-007 | Gateway/API、组件、真实 DSH contract、全量 `pnpm check` 和桌面/移动浏览器验收通过；真实 MiniMax 虚构样本至少成功一次，若服务不可用则明确标记未验证。 |

## 约束、风险和未知

- 固定结构证明“段落存在”，不证明内容正确、充分或适合真实组织关系；真实使用前仍需用户判断。
- 会议背景会进入 Task content、SQLite 和模型上下文。本切片没有字段级加密或自动脱敏，因此不应提交凭据和高敏原文。
- protected guard 是受信 DSH profile 内的进程控制，不是 OS 沙箱。meeting profile 不注册 Host tool，但固定 DSH 仍可能暴露允许的只读内部工具；persona 要求不调用它们，关键外部副作用工具继续失败关闭。
- 输出协议采用英文固定标题保证稳定机器验证；正文可使用中文或其他输入语言。后续若演进 schema，新增版本而不静默放宽 v1 verifier。
