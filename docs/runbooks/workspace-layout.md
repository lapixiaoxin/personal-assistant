# lumi 工作区、依赖与测试布局

状态：verified_once · 2026-09-24 · macOS、Node 22.19.0、pnpm 10.20.0。适用于 SPEC-0002，证据见 [变更记录](../../specs/0002-lumi-workspace/spec.md)。只验证了本机命令与配置内容，未自动操作编辑器界面。

## 使用与维护

1. 在编辑器中打开根 `lumi.code-workspace`：工作区显示为 lumi，`node_modules`、`.pnpm-store`、`dist`、`coverage` 默认隐藏。需要浏览依赖时，在工作区设置中将对应 `files.exclude` 项改为 `false`。打开普通文件夹仍可开发，但不加载该工作区的隐藏设置。
2. 依赖由根 pnpm workspace 管理，不手工搬动、合并或删除子模块 `node_modules`。模块内依赖主要是指向共享安装内容的符号链接。
3. 修改内部包名或依赖声明后运行 `pnpm install`。本机原依赖存储在 `.pnpm-store`，本次成功刷新链接的命令如下：

```bash
NPM_CONFIG_CACHE=./data/tooling/npm-cache NPM_CONFIG_REGISTRY=https://registry.npmjs.org npx --yes --package=node@22.19.0 --package=pnpm@10.20.0 -c 'pnpm install --no-frozen-lockfile --store-dir=.pnpm-store --config.manage-package-manager-versions=false --registry=https://registry.npmjs.org'
```

本次输出 `downloaded 0`、`added 0`；lockfile 仅替换工作区包作用域。该命令针对当前公开依赖与本机工具环境，其他工程不得据此替换私有 registry。

## 测试迁移或新增

模块测试放同级 `tests/`，跨模块测试放根 `tests/<category>/`。遵循 [测试约定](../../tests/README.md)，不为了目录整洁改变用例语义。先运行当前文件，再运行完整检查：

```bash
pnpm exec vitest run packages/assistant-core/tests/index.test.ts
pnpm check
python3 scripts/check-docs.py
```

Agent 执行时外层加超时：单文件 120 秒，完整检查 300 秒；macOS 可用 `perl -e 'alarm shift; exec @ARGV' 120 pnpm exec vitest run <file>`。迁移后比较旧新文件，规范化包名/相对路径后应相等，测试发现数应保持一致。

## 失败分支与清理

`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`：先核对 `node_modules/.modules.yaml` 的 `storeDir`，本机应显式使用 `.pnpm-store`；不要立即删除依赖或强制重装。本次指定原 store 后恢复成功。

`.vscode/settings.json` 在本环境受编辑器保护，使用工作区文件承载设置，不绕过文件保护。默认 Node18 不支持本仓，使用上述隔离工具或切换至项目要求版本。

回滚命名提交后重新 `pnpm install` 刷新链接，不动用户数据库。CLI 演练数据只保存在 `data/lumi-reorg/cli-*`，可按需要精准清理；实际任务库和 DSH 会话不得混删。profile 演练的临时数据库和 DSH home 已在完成后清理，仅保留脱敏结果。
