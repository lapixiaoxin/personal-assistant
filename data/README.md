# 本机数据

除本文件外，`data/` 全部忽略，不属于源码。

| 路径 | 类型 | 规则 |
| --- | --- | --- |
| `server/` | 当前权威数据 | 运行时禁止删除；备份整个目录并保留权限 |
| `legacy-mvp-*/` | 旧版只读归档 | 当前服务不加载；恢复旧代码后才能读写 |
| `tooling/node-v22.19.0/bin/node` | 本机 Node 22 runtime | 可再生；pnpm 脚本会优先使用，目标机可改用 PATH 中的兼容 Node |
| 其他 smoke/cache/evidence | 可再生 | 验证完成且事实已入 Git 后精确删除 |

`server/` 可能包含飞书 Secret、模型选择、自定义运行覆盖、消息、回执、DSH Session 和个人上下文，均按私人数据处理。不要提交、打印或上传。常用且不含凭据的 provider 定义属于 `profiles/providers/`，不应放入这里。

删除或迁移前：

1. 检查当前服务 PID 和未决 `interrupted/unknown`。
2. 正常停止服务，避免只复制 SQLite 主文件而遗漏 WAL。
3. 记录匹配 commit 和 DSH 版本。
4. 使用精确路径，不对整个 `data/` 做通配删除。

被 Git 忽略不表示可以安全删除。
