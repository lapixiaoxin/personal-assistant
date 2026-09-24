# 操作知识索引

| SOP | 状态 | 已证明的范围 |
| --- | --- | --- |
| [本机检查与 mock CLI](local-validation.md) | verified_once | 本机 Node22/pnpm10、现有检查；独立进程间任务/审批持久化 |
| [设计文档发布与读回](design-publication.md) | verified_once | 本次 11 篇飞书文档、导航、父子节点与画板预览 |
| [Agent 版本管理](version-control.md) | verified_once | main 初始提交、暂存边界与提交后核验 |
| [真实任务验收](live-acceptance.md) | planned | 尚未通过个人助手执行真实外部服务操作 |
| [升级、停止与回滚](upgrade-rollback.md) | planned | 当前没有完整自动发布和迁移回滚控制器 |

`planned` 是待执行规程；`candidate` 是有部分证据的步骤；`verified_once` 是指定环境成功过一次；`verified` 要求满足 [经验晋级规则](../design/06-evolution.md)；失效时标 `deprecated` 或降级。禁止将 planned SOP 作为执行成功保证。

所有 SOP 均须记录前置、动作、预期观察、失败分支、停止和清理。成功后追加证据；依赖、权限、接口或平台改变时重新判断适用性。
