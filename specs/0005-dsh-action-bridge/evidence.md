# SPEC-0005 验收证据

状态：passed / locally verified。2026-09-25，macOS、Node 22.19.0、pnpm 10.20.0、DSH/SDK/tools 0.1.7-rc.1。

实现提交：`dec9990 feat: bridge DSH actions through lumi broker (SPEC-0005)`。验证使用真实 DSH SDK 子进程、本地 mock LLM、独立 SQLite/DSH_HOME/artifact root 和真实文件系统；未调用云模型或外部业务服务。

## 需求证据

| 证据 | 关联验收 | 实际观察 | 状态 |
| --- | --- | --- | --- |
| E-01 bridge 边界 | AC-001、006 | 每 Run 监听 `127.0.0.1` 随机端口并生成 32-byte/base64url token；错误/交叉 token 为 401，错误 method/path/content type/JSON/超限 body 被拒，关闭后连接失败 | passed |
| E-02 Cordis 接线 | AC-002 | `--dump-config` 将 patch-relative 插件解析为仓库内 file URL；真实 rc.1 模型请求包含两个 lumi tool schema，prepare 后 Action 为 `prepared` 且无授权、回执、核验或文件 | passed |
| E-03 跨 Run 续接 | AC-003 | 预先授权 Action 仅在 Task 携带 `lumi-action:<id>` 后执行；授权变为 `consumed/remainingUses=0`，Receipt succeeded，Verification passed；源 DSH Task 的事件与审计均记录 Action ID/摘要 | passed |
| E-04 旁路阻断 | AC-004 | 真实 rc.1 分别调用 `write` 与 `bash`，Session `tool/result.message.isError=true`，两个探针文件均不存在；插件单元矩阵覆盖 edit、web、workflow、`run_code`、未知 MCP 名称 | passed |
| E-05 环境与脱敏 | AC-005 | child env helper 移除 `PA_*` 和旧 bridge 变量后再注入 Run token；mock provider 请求不含测试 Host token，工具事件只含 call ID/name/error 状态 | passed |
| E-06 失败关闭与兼容 | AC-007 | 受控 capability 未注入 broker 时立即失败；使用无插件 patch 时 readiness 超时并在首个模型请求前关闭；原 coding contract 与 MiniMax catalog 初始化继续通过 | passed |

## 自动检查

```bash
pnpm check
```

退出码 0。结果：

- lint、TypeScript、DSH 精确版本检查通过；`upstream.lock.json`、插件依赖和安装产物均为 `0.1.7-rc.1`。
- 16 个测试文件、73 个用例通过。
- DSH contract 共 7 项，均启动真实 rc.1 SDK 子进程；模型服务为本地 mock。
- server tsup 与 Workbench Vite production build 成功。

重点新增覆盖：

- `plugins/dsh-action-bridge/tests/index.test.ts`：3 项。
- `adapters/dsh/tests/action-bridge.test.ts`：4 项。
- `adapters/dsh/tests/index.test.ts`：增至 5 项，并修正 rc.1 `tool/result.message.isError` 映射。
- `tests/contract/dsh-runtime.test.ts`：增至 7 项，包含 readiness fail-closed、prepare、授权续接、write/bash 旁路。

## 独立真实 I/O

在 `data/spec-0005-acceptance-*` 临时根中执行：Host prepare/authorize → 真实 DSH rc.1 子进程调用 `lumi_action_execute` → LocalArtifact provider 创建文件 → 独立读回 → 清理。

关键观察：

- action：`action_70fbab5c-449e-4f10-bf4d-209d25a22368`
- action digest：`sha256:5d811aa77a417efc47ea021e684e4ed834ef0c687d65aeb90eecec4503defbca`
- input/file/observed digest：`sha256:850a549b5615db361b4ccd26682ef155ac9d12f654fd9995a03d59bdcce49c78`
- authorization：`consumed / remainingUses=0`
- receipt：`succeeded / recovered=false`
- verification：`passed`
- task：`completed`
- 文件：32 bytes；mock provider 请求 2 次；约 2223 ms
- 清理读回：临时根不存在

## 实施中发现

首次使用 `!!js` 生成插件 `name` 时，rc.1 在表达式求值前执行兼容检查，将该对象视为非字符串并禁用可选行。改为文档支持的 patch-relative 路径后，dump-config 解析为 file URL。新增 Host readiness 握手确保类似插件导入、激活或兼容失败不能静默退回宽权限 profile。

DSH 的 rc.1 `tool/result` 错误标志位于 `data.message.isError`，而旧 adapter 只检查 `data.error`。实现已兼容两种结构并保留嵌套 fallback。

## 边界

- `personal-assistant` 是本次受控 profile；`coding-agent` 仍为开发态宽权限，不得持有生产 Connector 凭据。
- 进程内 guard 不隔离恶意插件或同机进程；read/grep 的数据范围、OS 沙箱和 secret store 未验证。
- 未运行真实云模型、MCP、消息、日历、支付或设备动作。
- SQLite schema 未变化。回滚插件时必须同时停用 personal DSH execution，不能恢复宽权限后继续作为受控路径。
