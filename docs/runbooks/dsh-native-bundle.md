# DSH 原生 lumi bundle 验证

状态：`verified_once` · 2026-09-28。适用于 DSH `0.1.7-rc.2`、Node >=22.19.0、pnpm 10.20.0 和 `@lumi/dsh-lumi-plugin` `0.1.0`。

2026-10-13：同一规程在 DSH `0.2.0-rc.2` 重新通过打包、安装、组合与临时 Web 启动，仍为 `verified_once`。此 bundle 验证不涵盖新飞书生产连接。

## 已证明范围

- `personal-context/v1` 可被当前 Task adapter 和 DSH 插件按同一语义消费。
- lumi bundle 可打成不含 `workspace:*` 的 tarball，并包含 patch、运行代码和类型。
- tarball 可安装到从 DSH `web` 模板创建的隔离 profile；配置中包含 `lumi` Preset 和插件。
- 标准 DSH launcher 可在随机 loopback 端口启动，token 交换或 HTML readiness 可被观察。
- snapshot 在每次 prompt 组装时重读；缺失、篡改、owner/purpose 不匹配时失败关闭；状态工具不返回正文。

这不证明真实个人数据迁移、Web client slot、多轮重启恢复、生产动作接线、实时语音或多设备同步。

## 前置

1. 使用仓库要求的 Node 和 pnpm 版本。
2. 运行 `pnpm install`，确保 lockfile 对应当前工作区。
3. 不设置真实个人数据路径或生产凭据；自动脚本只生成虚构 snapshot。
4. 不复用正在运行的 DSH home 或固定端口。

## 执行

先做离线版本与契约检查：

```bash
pnpm check:dsh
pnpm test:dsh
pnpm test:dsh:bundle
```

需要确认是否仍跟随 registry 当前 DSH release 时，显式联网执行：

```bash
pnpm check:dsh:latest
```

`test:dsh:bundle` 会自动：

1. 创建 `lumi-dsh-bundle-*` 临时根目录和权限为 `0600` 的虚构 snapshot。
2. `pnpm pack` 生成 bundle 并检查 manifest 与必需文件。
3. 从 DSH `web` 默认模板创建隔离 profile，再安装 tarball。
4. dump 最终配置并检查 bundle、Preset 和描述。
5. 选择随机 loopback 端口，启动 DSH Web 并观察认证交换或 HTML。
6. 终止子进程并递归删除该次临时目录。

成功观察：

```text
DSH lumi bundle verified: packed, installed, composed, and served on temporary port <port>
```

## 失败处理

- `check:dsh` 报混合版本：检查根 manifest、插件 peer/dev dependency、`pnpm-workspace.yaml` overrides / packageExtensions 和 lockfile；不要忽略 peer mismatch。
- `check:dsh:latest` 网络失败：记录 registry 和错误，保留离线门禁结果；不得把它写成“已是最新”。
- tarball 出现 `workspace:*`：修正 bundle 的发布依赖，不能依赖源码 checkout 继续验收。
- profile 缺少 Preset 或插件：检查 `dsh.bundle.patch`、`cordis.patch.yml` 和安装后的 profile manifest。
- snapshot 校验失败：检查 schema、owner、purpose、条目唯一性和 canonical digest；不得回退为空上下文并声称已个性化。
- Web 未就绪：保留脚本错误中的退出状态和有限启动输出，确认随机端口、Node 版本及 rc.2 依赖，不改用生产端口试错。

## 清理与回滚

自动脚本在成功和失败时都删除临时根目录，并对 DSH Web 先发 `SIGTERM`、超时后才发 `SIGKILL`。它不修改默认 `DSH_HOME`、现行 Gateway、SQLite 数据库或用户 profile。

升级失败时恢复 manifest、workspace overrides、lockfile 和 `upstream.lock.json` 的上一组一致版本，再完整执行原版本门禁。禁止只降顶层 `@deepseek-ai/dsh` 而留下另一 release 的 peer 图。
