# lumi 文档导航

当前主线：DSH 接管通用核心，lumi 维护个人资产、插件和通道。飞书入口代码已验证，专用 Bot 真实启用待完成；当前不接具体外部 Agent。

| 任务 | 入口 |
| --- | --- |
| 接手当前工程 | [工程事实](current-state.md)、[AGENTS](../AGENTS.md) |
| 理解当前职责与依赖 | [系统架构](design/02-architecture.md)、[ADR-007](adr/0007-dsh-server-and-channel-boundary.md) |
| 启动服务器与配置飞书 | [部署 SOP](runbooks/server-feishu.md)、[SPEC-0016](../specs/0016-dsh-server-feishu/spec.md)、[验证证据](../specs/0016-dsh-server-feishu/evidence.md) |
| 决定下一步 | [发展路线](design/07-roadmap.md) |
| 升级 DSH | [上游策略](upstream-strategy.md)、[bundle SOP](runbooks/dsh-native-bundle.md) |
| 理解个人资产边界 | [ADR-006](adr/0006-portable-personalization-and-surfaces.md)、[SPEC-0015](../specs/0015-portable-personalization/spec.md)、[个人模型](design/04-personal-model.md) |
| 维护或退役旧 MVP | [兼容与退役](runbooks/legacy-retirement.md)、[Workbench SOP](runbooks/web-workbench.md)、[旧 MVP 验收](evidence/2026-09-25-mvp-acceptance.md) |
| 新增能力或改变权限 | [协议](design/03-protocols.md)、[安全](design/05-safety.md)、[SDD](design/08-sdd.md)、[模板](templates/README.md) |
| 查看操作与验证 | [SOP 索引](runbooks/README.md)、[测试约定](../tests/README.md)、[本机数据](../data/README.md) |
| 理解历史取舍 | [ADR 索引](adr/README.md)、[长期总纲](design/00-overview.md)、[进化与发布原则](design/06-evolution.md)、[评测](design/09-evaluation.md) |
| 查看调研依据 | [Personal Agent 市场观察](research/2026-10-13-personal-agent-landscape-and-lumi-direction.md)、[DSH SDK/扩展核验](research/2026-10-13-dsh-sdk-plugin-feasibility.md) |
| 查看历史架构图与发布 | [v0.3 六图](design/10-dsh-centered-architecture.md)、[原生定制候选](design/11-dsh-native-customization.md)、[飞书发布索引](publication.md) |

历史调研、方案和证据按原日期保留；其版本描述不覆盖当前工程事实。DSH Web、自己的 App 和未来设备都是可替换入口，个人资产不依附于入口；目前只建设飞书文本入口和基础接线。

设计源在 Git，飞书为审阅投影。本次代码与文档变化尚未重新发布到飞书；发布与部署须按具体授权处理。验证记录追加，不覆盖旧失败或把 `Implemented` 当作 `Enabled`。
