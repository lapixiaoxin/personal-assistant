# DSH 与 Desktop 上游策略

当前有效策略是精确 npm 依赖、SDK adapter 与外部 DSH bundle 并存。2026-09-28 的 [SPEC-0015](../specs/0015-portable-personalization/spec.md) 已将同 release 组合升级到 `0.1.7-rc.2`，并验证 `plugins/dsh-lumi` 可作为 tarball 安装到标准 Web profile。现行任务服务仍走 SDK adapter；外部 bundle 是已验证但未启用的迁移路径。领域包继续不依赖 DSH。

## 决策

### DSH

主仓通过 npm 精确版本依赖 DSH，不复制源码、不使用 Git submodule，也不把 DSH checkout 放进 monorepo。

原因：

- `@deepseek-ai/dsh-sdk-client` 会解析同版本的 `@deepseek-ai/dsh`，版本不一致会直接失败。
- rc.2 umbrella 由大量精确版本 peer 组成，而部分包的 npm `latest` 仍可能指向旧 release；只升级顶层包会产生混合运行图。
- 包依赖可以由 lockfile 完整复现，升级差异集中且便于自动化。
- lumi 的领域包只依赖本仓契约；DSH 类型停留在 `adapters/dsh` 和 `plugins/dsh-*`。
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
Personal domains / Assistant Core
    |
stable lumi ports
    |
adapters/dsh or plugins/dsh-lumi (compatibility boundary)
    |
one exact @deepseek-ai/dsh release graph
    |
SDK profile or installable bundle
```

允许 DSH 影响的目录：

- `adapters/dsh`
- `adapters/task-personal-context`
- `plugins/dsh-*`
- `profiles/dsh-*`
- `profiles/providers`
- `tests/contract/dsh-runtime.test.ts`
- `scripts/check-dsh-*.mjs`
- `scripts/verify-dsh-lumi-bundle.mjs`
- `upstream.lock.json`

不允许 DSH 类型进入：

- `packages/contracts`
- `packages/assistant-core`
- `packages/personal-context`
- `packages/personal-memory`
- `packages/policy`
- `packages/task-ledger`
- Gateway 和 channel 的公开协议

## 升级流程

每次升级使用独立 PR：

1. 选择一个明确的 DSH release，不跟随 `latest` 或分支。
2. 查询 `@deepseek-ai/dsh` 的 `latest`，再确认 SDK、mock、tools 和 bundle 所需 peer 都发布了同一 release；不按各包彼此不同的 dist-tag 拼装。
3. 同时更新 `package.json`、插件 manifests、`pnpm-workspace.yaml` 的全 peer overrides / packageExtensions、`pnpm-lock.yaml` 和 `upstream.lock.json`。
4. 运行 `pnpm check:dsh`，确认声明、安装结果和 lockfile 中全部 `@deepseek-ai/dsh*` 包只有目标 release。
5. 运行 `pnpm check:dsh:latest`。这是显式联网检查；registry 不可用时明确失败，不影响默认离线门禁。
6. 运行 `pnpm test:dsh` 和 `pnpm test:dsh:bundle`，分别验证 SDK runtime 契约与 tarball / Web profile 安装启动。
7. 运行完整 `pnpm check`；再按变更风险使用真实模型凭据执行 opt-in smoke。
8. 检查 release notes 中的 SDK protocol、Session event、profile patch、Preset、权限策略和客户端扩展变化。
9. 验证通过后再合并；失败时保持上一版，不在领域 Core 内增加上游兼容分支。

`pnpm-workspace.yaml` 中的完整 peer override 是当前 rc.2 发布图的兼容措施。升级后必须重建 lock 并由 `check:dsh` 扫描，不能把这份列表永久视为上游 API；上游修复依赖声明后可在一次独立升级中删除多余扩展。

## 当前锁定组合

| Component | Version | Role |
|---|---|---|
| `@deepseek-ai/dsh-sdk-client` | `0.1.7-rc.2` | TypeScript SDK and subprocess owner |
| `@deepseek-ai/dsh` | `0.1.7-rc.2` | Runtime and standard Web launcher |
| `@deepseek-ai/dsh-llm-mock-server` | `0.1.7-rc.2` | Credential-free runtime contract test |
| `@deepseek-ai/dsh-tools` | `0.1.7-rc.2` | Tool API used by lumi bundles |
| `@deepseek-ai/dsh-system-prompt` | `0.1.7-rc.2` | Dynamic context service peer used by `dsh-lumi` |
| DSH Desktop | Not integrated | Future channel/local execution node |

`upstream.lock.json` 是版本组合的仓库级事实；`pnpm-lock.yaml` 是完整依赖解析事实。
