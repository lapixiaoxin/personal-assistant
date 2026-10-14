# SPEC-0017 · 仓库与本机数据精简

状态：`locally verified` · 2026-10-14。

## 目标

让当前工作树只表达已经采用的 DSH 管家基础，不再同时维护被替代的旧 MVP、历史调研副本和大量过程文档。Git 历史保留可追溯性，本机运行数据与凭据不因代码精简被删除。

## 决定

1. 保留 server、飞书 channel、通道收件箱、DSH 插件、个人记忆/上下文、server/provider profiles。
2. 删除旧 Gateway、CLI、Workbench、Task/Action/Reminder/Research/Meeting Core、adapter、profile 和对应测试。
3. 当前规范默认使用单 Markdown 文件；只有跨团队或需要独立验收矩阵时再拆 plan/tasks/checklist/evidence。
4. 当前文档只保留事实、架构、协议、安全、路线、部署、上游和版本管理。历史方案由 Git tag/commit 追溯，不复制到 archive 目录。
5. `data/server` 为当前权威运行数据。旧 MVP 数据可逆地归档到 `data/legacy-mvp-20261014`；只删除明确可再生的缓存、浏览器和历史分析副本。

## 验收

- 当前服务行为不变，真实飞书收发数据保留。
- workspace 不再声明 legacy package，生产依赖无环、无跨层 SDK 泄漏。
- 个人记忆不再依赖已删除的通用 contracts。
- `pnpm install --frozen-lockfile`、`pnpm check`、bundle 验证和文档检查通过。
- 默认构建仅包含 `dist/server`。
- 用户未提交 SVG 保持原内容和未暂存状态。
- 清理前后记录 tracked 文件数、Markdown 数和本机磁盘变化。

## 回滚

源码可通过本提交的父 commit 恢复。旧数据库只移动不改写；需要旧工具时先恢复匹配版本代码，再从 legacy 目录复制到旧路径。当前 `data/server` 不与旧代码混写。

## 实际证据

- workspace package：27 → 7；生产源码：53 → 12；内部生产依赖边：66 → 4。
- tracked 文件：297 → 84；Markdown：132 → 22。
- 当前门禁：7 个测试文件 / 33 项通过；DSH 通道契约 5 项保留。
- `pnpm check`、`pnpm test:dsh:bundle`、`pnpm check:dsh:latest`、文档检查均通过。
- 默认构建只产生 `dist/server`；DSH release 仍为 registry latest `0.2.0-rc.2`。
- 文档收敛到当前事实/规程为主的最小集合；历史仍可从 Git 父提交读取。
- `data/` 从约 1.8 GB 降至约 224 MB，并删除未被当前安装引用的 633 MB 本地 pnpm store；合计回收约 2.2 GB。
- 当前 `data/server` 未修改，真实飞书服务保持 connected，4 条 sent、0 未决。
- 旧数据库及相关 DSH home 移动到 `data/legacy-mvp-20261014`，未改写正文。
- 用户三份未提交 SVG 不属于本分支差异；集成后继续保留。

集成后在 `main` 使用 frozen lock 重建依赖、构建并重启服务；状态读回为 `ready / connected`，保留 4 条 sent、0 未决。Linux systemd 仍未运行。
