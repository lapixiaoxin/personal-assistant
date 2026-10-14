# DSH 上游策略

当前精确组合：`0.2.0-rc.2`。通过 npm 和 lockfile 复现，不复制源码、不使用 submodule。

## 原则

- SDK、umbrella、mock、LLM、tools 和插件 peer 必须属于同一 release。
- 优先使用 DSH 原生 Agent、Skills、MCP 和 Cordis 服务。
- 上游缺口先用薄 patch/adapter 验证，优先反馈上游，不把兼容分支扩散到插件领域层。
- `plugins/*/src/domain` 不导入 DSH；兼容代码只在 Host、插件 adapter、profile 和检查脚本。

## 新鲜度

```bash
pnpm check:dsh
pnpm check:dsh:latest
```

每日 GitHub workflow 只读检查 registry，不自动升级、提交或重启服务。alpha/pre-release 需独立评估。

## 升级

1. 确认目标 release、完整兼容包和官方 tag。
2. 在隔离 worktree 同步 manifests、peer overrides、lockfile 与 `upstream.lock.json`。
3. 运行 `check:dsh`、原生通道契约、bundle 验证和完整 `pnpm check`。
4. 核对 Agent create/resume/cancel、Session event、profile patch 和 tools guard 变化。
5. 需要时做 opt-in 真实模型/飞书验收。
6. 部署前停止输入，记录未决状态并备份完整 `data/server`。
7. 切换后读回验证；失败恢复匹配代码和数据版本。

`upstream.lock.json` 是选定组合事实，`pnpm-lock.yaml` 是解析事实。代码回滚不允许旧 DSH 直接写新版 Session。
