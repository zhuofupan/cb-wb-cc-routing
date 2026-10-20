# Desktop 模型菜单

2026-10-20：CC Switch 4.0.15 实测支持 `meta.claudeDesktopMode="proxy"` 与 **camelCase** `claudeDesktopModelRoutes`。

```json
{
  "claudeDesktopMode": "proxy",
  "claudeDesktopModelRoutes": {
    "claude-haiku-5": {
      "model": "minimax-m3.1-flash",
      "labelOverride": "cb·MiniMax-M3.1-Flash (0.08x) · 1M",
      "supports1m": false
    }
  }
}
```

CC Switch 把别名、标签写到 `%LOCALAPPDATA%/Claude-3p/configLibrary/` 的 profile；代理将 Claude 别名映射为真实模型 ID。`labelOverride` 控制显示名。WB 使用 `wb·`，CB 使用 `cb·`，全部带目录声明的窗口后缀。每厂商五模型，一个供应商卡片；不为每模型创建供应商。

完整映射以 [desktop_models.py](../scripts/desktop_models.py) 为准。当前五个原生别名按字典序分配给 DeepSeek、MiniMax、GLM FlashX、GLM、Kimi，兼容本机 profile 按别名排序的行为。别名只用于路由，不代表真实 Claude 型号。旧 MiniMax 的 `claude-haiku-4-5` 曾触发 200k 上限，当前不使用该旧别名；五款上游目录均声明 1M。

不要编辑签名 model-catalog，也不要把 profile 设只读。此前按 snake_case 搜索 exe 后得出“不支持映射”的结论错误；只读曾实际导致供应商切换写入失败。保留 profile 可写，让 CC Switch 负责生成。

`supports1m:true` 可能多渲染一条 1M 变体。当前只保留一个菜单项，使用 false；它不表示关闭上游真实 1M 能力，也不能单凭该字段证明窗口已生效。Code 与 Cowork 需分开验收，见 [上下文](context-window.md)。
