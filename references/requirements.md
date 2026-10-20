# 运行依赖

| 使用方式 | 认证 | 必需服务 |
|---|---|---|
| DeepSeek 官方 Desktop | 官方 API key | CC Switch；推理直达官方 Anthropic 兼容端点 |
| CodeBuddy Desktop | 用户 ck API key | CC Switch、18792；不依赖 WorkBuddy 或 DSH |
| WorkBuddy Desktop | WorkBuddy 自己的登录态、本地随机 secret | CC Switch、18791、可用 WorkBuddy 安装及 DSH 源码 |
| 可选 WorkBuddy 原生工具 MCP | WorkBuddy 登录态、相应额度 | stdio MCP、WorkBuddy 认证模块；与聊天模型厂商分开 |

需要 Node 24、Python 3、Windows PowerShell。CodeBuddy 模式按需不加载 WorkBuddy TypeScript 认证模块，离线回归可在没有 DSH 的环境运行。WorkBuddy 登录态解密/刷新依赖其可用安装和环境，应用升级后要复核认证。

网关监听 loopback。避免系统代理接管本机请求；检查 18791/18792 /health，再检查 CC Switch 15721 和实际 proxy_route。启动命令与持久运行不同，GUI/任务生命周期可影响子进程；不要只看“启动成功”就判断常驻。
