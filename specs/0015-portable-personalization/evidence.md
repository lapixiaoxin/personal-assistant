# SPEC-0015 验证证据

状态：passed / locally verified · 2026-09-28。

环境：macOS，Node `22.19.0`，pnpm `10.20.0`，DSH 同 release `0.1.7-rc.2`。全部个人上下文样本均为虚构内容；没有使用模型凭据、默认个人数据库或固定服务端口。

| 证据 | 范围 | 状态 |
| --- | --- | --- |
| E-01 | personal-memory manifest / 源码无 Core、Ledger、DSH 依赖；personal-memory 6 项、personal-context 4 项测试通过 | passed |
| E-02 | Task adapter 3 项通过；Task 原文保持、事件仅含 ID/revision/purpose/count，未知 capability 不注入 | passed |
| E-03 | `pnpm check:dsh` 检查 275 个 DSH lock package；runtime contract 11 项通过，含真实 SDK 子进程和 mock 模型上下文注入 | passed |
| E-04 | `pnpm test:dsh:bundle` 打包无 `workspace:*` tarball，从 Web 模板创建 profile、安装、dump config，并在随机 loopback 端口完成启动/认证观察 | passed |
| E-05 | plugin 3 项通过：动态重读、缺失/owner mismatch/digest tamper 失败关闭、状态工具不返回正文 | passed |
| E-06 | `pnpm check`、联网新鲜度、文档与清理通过；实现提交 `ce5e82b` 已快进合并并推送 `origin/main` | passed |

## 命令与观察

| 命令 | 结果 |
| --- | --- |
| `pnpm check` | exit 0；lint、typecheck、23 package / 45 source / 63 edge 架构检查、rc.2 对齐、28 文件 / 203 测试、server 与 Workbench build 通过 |
| `pnpm test:dsh:bundle` | exit 0；输出 `packed, installed, composed, and served`；临时 profile、snapshot、cache 和子进程由 `finally` 清理 |
| `pnpm check:dsh:latest` | exit 0；registry `latest=0.1.7-rc.2`，4 个锁定组件存在兼容 release |
| `python3 scripts/check-docs.py` | exit 0；110 个 Markdown、244 个本地链接，无错误 |
| `pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org` | exit 0；确认 24 个 workspace project 的 lockfile 最新并恢复 807 个依赖 |

验证过程中发现两个既有时间脆弱点：Workbench reminder fixture 将绝对日期写死为 2026-09-26；跨进程 memory CLI 用例的六次进程启动偶尔超过 Vitest 默认 5 秒。前者改为基于测试运行时未来一小时生成，后者仅设置 15 秒集成测试超时；业务断言未降低，最终全量 203 项通过。

一次 `pnpm install --frozen-lockfile --offline` 因本机 pnpm store 缺少 rc.2 tarball 而退出；它已经确认 lockfile 无需更新。随后使用公开 registry 和同一 frozen lock 安装成功，再次执行完整门禁通过。该失败不代表离线构建保证，P0 只保证锁文件可复现且 registry 依赖可取得。

## 明确未验证

- 未调用真实云模型、真实个人数据或外部写动作。
- 未实现或验证 Web client slot、两轮会话/重启恢复、实时语音、TTS、设备注册与跨设备同步。
- 未将 snapshot 文件作为生产服务，也未切换 Gateway、Workbench、SDK adapter 或默认 DSH profile。

不记录模型凭据、Bearer token、真实个人偏好、完整运行日志或默认数据库内容。
