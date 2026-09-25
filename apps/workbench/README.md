# lumi Workbench

本地 Web 任务工作台。它只调用 lumi Gateway，不直接连接 DSH、数据库或外部工具。

## 开发

先在一个终端启动 Gateway：

```bash
PA_EXECUTOR=mock pnpm dev
```

再在另一个终端启动 Vite：

```bash
pnpm dev:web
```

打开 `http://127.0.0.1:4311`。Vite 将 `/health` 和 `/v1` 代理到 `http://127.0.0.1:4310`。

## 生产构建

```bash
pnpm build
pnpm start
```

完整构建把页面输出到 `dist/workbench`，Gateway 在目录存在时通过 `http://127.0.0.1:4310/` 同源提供页面和哈希资源。

## 当前边界

- 当前提交 API 会等待任务完成；页面预先生成 task ID，并在请求期间轮询任务状态。
- 当前审批是任务级审批，不是 SPEC-0001 设计的参数级 Action Authorization。
- 页面没有产品级多轮 Conversation、流式 token 或远程身份认证；Gateway 只应监听 loopback。
