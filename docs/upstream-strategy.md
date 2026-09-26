# DSH 与 Desktop 上游策略

当前有效策略仍是下文的精确 npm 依赖与 SDK adapter。2026-09-26 的 [原生定制方案](design/11-dsh-native-customization.md) / [ADR-005](adr/0005-dsh-native-customization.md) 提出外部 bundle + DSH Web 的候选路线，尚未实施。若通过兼容性实验，将增加具体插件层的依赖与构建边界，继续保持领域包不依赖 DSH；不会因设计文档出现而自动扩大当前允许目录或升级版本。

## 决策

### DSH

主仓通过 npm 精确版本依赖 DSH，不复制源码、不使用 Git submodule，也不把 DSH checkout 放进 monorepo。

原因：

- `@deepseek-ai/dsh-sdk-client` 会解析同版本的 `@deepseek-ai/dsh`，版本不一致会直接失败。
- 包依赖可以由 lockfile 完整复现，升级差异集中且便于自动化。
- lumi 的 Assistant Core 只依赖本仓的 `TaskExecutor`，DSH 类型停留在 `adapters/dsh`。
- 若必须修改 DSH，补丁应先贡献上游；合并前使用独立 fork 和短期分支验证，不改变主仓依赖形态。

### DSH Desktop

当前阶段不接入 Desktop。Desktop 是交互入口和本机运行节点，不是个人助手的数据或策略核心。

后续接入时：

- 优先使用上游发行版加个人助手插件或 Gateway 客户端。
- 只有品牌、安装包、系统托盘、原生权限或设备 API 确实需要改动时，才维护薄 fork。
- Desktop 通过稳定的 HTTP/WebSocket/A2A 协议连接 Gateway，不直接导入 Assistant Core 或读取其 SQLite。
- Desktop 与 DSH 分别锁版本，避免一次 UI 升级同时迫使执行引擎升级。

## 兼容边界

```text
Assistant Core
    |
TaskExecutor (stable, owned here)
    |
adapters/dsh (compatibility boundary)
    |
@deepseek-ai/dsh-sdk-client == @deepseek-ai/dsh
    |
sdk profile + repository-owned patch
```

允许 DSH 影响的目录：

- `adapters/dsh`
- `profiles/dsh-*`
- `profiles/providers`
- `tests/contract/dsh-runtime.test.ts`
- `upstream.lock.json`

不允许 DSH 类型进入：

- `packages/contracts`
- `packages/assistant-core`
- `packages/policy`
- `packages/task-ledger`
- Gateway 和 channel 的公开协议

## 升级流程

每次升级使用独立 PR：

1. 选择一个明确的 DSH release，不跟随 `latest` 或分支。
2. 同时更新 `package.json`、`pnpm-lock.yaml` 和 `upstream.lock.json`。
3. 运行 `pnpm check:dsh`，确认 SDK、其携带的 runtime 和测试服务版本完全一致。
4. 运行 `pnpm test`。其中 DSH runtime contract test 会启动真实 SDK 子进程，并通过本地模拟模型完成一轮任务。
5. 使用真实模型凭据运行一次 opt-in smoke，验证文本、工具调用、取消和审计映射。
6. 检查 DSH release notes 中的 SDK protocol、Session event、profile patch 和权限策略变化。
7. 验证通过后再合并升级 PR；失败时保持上一版，不在 Core 内增加兼容分支。

## 当前锁定组合

| Component | Version | Role |
|---|---|---|
| `@deepseek-ai/dsh-sdk-client` | `0.1.7-rc.1` | TypeScript SDK and subprocess owner |
| `@deepseek-ai/dsh` | `0.1.7-rc.1` | Runtime resolved by the SDK |
| `@deepseek-ai/dsh-llm-mock-server` | `0.1.7-rc.1` | Credential-free runtime contract test |
| DSH Desktop | Not integrated | Future channel/local execution node |

`upstream.lock.json` 是版本组合的仓库级事实；`pnpm-lock.yaml` 是完整依赖解析事实。
