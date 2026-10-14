# 运行规程

| 规程 | 状态 |
| --- | --- |
| [部署资产与私有实例](../../deploy/README.md) | 模板、配置权威、新部署/恢复/迁移边界已定义 |
| [飞书服务器](server-feishu.md) | macOS 前台与真实 Bot `verified_once`；Linux systemd candidate |
| [个人上下文 bundle](dsh-native-bundle.md) | 隔离打包、安装与 Web 启动 `verified_once` |
| [版本管理](version-control.md) | main 提交与普通 push `verified_once` |
| [DSH 升级](../upstream-strategy.md) | 当前 release 固定；每日新鲜度检查已配置 |

SOP 只保留当前可执行路径。一次成功标 `verified_once`；环境、依赖或权限变化后重新验证。历史规程通过 Git 查看，不作为当前操作保证。
