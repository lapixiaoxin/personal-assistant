# SPEC-0018 · Host、通道与插件三层结构

状态：`locally verified` · 2026-10-14。

## 目标

让仓库结构直接表达 lumi 的长期模型：多个终端通过可信通道接入，由一个 DSH Host 持久运行；个人习惯、上下文和外部能力通过可替换插件快速接入。目录按运行时职责划分，不再把同一生命周期拆成多个技术包。

## 目标结构

```text
host/                       DSH 进程、通道宿主、收件箱和运行状态
channels/<surface>/         平台认证、输入规范化和结果展示
plugins/<capability>/       个人上下文或外部能力插件
profiles/                   DSH、server 和 provider 组合
deploy/                     部署样例
tests/                      跨层契约
docs/                       当前事实和规程
specs/                      增量规范
```

当前实现收敛为三个 workspace：

- `@lumi/host`：合并原 server、DSH channel plugin 与 channel store。Host 是唯一进程入口和持久收发所有者。
- `@lumi/feishu-channel`：保留飞书长连接与平台边界，不依赖 DSH。
- `@lumi/personal-context-plugin`：合并个人记忆、快照生成和 DSH 注入；记忆与快照模块保持 Harness-neutral。

## 边界

1. DSH 继续拥有推理、规划、Session、工具循环和 Agent 调度；Host 不实现第二套 Harness。
2. Channel 只认证平台输入、生成统一信封并展示结果；不持有业务授权，不依赖 Host、DSH 或插件。
3. Host 只组合 DSH、Channel 与持久收发语义；不实现具体平台协议和个人能力。
4. Plugin 是个人数据和能力的扩展单元。插件可依赖 DSH 的公开扩展面，但其中可移植领域模块不得导入 DSH 或平台 SDK。
5. 新终端增加 `channels/<name>`；新能力增加 `plugins/<name>`。没有调用方时不预建注册中心、设备层或 A2A 目录。

## 兼容与迁移

- `data/server/config.json`、`channels.db`、`dsh/` 和 `workspace/` 的格式与路径不变。
- `profiles/server/cordis.patch.yml` 只更新本地插件源码路径。
- 启动命令、飞书命令、模型 provider patch 和收发恢复状态机保持不变。
- 内部包名和源码路径属于仓库实现细节，可直接更新；不保留旧路径兼容壳。

## 验收

- 顶层不再存在 `apps/` 与 `packages/`；生产 workspace 仅为 Host、飞书 Channel 和个人上下文 Plugin。
- 架构门禁验证 Channel 不依赖 DSH，Plugin 中的领域模块不依赖 DSH/平台 SDK，生产依赖图无环。
- 既有 33 项单元/契约测试保持，DSH bundle 验证继续通过。
- `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm test:dsh:bundle` 和文档检查通过。
- 默认构建只产生 `dist/server`；启动与状态命令使用新路径。
- 集成后真实服务恢复 `connected`，原 7 条 `sent` 和 0 条未决记录不变。
- 用户未提交 SVG 不被暂存、覆盖或提交。

## 回滚

停止服务后回退本次代码提交并执行 frozen install/build，再使用原启动路径重启。运行数据无 schema 迁移，不需要回滚数据库；代码回滚不撤销已经送达的飞书消息。若新旧版本切换期间出现 `running` 或 `sending`，仍按既有规则分别保留为 `interrupted` 或 `unknown`，不得自动重放。

## 证据

- 生产 workspace：7 → 3；生产源码保持 12 个；内部生产依赖边：4 → 1。
- 架构门禁通过 15 项规则自测，验证 Host / Channel / Plugin 方向与插件领域层隔离。
- 7 个测试文件 / 33 项通过；DSH Host-Channel 契约的多轮、恢复、取消、工具拒绝和真实进程中断保持通过。
- lint、TypeScript、DSH `0.2.0-rc.2` 依赖图、文档链接和默认构建通过；`dist/` 仅包含 `server/`。
- 个人上下文 bundle 已完成临时 pack、安装、profile 组合和 DSH Web 启动。
- 真实服务切换、7 条 `sent` 读回和集成 commit 在合入 `main` 后补记。
