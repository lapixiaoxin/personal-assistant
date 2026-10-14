# SPEC-0019 · 运行配置与部署边界收口

状态：`locally verified` · 2026-10-14。

## 目标

把可版本化运行定义、私有部署配置和可变运行状态分开，确保当前模型路由可由 Git commit 复现，同时保留单 owner 本机部署的简单恢复路径。

## 边界

- `profiles/providers/*.patch.yml` 保存不含凭据的 provider 协议、端点、模型目录和兼容能力，进入 Git、测试和代码回滚。
- `data/server/config.json` 保存当前实例的 owner、模型选择、路径和飞书凭据；模型 Key 继续由 `.env` 或部署 secret store 提供。
- `data/server/channels.db`、`dsh/`、`workspace/` 和 `status.json` 是可变运行状态。
- `providerPatch` 只作为显式自定义覆盖保留。自定义 patch 必须是普通文件，且 group/other 不可写；个人上下文快照必须禁止 group/other 访问。
- 仓库采用完整 checkout + `node_modules` + launcher 的部署单元。`dist/server/main.js` 不是独立发布包；DSH profile 和本地插件源码仍由同一只读 checkout 提供。
- 所有 pnpm 脚本通过统一入口选择满足要求的 Node。当前本机可使用未跟踪的 `data/tooling/node-v22.19.0`，目标机可使用 PATH 中的兼容 Node。
- 个人上下文的解析、摘要和 prompt 渲染由一个 Harness-neutral 实现提供；领域服务和 DSH adapter 不再各自维护协议副本。

## 验收

1. MiniMax M3.1 Flash provider profile 位于 `profiles/providers/`，当前私有配置不再引用 `data/server` 内的 patch。
2. Host 根据安全的 provider ID 自动发现同名 tracked profile；不存在 profile 时继续使用 DSH 内置 catalog。
3. 配置、显式 provider patch 和个人上下文文件的类型与权限有自动测试。
4. 默认 Node 版本不满足要求时，pnpm 脚本自动使用项目本机 runtime；两者都不可用时给出明确错误。
5. 构建检查验证 launcher 以及仓库部署所需的 profile/plugin 路径，不宣称 `dist` 可独立运行。
6. 个人上下文领域入口与 DSH plugin 对同一快照返回一致解析、摘要和渲染结果。
7. `pnpm check`、`pnpm test:dsh:bundle` 和文档检查通过；真实服务重启后恢复 `ready / connected`，无新增未决记录。

## 迁移

新增 tracked provider profile，删除当前实例的 `providerPatch` 字段和旧私有 patch 文件。数据库、DSH Session 与 workspace 不迁移。重启前确认没有 `interrupted/unknown`，正常停止父进程后再启动新版。

## 回滚

停止服务并回退本规范对应代码提交；若旧代码仍需显式覆盖，可把 matching commit 中的 provider profile 复制为私有 patch，并在 `data/server/config.json` 恢复原 `providerPatch` 字段，再使用匹配 Node 版本启动。回滚不重放 `interrupted/unknown`，也不撤销已送达消息。

## 证据

- 架构门禁为 3 个 workspace、14 个生产源码文件、1 条内部生产依赖边；7 个测试文件 / 36 项通过。
- 个人上下文 bundle 完成临时 pack、安装、profile 组合和 DSH Web 启动。
- launcher 构建约 4 KB，构建检查验证所有外部 import 可由完整仓库部署单元解析。
- 当前私有配置已移除 `providerPatch`，旧 `data/server/minimax-m31-flash.patch.yml` 已删除。
- 重启后 DSH 命令行加载 `profiles/providers/minimax-m31-flash-cn.patch.yml`；飞书通道为 `ready / connected`，保留 7 条 `sent`、0 个未决记录。状态保持 `verified_once`，未执行新的真实消息发送。
