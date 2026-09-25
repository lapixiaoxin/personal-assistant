# DSH 受控动作桥验证

状态：verified_once。2026-09-25，macOS、Node 22.19.0、pnpm 10.20.0、DSH 0.1.7-rc.1。适用于 lumi `personal-assistant` profile 的本地单 owner 运行。

## 前置与边界

- 使用仓库固定的 DSH/SDK/tools `0.1.7-rc.1`，先运行 `pnpm check:dsh`。
- Gateway 和 Run bridge 只监听 loopback；真实 Connector 凭据不得出现在 DSH 环境、workspace、prompt 或 Git。
- `personal-assistant` 使用受控 profile；`coding-agent` 是本机开发态宽权限 profile，不适用本 SOP。
- 本 SOP 验证进程内 Cordis guard 与 Host Broker 接线，不证明恶意插件、同机进程、敏感读取或通用网络沙箱已隔离。

## 自动契约

使用 Node 22 执行：

```bash
pnpm test:dsh
```

预期包含：

1. 真实 DSH SDK 子进程加载 `profiles/dsh-lumi/cordis.patch.yml`。
2. 插件先用短期 token 回调每 Run bridge；缺少插件的 profile 在首个模型请求前失败。
3. mock LLM 调用 `lumi_artifact_prepare` 后，Action 为 `prepared`，无 Authorization、Receipt 或文件。
4. 已授权 Action 经新 Task 的 `lumi-action:<id>` context ref 执行一次，额度归零且 Verification 为 `passed`。
5. mock LLM 直接调用 `write` 与 `bash` 时，`tool.completed.isError=true` 且探针文件不存在。

完整门禁：

```bash
pnpm check
```

## 手工续接

真实模型准备动作后，先查看封存对象：

```bash
pnpm cli -- action list
pnpm cli -- action get <action-id>
```

确认目标、`actionDigest`、`inputDigest`、capability version 和 deadline 后授权：

```bash
pnpm cli -- action authorize <action-id>
```

可直接由 Host 确定性执行：

```bash
pnpm cli -- action execute <action-id>
```

或新建 DSH Run，显式携带原 Action 引用：

```bash
pnpm cli -- submit "执行我已批准的动作" --context "lumi-action:<action-id>"
```

后者仍由 ActionService 重验并原子消费同一授权。未授权、引用缺失、过期、撤销或已消费均不得产生第二份文件。

## 故障分支

- `requires a configured lumi action broker`：受控 capability 未注入 Host 端口，保持失败，不切换宽权限 profile。
- `plugin did not become ready`：插件未加载、依赖不兼容或 bridge 握手失败。检查 patch-relative 路径、版本锁和 DSH stderr；不得绕过握手继续发送 prompt。
- `APPROVAL_REQUIRED` / `APPROVAL_EXPIRED`：回到 Action review，不自动批准。
- `OUTCOME_UNKNOWN`：停止执行并运行 `action reconcile`，不得重新调用 execute。
- 工具返回 `disabled by the lumi protected profile`：该调用试图走未授权旁路；改用 typed broker tool 或新增独立 Connector spec。

## 停止、清理与回滚

正常完成和取消都会关闭 DSH 子进程及其 Run bridge。验证只删除本次专用数据库、DSH_HOME、artifact root 和探针，不删除共享 `data/assistant.db`。

回滚代码时不能只移除插件并继续运行 personal profile，因为那会恢复宽权限默认工具。应同时停用 personal DSH execution，保留 Action 账本；先对账 `executing/outcome_unknown`，再处理已有产物。

失效条件：DSH/SDK/tools 版本、profile composition、插件路径、Action Schema、子进程环境策略或 tool-result 事件结构发生变化。
