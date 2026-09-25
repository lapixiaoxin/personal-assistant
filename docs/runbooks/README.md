# 操作知识索引

| SOP | 状态 | 已证明的范围 |
| --- | --- | --- |
| [本机检查与 mock CLI](local-validation.md) | verified_once | 本机 Node22/pnpm10、现有检查；独立进程间任务/审批持久化 |
| [本地动作门禁、对账与回滚](action-boundary.md) | verified_once | 单 owner 认证、`artifact.write` 参数授权、读回核验、故障对账与 v1→v2 迁移 |
| [DSH 受控动作桥验证](dsh-action-bridge.md) | verified_once | rc.1 personal profile、每 Run bridge、跨 Run Action 引用和 Shell/文件旁路阻断 |
| [工作区、依赖与测试布局](workspace-layout.md) | verified_once | lumi 包链接刷新、测试分离与全量检查；编辑器配置已静态核验 |
| [本地 Web 工作台](web-workbench.md) | verified_once | 生产静态托管、桌面/移动任务审批与 Action 授权/执行/验证流程 |
| [受控公开来源研究简报](research-brief.md) | verified_once | 显式 HTTPS 来源、Host 快照、DSH 引用覆盖及一次 MiniMax 真实只读样本 |
| [结构化会议准备简报](meeting-brief.md) | verified_once | 显式会议上下文、无 Host 工具 profile、六段结构校验及一次 MiniMax 虚构样本 |
| [可控个人记忆](personal-memory.md) | verified_once | SQLite 生命周期、owner/用途/分级过滤、Workbench 控制及一次 MiniMax 非敏感记忆样本 |
| [单机任务重启恢复](task-recovery.md) | verified_once | stale PID、queued 续调度、interrupted 新 Task 重试、Action reconciling 与桌面/移动流程 |
| [设计文档发布与读回](design-publication.md) | verified_once | v0.2 系列及 DSH 六图专题、正文/源码读回、父节点与逐图预览 |
| [Agent 版本管理](version-control.md) | verified_once | main 初始提交、暂存边界与提交后核验 |
| [真实任务验收](live-acceptance.md) | planned | 尚未通过个人助手执行真实外部服务操作 |
| [升级、停止与回滚](upgrade-rollback.md) | planned | 当前没有完整自动发布和迁移回滚控制器 |

`planned` 是待执行规程；`candidate` 是有部分证据的步骤；`verified_once` 是指定环境成功过一次；`verified` 要求满足 [经验晋级规则](../design/06-evolution.md)；失效时标 `deprecated` 或降级。禁止将 planned SOP 作为执行成功保证。

所有 SOP 均须记录前置、动作、预期观察、失败分支、停止和清理。成功后追加证据；依赖、权限、接口或平台改变时重新判断适用性。
