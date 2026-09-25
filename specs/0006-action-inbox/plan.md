# SPEC-0006 实现计划

状态：Complete。对应 `spec.md` v0.1。

## 边界

- `apps/workbench/src/types.ts`：建立与 `@lumi/contracts` 等价的前端只读 Action 类型。
- `apps/workbench/src/api.ts`：封装 Action list/get/authorize/execute/reconcile/cancel。
- `apps/workbench/src/App.tsx`：在同一工作台增加任务/动作双视图及 Action 状态机操作。
- `apps/workbench/src/styles.css`：沿用既有视觉变量，补充动作列表、事实字段和操作区域。
- `apps/workbench/tests` 与 `tests/e2e`：验证客户端路径、组件状态门禁和真实浏览器闭环。

依赖方向保持 Browser → Gateway → Action Runtime → Ledger/Provider。Workbench 不直接访问 Ledger、artifact 文件或 DSH bridge。

## 协议和状态

复用现有 `/v2/actions` 响应，不创建前端派生状态：

| 服务端状态 | 页面命令 | 终态 |
| --- | --- | --- |
| `prepared` | authorize、cancel | 否 |
| `authorized` | execute、cancel | 否 |
| `executing` | 无，轮询 | 否 |
| `outcome_unknown` | reconcile | 否 |
| `succeeded` | 无 | 是 |
| `failed` | 无 | 是 |
| `cancelled` | 无 | 是 |

命令使用空 JSON body 的 POST。执行命令期间用 action ID + command 标记忙状态，阻止重复点击。命令成功后并行刷新列表及当前详情；命令失败只更新错误提示。

## 数据与兼容

没有 Schema、SQLite 或 artifact 迁移。任务视图仍使用 `/v1`。Action 类型复制协议字段供浏览器包使用，字段名和可空性必须与 `@lumi/contracts` 保持一致。

默认首屏仍为任务视图；新增动作视图不会改变现有任务 URL、提交语义或 Gateway 静态托管。

## 安全

- 沿用 `LumiApi` 的 Bearer header，不引入新认证存储。
- 页面不请求或展示 `inputRef` 指向的正文，仅展示引用和 SHA-256 摘要。
- 所有操作权限和状态校验仍由 Gateway/Action Runtime 执行，按钮门禁只是交互约束。
- `outcome_unknown` 不允许 execute；只调用 reconcile。
- 客户端不合成 receipt 或 verification。

## 切片与取舍

1. 先补规格和纯类型/API 接线。
2. 将侧栏顶部改为任务/动作分段控件，分别维护选择和筛选状态。
3. 在中间区域提供动作事实视图，在右侧提供授权、执行、取消、对账和证明链。
4. 增加组件测试，再扩展 Playwright 使用 API 预置 Action。
5. 完成门禁、浏览器截图、事实文档和证据。

暂不抽出路由或状态管理库：当前只有两个本地视图，React state 足够，新增依赖不会降低实际复杂度。

## 验证与回滚

- `apps/workbench` Vitest：API 路径、动作状态操作、任务回归。
- Playwright：API 预置 `prepared` Action，UI 授权并执行，确认回执/验证和 artifact 读回；桌面/移动检查无溢出和 console error。
- `pnpm check`：lint、typecheck、DSH pin、全量测试和 build。

回滚只需移除 SPEC-0006 Workbench 变更。没有协议、数据库和外部资源迁移；浏览器验收创建的临时数据库、artifact 和截图位于 Git 忽略的 `data/`。
