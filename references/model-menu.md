# Claude Desktop 的模型菜单到底由什么决定

## 结论（上一版判断错了，已更正）

**不是** `model-catalog\published.json`。

那套东西是：

```
https://downloads.claude.ai/model-catalog/v1/catalog.json
  → %LOCALAPPDATA%\Claude-3p\model-catalog\published.json
```

带 `RSASSA-PKCS1-v1_5-SHA512` 签名 + `publicKeySha256`，每次启动按 version 自动刷新
（实测刷到 version 2637）。本地改写无效：先 `resolved {source:'seed'}`，紧接着
`refresh {status:'accepted'}` 把文件覆盖回官方版本 —— 45 处改写全部被冲掉。

**真正的开关**是 cc-switch 写的 3P profile：

```
%LOCALAPPDATA%\Claude-3p\configLibrary\00000000-0000-4000-8000-000000157210.json
  → "inferenceModels": [...]
```

`_meta.json` 的 `appliedId` 指向这个固定 profile（`PROFILE_ID` 尾号 **157210**）。

## `inferenceModels` 的写法

两种都行：

```json
"inferenceModels": ["claude-opus-5", "claude-haiku-4-5"]
```

```json
"inferenceModels": [
  {"name": "claude-opus-5", "labelOverride": "Hy4 preview"}
]
```

- **`labelOverride` 就是菜单上显示的文字**。
- **条目数不限于 4**，只要 `name` 是 `claude-{opus,sonnet,haiku,fable}-*` 形状。
- ⚠️ **别加 `supports1m: true`** —— 会让每一项额外渲染一条「1M context window」变体行，
  菜单直接翻倍。`name` + `labelOverride` 刚好一条。

## cc-switch 4.0.15 的限制

- **没有**模型映射功能：`claude_desktop_model_routes` / `label_override` / `supports_1m`
  在 `cc-switch.exe` 里 **0 命中**（只有 `inferenceModels` 命中 2 处）。
- 每次启动 attach 都把 **4 个字符串硬编码**重写一遍，也不读 provider env 里的
  `ANTHROPIC_DEFAULT_*_MODEL`。

### 持久化办法：profile 设为只读

```powershell
attrib +R "$env:LOCALAPPDATA\Claude-3p\configLibrary\00000000-0000-4000-8000-000000157210.json"
```

cc-switch 写入失败但**照常启动**、**15721 照常监听**，profile 九项保持不变。

**代价**：cc-switch 以后想在 UI 里「应用」这个 provider 会报写入失败 ——
要么接受，要么改回可写让它重写（然后菜单退回 4 项）。二选一。

## 两个不要踩的点

官方 model-catalog 里菜单项真实 id 分在 `surfaces.{cc, ccd, ccr, chat, cowork}` 下
（`claude-opus-5-5`、`claude-sonnet-5-5` 等）。标签（Opus 5.5 / Sonnet 5.5）是
Anthropic 定义的，**本地改不了**。能改的只有每档背后接哪个上游模型。

## 当前 9 项映射

| route id | 菜单显示 | 上游 |
| --- | --- | --- |
| claude-opus-5 | Hy4 preview | `hy4-preview` |
| claude-opus-5-5 | Step-5-Preview | `step-5-preview` |
| claude-sonnet-5 | Deepseek-V4.1-Flash | `deepseek-v4.1-flash` |
| claude-sonnet-5-5 | Deepseek-V4-Pro | `deepseek-v4-pro` |
| claude-haiku-5 | GLM-5.3 | `glm-5.3` |
| claude-haiku-5-5 | Kimi-K3 | `kimi-k3-2` |
| claude-haiku-4-5 | MiniMax-M3 | `minimax-m3-pay` |
| claude-fable-5 | MiMo-V2.6-Pro | `mimo-v2.6-pro` |
| claude-fable-5-1 | Space-Bunny | `space-bunny` |

route id → 上游模型的映射做在适配器的 `exactRoutes`（**精确匹配，先于任何正则**，
否则 `opus` 会把 `claude-opus-5-5` 一起吃掉）。

9 个 id 逐个测过路由，全部命中正确上游。

⚠️ `mimo-v2.6-pro` 早期记录过带 `Read` 工具拒答（自称「小米的 AI 助手 MiMo」），
**但后续复测未能复现，四场景全部正常**。可以再试。详见 [limits.md](limits.md)。

脚本：`scripts/setup-claude-model-routes.py`（幂等，会重写 profile 九项）。

## 注意 legacy 写法

早期版本试着把 `supports1m` 也写进去（脚本注释里还留着 `claude_desktop_model_routes`
的说法），这是**错的**：那么写 cc-switch 反正也不读，而 profile 里带 `supports1m`
会让菜单翻倍。以本文件的结论为准。
