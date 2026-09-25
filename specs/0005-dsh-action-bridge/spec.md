# SPEC-0005：DSH 受控动作桥与旁路阻断

状态：Implemented / locally verified · v0.1 · 2026-09-25。关联 SPEC-0001、ADR-003 与 M1.3；用户已授权按 MVP 路线持续实施和本地验证。

## 问题与用户结果

`artifact.write` 已能在 lumi Host 内完成参数绑定、一次性授权、执行、读回和对账，但 DSH 默认 SDK profile 同时暴露 `write`、`edit`、Shell、公开网络和 `run_code`。persona 与任务级审批不能阻止模型绕开 Host 直接产生副作用。

本切片让 `personal-assistant` 的 DSH Run 只能通过短期、任务绑定的 loopback bridge 提议或执行受控动作；默认高风险 DSH 工具在真正执行前失败关闭。用户看到并批准的是 Host 已封存的具体 Action，批准后仍执行同一个参数摘要。

## 范围

包含：

- 外置 Cordis 插件，注册 `lumi_artifact_prepare` 与 `lumi_action_execute` typed tools。
- 每个 DSH Run 独立启动 loopback HTTP bridge，生成高熵短期 token，并绑定本机 principal、Task 与显式 Action 引用。
- `personal-assistant` profile 的单调工具 guard，按显式 allowlist 阻断未知工具以及文件写、Shell、网络、MCP、workflow/`run_code` 等旁路。
- DSH 子进程环境去除 `PA_*` 与旧 bridge 变量，再注入本 Run 的最小 bridge 配置。
- 复用 SPEC-0001 的 ActionService、持久授权、provider、Verification 与 reconcile；不建立第二套审批状态。
- 固定 DSH `0.1.7-rc.1` 的真实子进程契约测试，使用本地 mock LLM 驱动 broker tool 和被拒工具。

不包含：

- 真实外部消息、日历、支付或设备 Connector。
- 在 DSH 进程内等待长审批；准备后本轮应结束，批准后由新任务携带 `lumi-action:<id>` 引用执行。
- 通用 OS/container/VM 隔离、细粒度读取隔离或凭据 secret store。
- 将开发态 `coding-agent` 纳入受控动作 profile。它仍可在明确的代码任务中使用工作区工具，不得持有生产 Connector 凭据。
- DSH rc.2 升级、公共 SDK 扩展、任务自动恢复与调度。

## 功能需求

| ID | 行为 |
| --- | --- |
| FR-001 | `personal-assistant` Run 启动独立 loopback bridge；token 至少 256 bit、仅存在于进程内存和子进程环境，Run 结束或取消后监听器关闭。 |
| FR-002 | bridge 从 Host 绑定 principal，不接受 DSH 自报 owner/principal/task；只接受固定路径、方法、JSON content type 和有界请求体，认证失败及 malformed input 失败关闭。 |
| FR-003 | `lumi_artifact_prepare` 将原始参数交给同一 ActionService，返回 action ID、目标、摘要、状态和授权状态，不返回正文、Bearer token 或 provider 路径。 |
| FR-004 | 准备动作不自动授权或执行。`lumi_action_execute` 仅能引用本 Run 的 `contextRefs` 中形如 `lumi-action:<id>` 的 Action，并由 ActionService 再次检查 owner、参数摘要、授权、期限和额度。 |
| FR-005 | Cordis 全局单调 guard 对 `personal-assistant` 使用显式 allowlist；未知工具与 `write`、`edit`、`bash`/`pwsh`、`run_code`、workflow、web 和 MCP 调用在工具主体前被拒绝。子 Agent 与 PTC 嵌套调用不能绕过同一 guard。 |
| FR-006 | DSH SDK 子进程不继承 `PA_*` 或既有 `LUMI_ACTION_BRIDGE_*` 环境变量；仅注入本 Run bridge URL/token，并保留模型 provider 运行所需环境。 |
| FR-007 | bridge 返回稳定、脱敏的错误结构；普通审计只记录工具名、Action ID、摘要和状态，不记录正文或 token。 |
| FR-008 | `coding-agent` 与 mock executor 行为保持兼容；没有 broker 配置时 personal profile 必须拒绝启动受控插件，而不是静默退回宽权限。 |

## 非功能约束

- NFR-001：保持 DSH、SDK 与 mock server 精确固定 `0.1.7-rc.1`；插件只依赖该版本公开的 Cordis/tool API。
- NFR-002：loopback bridge 不绑定公网地址，不复用 Gateway Bearer token，不把 ActionService 或 SQLite 暴露给 DSH。
- NFR-003：插件和 Host bridge 均有独立测试；完整 `pnpm check` 与固定版本真实 DSH 子进程契约通过。
- NFR-004：现有 SQLite v2 无 Schema 迁移；停用插件和 profile patch 即可回滚，已准备/执行 Action 按原账本保留并对账。

## 验收

| AC | Given / When / Then | 对应 |
| --- | --- | --- |
| AC-001 | personal Run 启动时，bridge 只监听 `127.0.0.1`，错误 token、错误方法/路径、超限或非法 JSON 均不能调用 ActionService | FR-001、002 |
| AC-002 | mock LLM 经真实 rc.1 子进程调用 `lumi_artifact_prepare`，Host 生成 `prepared` Action 且无 Authorization、Receipt 或文件；模型请求中能看到两个 lumi tool schema | FR-003、008 |
| AC-003 | Action 未授权、未在 contextRefs 或已过期/撤销时调用 execute，均无文件；合法 `lumi-action:<id>` 经授权后只执行一次并通过 Verification | FR-004 |
| AC-004 | mock LLM 经真实 rc.1 调用 `write`、`edit`、`bash`、`web_fetch`、`run_code` 或未知工具，工具主体前返回 guard denial，专用工作区和外部探针零变化 | FR-005 |
| AC-005 | 子进程环境探针看不到 `PA_HTTP_TOKEN` 与伪造旧 bridge token；错误、Session 事件、审计和最终输出中不出现真实 bridge token或动作正文 | FR-006、007 |
| AC-006 | 取消或正常完成 DSH Run 后，原 bridge URL 不再接受连接；并发 Run 的 token 不能交叉使用 | FR-001、002 |
| AC-007 | 既有 coding DSH contract、mock executor、v1 API 与 SPEC-0001 的 59 项基线行为继续通过；DSH 版本锁未变化 | FR-008、NFR-001 |

AC-004 验证的是受控 profile 内已装配工具的执行门禁，不证明同机恶意代码或未来未经登记的独立进程已被 OS 隔离。默认拒绝未知工具用于使上游新增工具在升级后失败关闭。

## 风险与后续

DSH 仍能读取当前 workspace 中允许读取的内容，模型 provider 凭据也仍由 DSH 使用；本切片不解决敏感读取、模型出境或恶意进程隔离。真实 Connector 上线前必须将生产凭据放在 Host/Connector secret store，并增加进程级网络和挂载负向测试。

长审批不在工具调用中阻塞。Workbench 后续应展示 Action review，并把批准及执行作为同一 Action 的显式操作；M3 再由持久 Runner 自动建立携带 Action 引用的新 Run。
