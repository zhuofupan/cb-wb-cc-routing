# 默认思考档与最高档

现代 Claude Code / Desktop 可以发送 output_config.effort；codec 转为 reasoning_effort。旧版“Claude 根本不发”的结论不再成立。Codex 的 reasoning.effort 亦转换为同一上游字段。

配置有两种不同策略：

```json
{
  "effortDefault": "max",
  "effortPolicy": "highest",
  "effortMaxByModel": {}
}
```

- 只用 effortDefault：仅填缺失值，保留用户显式低档。
- 显式 highest：强制请求 max，再按模型目录封顶；会覆盖低档选择。本次用户要求默认最强，因此模板启用此策略；要自由降档需删除它。

Hy4 与 Step-5 已从当前选择中移除，历史目录仅声明 high。新 MiniMax-M3.1-Flash 明确列出 low/medium/high/xhigh/max，默认 max。官方 DeepSeek 支持 low/high/max。其余缺少完整档位清单的模型，最多能确认 max 请求获接受，不能证明内部计算量。

Desktop 新会话默认档可由 profile 的 defaultModelEffort=max 设置；切模型后可能恢复自身保存档位。Cowork 旧 M3 曾恢复 High，手动可选 Max；适配器 highest 策略的实际请求已验证 max。UI 显示与上游日志要分别记录。

安全日志只记录 event=upstream_effort、model、effort、mode，不输出 key。HTTP 200、模型自述“正在深度思考”都不是模型投入最高算力的证明。

2026-10-21：当前 Codex 桌面源码的 enabledReasoningEfforts 默认不含 max；模型只提供 max 会被过滤为空，界面可能回退为中。cb/wb 剩余五款目录改用客户端 xhigh（极高），网关 highest 策略仍发送上游 max；自动目录同步也执行此映射。这是适配器预设映射，不代表两家厂商同名字串的计算量相同。DeepSeek 官方直连目录保持 max，不经此映射。重开 Codex 后仍需视觉验收。
