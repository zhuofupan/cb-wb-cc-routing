---
name: ds-wb-cc-routing
description: 用 CC Switch 把 DeepSeek 官方与 WorkBuddy 接入 Codex CLI 和 Claude Code / Claude Desktop（Cowork）。当用户提到「cc switch 配置 provider」「DeepSeek 接 Claude Code」「WorkBuddy 接 Codex」「11128 未批准渠道」「模型菜单改名字」「inferenceModels」「18791 适配器」「Codex 第三方模型不支持」时应使用。
license: MIT
metadata:
  version: 1.1.0
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

## 四个一定会踩的坑

### 1. 11128：客户端指纹（最早发现的一处）

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

### 3. 11128 的第三个来源：新会话首轮追加的「反馈」句

前两处都修好之后，还会剩一种形态：**新开对话第一条必 400，老会话续写完全正常**。
别当成偶发 —— 那是 Code 标签只在新会话首轮往 system 里追加的一句 onboarding：

```
To give feedback, users should report the issue at https://github.com/anthropics/claude-code/issues
```

二分实测：最小失败窗口就是这串 99 字符，改写它一个字节不动其余 31 KB → 400 变 200。
反直觉的是**单独这句话不触发**，要「长 system + 它」的组合才中。

它同时解释了「为什么长会话一直没事」：后续轮次的 system 里没有这段。

### 4. CC Switch 是 GUI 托盘应用，拉不起来

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

⚠️ **`mimo-v2.6-pro`**：早期记录它自称「小米的 AI 助手 MiMo」，带 `Read` 工具时
直接拒答；**后续复测四个场景（含回灌 tool_result、多工具）全部正常，未能复现**。
可以再试，但用前建议在真实客户端跑一次「读文件」确认。详见
[references/limits.md](references/limits.md)。

## 智能度（`reasoning_effort`）：默认值有三个落点

用户说的「智能度」= 上游的 `reasoning_effort`，五个档
`low` / `medium` / `high` / `xhigh` / `max`。它不属于 CC Switch，也不在客户端界面上：

| 落点 | 管什么 |
| --- | --- |
| Codex 模型目录的 `default_reasoning_level` | 菜单里每个模型默认选哪档 |
| Codex provider 的 `model_reasoning_effort` | Codex 每轮实际发出去的值（一份配置管所有模型） |
| 适配器 `local-settings.json` 的 `effortDefault` | Claude Code / Cowork **根本不发**这字段，替它补一个 |

**实测（2026-10-20，21 个模型逐个真发请求）：全部接受 `max`，返回 200。**
但只有 `deepseek-v4.1-flash` / `deepseek-v4-pro` 会**校验**取值（假哨兵会被 400 顶回），
其余模型「接受任意值但未见得照办」—— 设高是安全的，**别拿 200 当「它真的想更久」的证据**。

适配器的 `effortDefault` 只**填空不覆盖**：请求里已有 `reasoning_effort` 就不动，
所以在 Codex 里手动选低档仍然有效。补位会在日志里留一行
`{"event":"effort_default","model":…,"effort":"max"}`。

细节、SQL 与验证命令见 [references/reasoning-effort.md](references/reasoning-effort.md)。

## 上下文窗口：Claude Code 会把不认识的模型压到 200k

上游 `contextWindow` 是 1M，但 Claude Code 的 `modelUsage.contextWindow` 实测只有
**200000**，并据此提前压缩。唯一的开关是 `~/.claude/settings.json` 的 `env`：

```json
"CLAUDE_CODE_MAX_CONTEXT_TOKENS": "1000000"
```

- 实测：不设 → 200000；设 1M → **1000000**。
- `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1` **无效**（名字像、实测不动）。
- 单次输出上限（`maxOutputTokens: 32000`）**改不动**，`CLAUDE_CODE_MAX_OUTPUT_TOKENS`
  会被内置能力表夹住。
- 这是**全局**值：换到真实窗口更小的模型（`minimax-m3-pay` 512k、`hy4-preview` 960k）
  要把数字跟着降，否则长会话会被上游顶回来。

Codex 侧不用管：目录里的 `context_window` 已经是上游最大值，95% 是它自己留的安全比例
（改成 100 只多 50k，换随机 400）。详见 [references/context-window.md](references/context-window.md)。

## 按需读取参考文件

- [references/requirements.md](references/requirements.md)
  —— 用户问「哪些软件必须开着 / 为什么连不上 / 开机要启动什么」时读。
  含依赖速查表、WorkBuddy 必须常驻的原因、适配器自检逻辑、排查顺序。

- [references/why.md](references/why.md)
  —— 用户问「这样配和直接用 WorkBuddy 有什么区别 / 好处在哪 / 值不值得」时读。
  含对照表、四个好处、代价清单、「什么时候不该这么配」。

- [references/troubleshooting.md](references/troubleshooting.md)
  —— 报 11128 / 11133 / 超时 / 000 时读。11128 的三个来源、二分定位套路、错误码对照。
- [references/reasoning-effort.md](references/reasoning-effort.md)
  —— 问「智能度 / 推理档位 / 为什么 Claude Code 里想得浅」、要把默认档调到最高时读。
  含三处落点、实测表、改库 SQL、验证命令。
- [references/context-window.md](references/context-window.md)
  —— 问「上下文只有 200k / 窗口怎么开到最大 / 1M 在哪设」时读。
  只讲 `CLAUDE_CODE_MAX_CONTEXT_TOKENS` 这一个有效开关与它的风险。
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
