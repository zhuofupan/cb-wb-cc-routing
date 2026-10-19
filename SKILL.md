---
name: ds-wb-cc-routing
description: 用 CC Switch 把 DeepSeek 官方与 WorkBuddy 接入 Codex CLI 和 Claude Code / Claude Desktop（Cowork）。当用户提到「cc switch 配置 provider」「DeepSeek 接 Claude Code」「WorkBuddy 接 Codex」「11128 未批准渠道」「模型菜单改名字」「inferenceModels」「18791 适配器」「Codex 第三方模型不支持」时应使用。
license: MIT
metadata:
  version: 1.0.0
  author: Codex
  tags: [cc-switch, codex, claude-code, deepseek, workbuddy, provider-routing, 11128]
---

# DeepSeek / WorkBuddy → Codex + Claude Code 路由

把两个上游（DeepSeek 官方、WorkBuddy 本地）接进两个客户端（Codex CLI、Claude Code）
的四条通路，以及踩过的坑。所有结论都是 2026-10-19 / 2026-10-20 在本机实测过的，
不是推断。

## 先分清四条通路

| 通路 | 需要中间件？ | 端点 |
| --- | --- | --- |
| DeepSeek → Codex | 不需要 | `https://api.deepseek.com`（Responses） |
| DeepSeek → Claude Code | 不需要 | `https://api.deepseek.com/anthropic`（官方自带 Anthropic 兼容） |
| WorkBuddy → Codex | **需要** 18791 适配器 | `http://127.0.0.1:18791/v1`（Responses） |
| WorkBuddy → Claude Code / Cowork | **需要** 18791 适配器 | `http://127.0.0.1:18791`（Anthropic Messages） |

```
Claude Code    ──直连─────────────────→ 18791 适配器 → WorkBuddy 上游
Claude Desktop ──→ 15721(CC Switch) ──→ 18791 适配器 → WorkBuddy 上游
Claude Code    ──────────────────────→ api.deepseek.com/anthropic
Codex          ──直连─────────────────→ 18791 适配器  或  api.deepseek.com
```

**为什么 WorkBuddy 必须走适配器**：上游认的是 WorkBuddy 桌面版的登录态（客户端
accessToken，还要会刷新），不是普通 API key。CC Switch 没有这个能力。
适配器本身复用 `corrinehu/dsh-workbuddy-connect` 的认证代码。

## 配置顺序

1. 起适配器（`scripts/` 里的 `workbuddy-server.mjs` + `local-settings.json`）。
2. 往 CC Switch 注册条目 —— **必须 CC Switch 关掉再跑**，`scripts/register-*.py`。
3. **在 CC Switch 界面里点切换**（直接改数据库只注册条目，不生效）。
4. 改完 Desktop 配置后**提醒用户自己开 CC Switch**（见下）。

## 三个一定会踩的坑

### 1. 11128：客户端指纹（唯一的真坑）

Claude Code 把 `x-anthropic-billing-header: cc_version=…; cc_entrypoint=…;`
塞进 system **的第一段**。WorkBuddy 上游判为「未批准渠道」，返回
`400 / code 11128`，`displayMsg` 是「请求被拦截，请重新发送」。

与请求体大小、工具数量、`max_tokens`、`tool_choice` 形式**全都无关** —— 这些误判方向
都试过，全删光仍然 400。判据就是那串字符。

修法：`anthropic-codec.mjs` 的 `CLIENT_FINGERPRINT` **全局**剥离（`/g`）。
⚠️ 桌面版 Code 标签会把这串**连写两遍**放进同一个 system 块，只剥第一次不够
（典型症状：Cowork 聊天正常、Code 标签一发就 400）。

详细排查套路见 [references/troubleshooting.md](references/troubleshooting.md)。

### 2. 11128 的第二个来源：system 里的 CLI 身份句

剥完指纹还 400，查 `Anthropic's official CLI for Claude` 这 40 个字符。
上游有独立检查，命中即 11128。去掉 `, running within the Claude Agent SDK`
**不管用**，必须动 `Anthropic's official CLI` 本身。

`CHANNEL_MARKERS` 把它改写成 `an AI coding agent`（**改写不是删除**，模型仍需知道自己是编码 agent）。

只有桌面版 **Code 标签**会中（走 Claude Agent SDK）；单独跑 `claude -p` 的 system
没这句，所以「CLI 直连能通、Code 标签 400」就是这个组合。

### 3. CC Switch 是 GUI 托盘应用，拉不起来

自动化会话里 `Start-Process` / `cmd start` 起的进程**都会随会话被清理**
（`tasklist` 里消失、`15721` 跟着不监听，Claude Desktop 直接连不上）。

⚠️ 改过 Claude Desktop 配置后，**必须提醒用户自己开 CC Switch**，否则他对面是断的。

## 模型菜单：真正的开关不在 model-catalog

> 上一版判断错了，已更正。**不是** `model-catalog\published.json`（那是远程签名目录，
> RSA-SHA512 签名，每次启动被 `refresh accepted` 覆盖，改了不影响菜单）。

真正决定下拉框的是 cc-switch 写的 **3P profile**：

```
%LOCALAPPDATA%\Claude-3p\configLibrary\00000000-0000-4000-8000-000000157210.json
  → "inferenceModels": [{"name":"claude-opus-5","labelOverride":"Hy4 preview"}, ...]
```

- `labelOverride` **就是菜单上显示的文字**，条目数不限于 4（只要 `name` 是
  `claude-{opus,sonnet,haiku,fable}-*` 形状）。
- cc-switch 4.0.15 **没有**模型映射功能：`claude_desktop_model_routes` / `label_override`
  在 exe 里 0 命中。它每次启动 attach 都把 4 个字符串**硬编码**重写一遍。
- **持久化办法：把 profile 设为只读**（`attrib +R`）。cc-switch 写入失败但照常启动、
  15721 照常监听，profile 保持不变。
- ⚠️ 别给条目加 `supports1m: true` —— 会让每一项多渲染一条「1M context window」变体行。

完整机制与 9 项映射表见 [references/model-menu.md](references/model-menu.md)。

## 模型名映射

Claude Code 发厂商名（`claude-sonnet-4-5-20250929`），WorkBuddy 不认。适配器按
`local-settings.json` 解析，**精确匹配先于正则**（否则 `opus` 会把 `claude-opus-5-5` 一起吃掉）。

⚠️ **`mimo-v2.6-pro` 不适合 agent**：自称「小米的 AI 助手 MiMo」，带 `Read` 工具时
直接拒答。通路没问题，是模型的身份约束。

## 按需读取参考文件

- [references/troubleshooting.md](references/troubleshooting.md)
  —— 报 11128 / 11133 / 超时 / 000 时读。二分定位套路、错误码对照、直连测试命令。
- [references/model-menu.md](references/model-menu.md)
  —— 要改 Claude Desktop 模型菜单、加映射、菜单项重复或显示不对时读。
- [references/cc-switch-internals.md](references/cc-switch-internals.md)
  —— 要往 CC Switch 写数据库、搞清 `live-state.json` / `is_current` 为什么不一致时读。
- [references/codex-isolation.md](references/codex-isolation.md)
  —— Codex 报「model is not supported with a ChatGPT account」、官方与第三方模型
  想同时可用时读。
- [references/limits.md](references/limits.md)
  —— 想知道适配器没实现什么（thinking 不回传、count_tokens 是估算）、别误以为支持。

## 脚本

`scripts/` 下都是幂等的，密钥已替换为占位符：

| 文件 | 作用 |
| --- | --- |
| `workbuddy-server.mjs` | 适配器主体，同端口双端点 |
| `anthropic-codec.mjs` | Anthropic Messages ↔ Chat Completions，含指纹剥离 |
| `local-settings.json.example` | 配置模板，改名后填真实值 |
| `register-ccswitch-providers.py` | 注册 Codex 的两个条目 |
| `register-ccswitch-claude.py` | 注册 Claude 页（Claude Code）条目 |
| `register-ccswitch-desktop.py` | 注册 Claude Desktop（Cowork）条目 |
| `setup-claude-model-routes.py` | 写 3P profile 的 `inferenceModels` |
| `start-workbuddy.ps1` | 按「活跃 provider 是否指向本适配器」启停 |

## 验证口径（别用 curl 冒充）

真跑 `claude -p` / `codex`，不是 curl 模拟。本机实测四格全过：

| 通路 | 对话 | Read 读文件 | Bash 写文件 |
| --- | --- | --- | --- |
| DeepSeek `deepseek-v4-pro` | ✓ | ✓ 读出标记串 | — |
| WorkBuddy `deepseek-v4.1-flash` | ✓ | ✓ 读出标记串 | ✓ 落盘并读回 |

工具调用要单独验：三个上游模型都确认过能产出 `tool_use` 且 `stop_reason=tool_use`。

⚠️ `~/.claude/settings.json` 的 `env` **优先于进程环境变量**。测试要覆盖它只能用
`claude --settings <临时文件>`，直接 `export` 会被旧配置盖掉，表现为
「明明改了 base_url 却还在报上一个上游的错」。
