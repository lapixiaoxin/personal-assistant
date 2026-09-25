# SPEC-0006：Workbench Action Inbox

状态：Implemented / verified_once · v0.1 · 2026-09-25。

负责人：lumi Agent。关联 Goal：超级个人助手 MVP。

授权来源与范围：用户授权 Agent 按既有方案持续开发、测试和维护文档，直至交付满意的 MVP。本切片只为已实现的 Action Broker 增加本地 Workbench 操作面。

## 问题和目标

DSH 已能通过受控桥接向 lumi 提议 Action，Gateway 也已提供准备、授权、执行、取消和对账 API，但用户只能借助 API 查看和操作这些动作。用户需要在日常使用的 Workbench 中区分任务与待执行动作，检查动作目标和摘要后再明确授权，并读取真实回执与验证结果。

成功后，DSH 提议的动作会出现在独立 Action Inbox。用户可以完成“审阅 → 授权 → 执行 → 验证”，或者在执行前取消；未知结果只能对账，不能盲目重试。

## 范围

- 在现有 Workbench 中增加“任务 / 动作”双视图和动作状态筛选。
- 复用 Gateway `/v2/actions` 的 list、get、authorize、execute、reconcile、cancel API。
- 展示动作目标、操作、能力版本、输入/动作摘要、期限、授权、回执和验证结果。
- 根据服务端 Action 状态只开放合法操作，操作完成后重新读取服务端详情和列表。
- 覆盖 API、组件和桌面/移动实际浏览器验收。

## 非目标

- 不新增 Action 类型、领域字段、授权策略、数据库迁移或 Gateway 路由。
- 不允许用户在 Workbench 中编辑 DSH 已提议的 Action 参数。
- 不把任务级 approve/reject 与参数绑定的 Action authorize 混为同一操作。
- 不为 `failed` 或 `outcome_unknown` 自动重试；未知结果只调用 reconcile。
- 不实现远程多用户、通知中心或原生桌面壳。

## 需求

| ID | 行为 |
| --- | --- |
| FR-001 | Workbench 必须提供清晰的任务/动作视图切换，并在动作视图显示待处理数量。 |
| FR-002 | 动作列表必须显示目标、操作、状态和更新时间；用户可按全部、待处理、已结束筛选。 |
| FR-003 | 动作详情必须展示服务端返回的 action、authorization、receipt、verification 关键事实，包括完整摘要和期限。 |
| FR-004 | `prepared` 只允许授权或取消，`authorized` 只允许执行或取消，`outcome_unknown` 只允许对账；非法状态不得显示相应命令。 |
| FR-005 | Action 命令期间必须禁用重复操作；成功后刷新列表与详情，失败时保留当前事实并显示服务端错误。 |
| FR-006 | 页面不得根据 HTTP 成功推断动作已完成；最终状态、回执和验证结果必须来自刷新后的 `ActionDetail`。 |
| FR-007 | 任务工作台既有提交、审批、取消、事件和审计行为必须保持兼容。 |

| ID | 质量约束 |
| --- | --- |
| NFR-001 | 桌面与 320px 以上窄屏不得出现横向溢出、文字遮挡或操作区不可达。 |
| NFR-002 | 页面不展示 Action 输入正文，只显示协议中已有的摘要和引用，避免扩大敏感数据暴露面。 |
| NFR-003 | 所有 Action API 沿用现有 Bearer 身份，前端不得新增或持久化其他凭据。 |

## 验收

| AC | Given / When / Then |
| --- | --- |
| AC-001 | Given Gateway 中存在 `prepared` Action，When 用户打开动作视图，Then 列表与详情显示目标、操作、动作摘要、输入摘要和期限。 |
| AC-002 | Given `prepared` Action，When 用户点击授权，Then 客户端调用 authorize，页面刷新为 `authorized` 且显示授权记录。 |
| AC-003 | Given `authorized` Action，When 用户点击执行，Then 客户端调用 execute，页面只依据返回及重新读取的详情显示 `succeeded`、回执和 verification。 |
| AC-004 | Given `prepared` 或 `authorized` Action，When 用户取消，Then 页面刷新为 `cancelled`，且不再显示执行命令。 |
| AC-005 | Given `outcome_unknown` Action，Then 页面不显示执行按钮，只提供对账；对账后展示服务端最终事实。 |
| AC-006 | Given Action 命令返回错误，Then 现有详情不被清空，错误可见，且按钮恢复可操作状态。 |
| AC-007 | 任务组件与 API 回归测试、`pnpm check`、桌面和移动 Playwright 均通过，无 console error 和横向溢出。 |

## 约束、风险和未知

- 当前动作能力仅为 `local-artifact@1.0.0 / artifact.write`，UI 使用通用字段布局但不声称支持未注册能力。
- Gateway list 已返回 `ActionDetail[]`；为避免陈旧授权状态，任何命令后仍按 action ID 重新读取详情。
- 真实 DSH 提议链已在 SPEC-0005 验证。本切片浏览器验收使用同一真实 Action Runtime 和本地 artifact provider，但不调用真实模型。
- Action `failed` 当前没有独立安全重试协议，页面只展示失败事实。
