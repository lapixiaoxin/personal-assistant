# 测试约定

- 模块测试放 `<module>/tests/`，通过 `../src/` 导入。
- 跨模块 DSH 契约放根 `tests/contract/`。
- 测试和 fixture 不进入 `src/`，不由生产 exports 暴露。
- 运行数据使用临时目录或明确的 `data/*-smoke`，结束后精确清理。

当前完整门禁：

```bash
pnpm check
pnpm test:dsh:bundle
python3 scripts/check-docs.py
```

`pnpm test:dsh` 启动真实 DSH SDK 子进程和官方 mock 模型，覆盖多轮、恢复、取消、工具拒绝和崩溃不重放；它不是云模型或真实飞书验收。

`pnpm check:architecture` 检查生产依赖环、跨层 SDK、未声明内部依赖、跨 package 相对 import 和 `src` 测试回流。
