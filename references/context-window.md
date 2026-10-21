# 上下文：声明、客户端规划与真实容量

1M 通常约一百万 token，不等于一百万汉字。腾讯当前多数所选模型为 1000000，Hy4 为 960000；DeepSeek 官方为 1048576。MiniMax-M3.1-Flash 为 1000000，旧 M3 为 512000，不可混用。

## Claude Desktop Code 模式

当前 Desktop 优化保留逐模型 maxEffortLevel 和用户保存的努力级别，移除 CB/WB 三个别名上的 autoCompactWindow 固定值，交给安装版本的原生策略。无需为每个模型手写 308750、840000 等压缩阈值。真实上下文容量与自动压缩阈值是不同概念。

全局配置、CC Switch Desktop 卡片和会话隔离副本统一使用 scripts/optimize-claude-desktop.py 清理。该脚本不覆盖账号记录的模型选择、逐模式思考档位、无关模型设置或权限。应用环境中的强制 effort 覆盖会被移除，但受保护的 Windows 初始默认策略可能仍然存在。

历史 CLI 注册脚本仍有单独的参考预算函数；它不代表当前 Desktop 的默认策略。不要用全局 CLAUDE_CODE_MAX_CONTEXT_TOKENS 为所有模型声明相同容量，也不要关闭压缩制造“满窗口”。

## Cowork 模式

本机 Windows host harness 使用每会话隔离的 `.claude` 配置目录，不等同于 Code 的全局目录。当前清理器会处理已有的隔离 settings.json 副本；写入成功仍不能据此宣称运行中的会话已重新加载，需重启客户端后验收。

升级 `~/.claude/settings.json` 不会更新已经存在的会话隔离副本：当前 `%LOCALAPPDATA%\Claude-3p\local-agent-mode-sessions\*\*\.claude\settings.json` 仍可能保留 1M 旧值。本轮已同时清理已存在的副本；只改全局目录会导致旧 Cowork 会话继续保留旧值。

旧 MiniMax-M3 会话 audit 曾报告 contextWindow=1000000，尽管模型目录为 512000。该字段只是 SDK 报告值，不能单凭它证明上游容量、自动压缩阈值或满载成功；标签也不构成证据。Cowork 前端实际返回 Unknown skill: autocompact，不能照搬 CLI 命令。

## 验证口径

分别保存：目录声明、最终配置、Code 显示、Cowork 会话结果、实际长请求结果。不要把 CLI JSON 当成 Desktop 测试，也不要把一次短请求的 1M 报告称为满 1M 负载验证。输入、输出、工具结果和图片占用都应留在预算内。

Codex 的模型目录及 effective_context_window_percent 是另一套规划；保留客户端预留，不为“最大”盲目改为 100%。

## 输出预算（2026-10-21 修正）

输入窗口和单次输出上限是两件事。上游账号目录给出逐模型 `maxOutputTokens`：DeepSeek-V4.1-Flash 128000、MiniMax-M3.1-Flash 128000、GLM-5.3-FlashX 131072。

适配器规则：

- Responses 请求缺 `max_output_tokens` 时，用模型输出上限，不再回退 16384。
- Anthropic 请求缺 `max_tokens` 时，用模型输出上限，不再回退 8192。
- 客户端显式值仍优先，但会被模型上限和「窗口 − 估算输入 − 2048 预留」两者中的较小值收敛。
- Codex 目录的 `auto_compact_token_limit` 当前为 null，交给安装的 Codex 版本采用模型默认压缩策略；Claude Desktop 的受管理别名也不再写入固定 autoCompactWindow。网关不截断历史或自行总结对话。
- `context_window` 与 `max_context_window` 保持模型声明的 1M，不因输出预留而缩小。`max_context_window` 是窗口上限元数据，不是「硬输入天花板」；会话实际窗口由 `context_window × effective_context_window_percent` 得出（当前 1M × 95% = 950k），压缩阈值低于它即可。

判断“上下文到顶”前先看两件事：当前请求的 `input_tokens` 是否接近窗口，以及失败原因是否为 `max_output_tokens`。后者是输出预算不足，不应误判为 1M 窗口用尽。

## Codex 原生预算优化（2026-10-21）

Codex 的显式压缩数值覆盖已移除，保留逐模型真实窗口与 95% 可用窗口声明。Responses 和 Anthropic 共用输入估算，包含完整工具 JSON、中文 UTF-8 字节与图片预留；该估算只约束输出预算，不能宣称是供应商精确 tokenizer。
