# 上下文：声明、客户端规划与真实容量

1M 通常约一百万 token，不等于一百万汉字。腾讯当前多数所选模型为 1000000，Hy4 为 960000；DeepSeek 官方为 1048576。MiniMax-M3.1-Flash 为 1000000，旧 M3 为 512000，不可混用。

## Code 模式

当前 SDK 支持逐别名 `modelSettings`。在用户 `~/.claude/settings.json` 合并（不要覆盖其他配置）：

```json
{
  "modelSettings": {
    "claude-opus-5": {"autoCompactWindow": 960000, "maxEffortLevel": "high"},
    "claude-opus-4-8": {"autoCompactWindow": 1000000, "maxEffortLevel": "max"}
  }
}
```

Code 实际界面曾验证 Hy4 显示 960k、旧 M3 经别名修正后显示 512k；当前 M3.1-Flash 配置更新为 1M，代理路由与模型发现已验证。没有做满窗口负载。当前 autoCompactWindow 配置上限为 1000000，因此不宣称使用了 DeepSeek 官方全部 1048576。

早期 CLI 用全局 `CLAUDE_CODE_MAX_CONTEXT_TOKENS` 解决未知模型回退 200k，但全局值不能当作逐模型安全配置。不要因一个模型支持 1M 就给所有模型填同一数值；不要关闭自动压缩来制造“满窗口”。

## Cowork 模式

本机 Windows host harness 使用每会话隔离的 `.claude` 配置目录，不等同于 Code 的全局目录。曾尝试同步模型设置，文件写入成功但不能据此宣称加载、压缩策略已通过；未把这个试验同步器发布为默认修复。

旧 MiniMax-M3 会话 audit 曾报告 contextWindow=1000000，尽管模型目录为 512000。该字段只是 SDK 报告值，不能单凭它证明上游容量、自动压缩阈值或满载成功；标签也不构成证据。Cowork 前端实际返回 Unknown skill: autocompact，不能照搬 CLI 命令。

## 验证口径

分别保存：目录声明、最终配置、Code 显示、Cowork 会话结果、实际长请求结果。不要把 CLI JSON 当成 Desktop 测试，也不要把一次短请求的 1M 报告称为满 1M 负载验证。输入、输出、工具结果和图片占用都应留在预算内。

Codex 的模型目录及 effective_context_window_percent 是另一套规划；保留客户端预留，不为“最大”盲目改为 100%。
