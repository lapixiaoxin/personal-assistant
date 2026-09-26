# ADR-005：优先通过 DSH 外部插件定制 lumi

状态：Proposed · 2026-09-26。关联：[SPEC-0014](../../specs/0014-dsh-native-design/spec.md)、[定制方案](../design/11-dsh-native-customization.md)。本记录提出候选运行结构，尚未实施或取代 [ADR-004](0004-host-ownership-and-module-boundaries.md) 的 v0.1 事实。

## 背景

lumi 当前通过 SDK 子进程调用 DSH，在外层提供独立 Gateway 和 Workbench。用户体验暴露出重复建设入口的问题：工作台以单个 Task 为中心，没有直接利用 DSH 原生多轮 Session、Web 流式交互和会话控制。

固定 DSH 源码显示，外部 bundle、Agent Preset、Cordis 服务、工具和 Web UI 扩展已有实际入口。个人长期数据不必因服务运行在 DSH Host 中而归属于某次 Session；数据所有权与进程部署可以分别设计。

## 备选

1. 继续扩建独立外壳：保留现有行为，但继续承担两套 UI / 会话状态与跨进程映射。
2. 直接长期 fork 整个 DSH：可修改全部行为，但升级和构建维护成本高，尚无证据证明必需。
3. 外部 lumi bundle + 自定义 Web profile / Preset，具体接缝不足时才做薄补丁：复用现有产品能力，将适配限制在插件边界。

## 候选决定

推荐 3，先以隔离环境 P0 验证可安装性：

- DSH Web 与 Session 承担普通对话；模型、Agent Loop、工具、Skills、子 Agent 与上下文机制沿用 DSH。
- lumi 领域服务由 DSH Host 内的 Cordis 插件装配，领域包仍不导入 DSH 类型；独立业务 ID、Schema、授权和证据归 lumi 管理。
- 普通对话不要求逐句建立业务 Task。长期承诺、外部动作与可核验任务继续持久记录，关联 DSH 会话引用。
- Memory、ActionService、Task Ledger、Recovery 和 Reminders 先复用，按验收结果渐进适配。Action 当前依赖 Task 及其事务，不能先删除 Core / Ledger 再补语义。
- 主交互路径逐步退出每 Task SDK 子进程和临时 HTTP bridge；现行入口只在替代功能、单写入所有权与回滚验证后退役。
- 只在必要能力缺少可用扩展点且有最小复现时引入上游补丁；优先贡献上游，维护明确版本和补丁清单。

这不要求长期所有能力都在 DSH 内运行。远程执行、实时交互、感知或物理控制可按实际需要独立部署，继续共用领域身份、授权和结果语义。

## 代价与不变量

外部 Web 扩展不是把现有 React 页面复制进插件目录：需要验证共享模块、UI slots、构建工厂以及 Remote 描述生成。Preset 重启恢复使用当前定义，必须锁版本并显式处理权限变化。模型可见记忆进入 Session，纠正与遗忘不能只更新 Memory 表。

Cordis 插件属于受信进程内代码。自定义工具入口不自动解决 Shell、Creator 或恶意插件旁路；关键门禁、凭据和配置管理必须被真实验收。无法在同进程组合中保持所需边界时，保留独立动作进程。

当前 SQLite 事务边界、未知结果先对账、稳定 owner、受保护验收和发布权均保持为约束。迁移不能制造双 runtime owner、双 scheduler 或重复外部动作；DSH 日志恢复不能替代业务回执。

## 接受条件与回退

1. P0：固定发行版下，预构建外部 bundle 经标准 Web launcher 加载；多轮会话、恢复、只读工具、UI slot、认证 Remote 与生命周期均有运行证据。
2. P1：原生界面完成受控记忆和 `artifact.write` 闭环，涵盖撤销、重复执行、崩溃对账与旁路阻断。
3. P2：完整实现 spec 覆盖入口兼容、单写入者交接、数据迁移及回滚，且既有必要功能有替代操作路径。

全部运行实验当前 `not_run`。P0/P1 不满足时维持现行架构并根据具体缺口调整，不以“插件化理论成立”替代验证。只有达到相应范围的接受条件后，才更新本 ADR 状态及被替代记录。
