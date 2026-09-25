# SPEC-0005 实现计划

状态：Accepted for implementation。对应 spec v0.1。

## 边界

DSH 插件位于 `plugins/dsh-action-bridge`，只依赖 Cordis 与 DSH tools 公共接口。它不知道数据库、owner token、provider 路径或 ActionService 实现。

Host 侧 bridge 位于 `adapters/dsh`，持有一个最小 `DshActionBroker` 端口。`apps/runtime` 将本机 principal 与既有 ActionService 绑定后注入 adapter。依赖方向保持为 runtime composition → adapter port → Host action service；Core 和 contracts 不导入 DSH。

`profiles/dsh-lumi` 加载插件并只用于 `personal-assistant`。`profiles/dsh-coding` 暂不加载该插件，继续作为本机开发能力；能力事实和安全文档必须明确这一边界。

## 协议和状态

每个 Run 启动一个 `127.0.0.1:0` HTTP server，生成随机 32-byte token。子进程只获得：

- `LUMI_ACTION_BRIDGE_URL`
- `LUMI_ACTION_BRIDGE_TOKEN`
- 清理 `PA_*` 和旧 bridge 变量后的其余运行环境

内部端点固定为：

- `POST /v1/actions/prepare`
- `POST /v1/actions/:actionId/execute`

prepare body 直接使用 `lumi.action-proposal/v1`。execute 没有可变动作参数；server 只接受 `contextRefs` 中 `lumi-action:<id>` 提取出的 ID。返回值投影为 action/authorization/verification 的非敏感摘要。

准备动作仍为 `prepared`。授权由现有 CLI/HTTP 完成。后续 Run 的 Task 显式携带 Action 引用，再调用 execute；ActionService 按既有事务消费一次性授权。网络中断或 provider 已写但回执未提交仍沿用 `OUTCOME_UNKNOWN` 与 reconcile。

## 工具策略

插件注册：

- `lumi_artifact_prepare`
- `lumi_action_execute`

全局 guard 使用显式允许集。首版允许只读文件发现、受控 lumi 工具和不产生外部副作用的 DSH 内部协调工具；其余名称一律拒绝。特别阻断 `write`、`edit`、Shell、web、workflow、`run_code` 与未知 MCP 工具。

guard 在 `tools/pre-execute` 和上游 approval 后执行，是同步、不可被后续 listener 放宽的最后一道进程内门禁。真正 Action 权限仍由 Host Broker 决定；guard 不签发授权。

## 安全

bridge 校验 loopback、Bearer token、方法、路径、content type、Content-Length/实际 body 上限和 JSON Schema。token 比较使用摘要与常量时间比较；响应和错误不回显 token。server 不提供动作列表、任意 GET、授权或取消接口。

插件仅接受由环境注入的 loopback URL，并使用固定相对路径。请求有短超时并转发工具 AbortSignal。Host HTTP token 不进入 DSH 子进程；真实 Connector 凭据仍禁止放入 DSH 环境和 workspace。

本切片是可信 profile 组合控制，不是敌对代码沙箱。能加载任意 Node 插件或直接运行同机进程的主体仍超出边界。

## 实现切片

1. 建立 SPEC、插件 package 和 profile patch，先做 plugin 单元测试。
2. 实现每 Run bridge、环境清理与 action-ref scope，做 HTTP 负向和并发 token 测试。
3. 将 runtime 的本机 principal/ActionService 接到 DshAdapter。
4. 用 rc.1 mock LLM 驱动真实 SDK 子进程，验证 prepare、execute 和工具阻断。
5. 完整门禁、真实本地文件续接、SOP、事实文档与证据。

## 验证与回滚

相关检查包括 plugin、adapter、runtime、Gateway 与 DSH contract。真实 I/O 使用独立数据库、DSH_HOME 和 artifact root；验证后只删除本次专用目录。

回滚先移除 personal profile 的插件 patch和 adapter bridge 注入；这会恢复旧版宽权限行为，因此只能同时停用 personal DSH execution，不能作为安全降级继续运行。SQLite 无迁移；已准备、已授权或 outcome_unknown 的 Action 保留并按 SPEC-0001 查询/取消/对账。
