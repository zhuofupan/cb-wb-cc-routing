# 默认思考档与最高档

现代 Claude Code / Desktop 可以发送 output_config.effort；codec 转为 reasoning_effort。旧版“Claude 根本不发”的结论不再成立。Codex 的 reasoning.effort 亦转换为同一上游字段。

配置有三种策略（当前默认是 client 策略）：

```json
{
  "effortDefault": "high",
  "effortPolicy": "client",
  "effortMaxByModel": {}
}
```

- 只用 effortDefault：仅填缺失值，保留用户显式档位。
- 显式 highest：强制请求 max，再按模型目录封顶；会覆盖低档选择。只在确实要“永远最强”时使用。
- client（当前默认）：客户端选哪档就发哪档；没发时沿用同一客户端上次对该模型的选择；从未选过才用上游 defaultEffort。
- effortMaxByModel 是速度上限，不是默认值：会把高于上限的选择压到上限，不会抬高低于上限的选择。

2026-10-21 账号目录实测：DeepSeek-V4.1-Flash 与 GLM-5.3-FlashX 只声明 low/high/max，MiniMax-M3.1-Flash 声明 low/medium/high/xhigh/max。两端都显示五档，因此 DeepSeek/GLM 的 medium 映射到 low、xhigh 映射到 high（平局取更省的一档），max 原样发送。映射写在 scripts/effort-map.mjs，Codex 目录和 Claude 选择器说明都由它生成。请求被接受不代表供应商内部执行了同等计算量。

Desktop 的 defaultModelEffort=max 只覆盖默认模型，不能证明切到 MiniMax、GLM 后界面也选中 Max。Cowork 可在账户 cowork_account_settings.json 的 __model_selector_state.cowork.thinking_by_model 中逐模型保存 type=effort_and_mode、effort=max、mode=auto。若要读取这些保存值，profile 的 alwaysStartWithDefaultModel 应为 false；这也会让后续新会话记住用户手动切换的模型。profile 的 alwaysStartWithDefaultModel=false 会记住用户手动切换的模型。不要改签名模型目录；Code 按下一段单独配置。

安全日志只记录 event=upstream_effort、model、effort、mode，不输出 key。HTTP 200、模型自述“正在深度思考”都不是模型投入最高算力的证明。

Code 新建页的默认档由 Windows 用户级策略 `HKCU\SOFTWARE\Policies\Claude` 的 `effortLevel` 决定；手动在界面选过档后，选择会写入账户状态并跨会话保留。策略仍可用 `scripts/set-claude-code-effort.ps1` 设置（默认 high），但它只影响尚未手动选择的新会话，不会覆盖用户的选择。要允许自由降档，不要再把策略设成 max；手写账户 JSON 不能证明界面已生效，仍以实际界面为准。

2026-10-21 本机最新 models_cache.json 的官方模板已声明 low/medium/high/xhigh/max/ultra，不能沿用旧版本“界面不支持 max”的结论。cb/wb 仅声明其适配器能够映射的五档，不虚构 ultra。实际选择器显示仍需桌面验收。

档位记忆存于各自设置文件旁的 `<settings>.effort.json`，按客户端和上游模型隔离，重启网关后继续使用。文件只含客户端、模型、档位；显式选择始终优先于记忆，速度上限仍生效。模型目录的 defaultEffort 与最高支持档位分开，目录刷新不会把默认值恢复为 max。Codex 卡片新生成的默认档为 high；不覆盖已有聊天显式选择。

Codex 模型目录保留官方模板的 model_messages/base_instructions，由客户端组装指令；不再替换成一句通用编程提示。工具、插件与项目规则仍由 Codex 管理。此项不代表第三方模型具备 OpenAI 模型的同等能力。

部署记录：2026-10-21 原生接入优化已安装到 CB/WB 两个集成目录，网关空闲重启并完成真实 Responses 工具搜索往返与 Codex CLI 终端调用。未更改当前模型、聊天档位、CC Switch 数据库或登录凭证。模型目录需由桌面客户端下次启动重新加载。
