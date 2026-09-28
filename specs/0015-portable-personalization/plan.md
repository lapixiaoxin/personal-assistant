# SPEC-0015 实现计划

状态：Accepted for implementation · 2026-09-28。

## 边界

目标依赖方向：

```text
personal-memory --> contracts
personal-context --> personal-memory + contracts
task-personal-context adapter --> personal-context + assistant-core + task-ledger
dsh-lumi plugin --> DSH peer APIs + portable snapshot wire
runtime --> task-personal-context adapter
```

`personal-memory` 保留 SQLite 表所有权和生命周期 API。`personal-context` 只负责为一个目的生成不可变快照和模型数据块；它不知道 Task、Session、DSH、HTTP 或设备。Task adapter 负责当前任务事件与 `TaskExecutor` 映射。DSH plugin 是另一个消费者，不能导入 SQLite store、runtime 或 Gateway。

语音 UI、DSH Web、CLI、IM 和设备是 surface adapter。后续统一进入版本化 Interaction / Conversation 端口，再由运行策略选择 DSH 或其他实时运行时。本切片只固化该依赖原则，不预建无调用方的音频 transport。

## 协议和状态

`lumi.personal-context/v1`：

```text
schemaVersion
ownerId
purpose
generatedAt
revision = sha256(canonical owner/purpose/entries)
entries[] = id, revision, kind, scope, source, content
```

快照只承载已经允许发送给当前模型用途的条目，因此不再次携带 classification/status。排序和预算由 `PersonalContextService` 在生成时执行；插件仍做边界、重复 ID 和 digest 校验，防止手工篡改或部分文件。

模型文本继续使用 `<lumi-personal-context schema="lumi.personal-context/v1">` marker，并明确数据不是系统指令、凭据、授权或工具权限。Task 和 DSH 两条 adapter 使用同一 renderer，避免语义漂移。

DSH plugin 在 Agent Preset scope 中注册：

- `@deepseek-ai/dsh-persona`：稳定的 lumi 产品身份，不包含私人事实。
- context plugin：每次 system prompt assembly 同步读取快照并注册动态 context。
- `lumi_context_status`：只返回元数据，便于验证和诊断。

快照路径、预期 owner 和 purpose 由 profile config / 环境明确给出。插件启动校验配置，实际 assembly 和工具执行重新读取，以便 revision 更新无需重启；任何非法状态均抛错。

## 数据与兼容

不增加数据库表或 migration。已有 `personal_memories`、tombstone 和 migration 原样保留。现有 Task 执行路径只替换装饰器所在包，外部 API、CLI、Workbench、事件名和 prompt marker 保持兼容。

P0 fixture 写入 Git 忽略的临时目录；产品不会新增默认 snapshot 文件。未来服务化 adapter 可以消费同一 Schema，但不得把文件轮询当作跨设备同步。

DSH 版本从 rc.1 升到 rc.2：

- 同时更新根、adapter、plugins、lockfile 和 `upstream.lock.json`。
- `check:dsh` 继续做离线一致性与领域反向依赖检查。
- 新 `check:dsh:latest` 访问 registry，读取 `@deepseek-ai/dsh` 的 `dist-tags.latest`，并确认 SDK / mock / tools 存在同 release。该检查不进入默认 `pnpm check`，避免网络波动破坏可复现构建；升级 SOP 和周期维护显式运行。

## 安全

- snapshot 只由可信 owner 侧 provider 生成；P0 只使用虚构内容。
- 插件日志、工具结果和错误不包含正文；状态工具只返回元数据。
- snapshot 解析和 digest 不通过时不贡献任何上下文。
- 插件不接收 Gateway token、数据库句柄、Connector 凭据或任意写权限。
- DSH Web profile 的其他工具能力不因安装 lumi bundle 自动获得个人动作权限；P0 不连接 ActionService。
- 生产多设备身份必须由设备注册和认证映射，不能信任 UI 自报 owner/device ID。

## 切片与取舍

1. 完成规格、ADR 和边界说明。
2. 提取 personal-context 与 Task adapter，先保持旧 runtime 行为。
3. 升级 DSH rc.2，修复实际契约变化。
4. 实现无 Web client half 的外部 bundle，先证明 Host / Preset / context / tool 路线。个性化 UI 选择独立 surface，因此不把 P0 卡在上游未发布的 client builder。
5. 在隔离 profile 运行 tarball 安装、dump-config 和 mock 会话；通过后再决定 P1 的服务化个人上下文与语音协议。

不采用：

- 把个人记忆写进 DSH Session 作为唯一事实源。
- 让独立语音 UI 直接调用 DSH 内部对象。
- 浮动使用 npm `latest`。
- 先删除 Workbench、Gateway、Task Ledger 或 bridge。

## 验证与回滚

相关验证：

- personal-memory、personal-context、Task adapter unit/integration。
- plugin config、snapshot 正负、动态刷新、disposal、只读工具测试。
- `pnpm pack --pack-destination <temp>`，检查 tarball 文件和 manifest。
- 隔离 `DSH_HOME`：从 Web 默认 profile 初始化、自 tarball 安装、`--dump-config`；使用 mock server进行最小会话时不占用现有端口。
- `pnpm check:dsh:latest`、`pnpm test:dsh`、`pnpm check`、`python3 scripts/check-docs.py`。

回滚按层执行：

1. 停止本切片创建的隔离 DSH 进程，删除其临时 home / tarball / fixture。
2. revert 代码提交即可恢复 rc.1 和旧 Task decorator；数据库无迁移。
3. 不重试任何未知副作用。本切片不执行外部写动作，因此预期无业务副作用。

若 rc.2 contract 不能在不放宽门禁的前提下通过，保留实现分支和证据，不合并版本升级；若外部 bundle 安装失败，保留当前 SDK 集成并记录最小复现。
