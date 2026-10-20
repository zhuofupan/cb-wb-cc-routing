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

Desktop 的 defaultModelEffort=max 只覆盖默认模型，不能证明切到 MiniMax、GLM 后界面也选中 Max。Cowork 可在账户 cowork_account_settings.json 的 __model_selector_state.cowork.thinking_by_model 中逐模型保存 type=effort_and_mode、effort=max、mode=auto。若要读取这些保存值，profile 的 alwaysStartWithDefaultModel 应为 false；这也会让后续新会话记住用户手动切换的模型。本轮用户接受了该行为，初始选择设回 DS。不要改签名模型目录；Code 按下一段单独配置。

安全日志只记录 event=upstream_effort、model、effort、mode，不输出 key。HTTP 200、模型自述“正在深度思考”都不是模型投入最高算力的证明。

Code 新建页需另行验收。2026-10-21 手动操作记录显示选中 max，但账户状态仍保存前一步 xhigh，不能把账户 JSON 中手写 max 当作 Code 界面已生效的证据。Claude 官方提供 Windows Desktop 用户级策略 `HKCU\SOFTWARE\Policies\Claude` 下 REG_SZ `effortLevel=max`，用于每次新建 Code 会话重新应用默认档，不影响 Cowork。运行 `powershell -File scripts/set-claude-code-effort.ps1`；Windows 拒绝写入时，在同一用户的管理员 PowerShell 重跑。脚本先将旧值及类型备份到本机 Claude-3p/code-effort-policy-backups，再写入并回读；支持 `-WhatIf` 无修改预览。完全退出并重开 Claude 后检查新建页和切换模型的选中值。策略可能影响此用户的其他 Desktop Code 供应商。部署已回读为 max，随后用户确认当前功能测试完成。来源：[官方 Desktop 策略说明](https://support.claude.com/en/articles/12622667-enterprise-configuration-for-claude-desktop)。

2026-10-21：当前 Codex 桌面源码的 enabledReasoningEfforts 默认不含 max；模型只提供 max 会被过滤为空，界面可能回退为中。cb/wb 默认三款目录使用客户端 xhigh（极高），网关 highest 策略仍发送上游 max；自动目录同步也执行此映射。这是适配器预设映射，不代表两家厂商同名字串的计算量相同。DeepSeek 官方直连目录保持 max，不经此映射。配置后仍应核对实际界面。
