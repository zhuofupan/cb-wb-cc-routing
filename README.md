# ds-wb-cc-routing

用 **CC Switch** 把 **DeepSeek 官方**与 **WorkBuddy** 接进 **Codex CLI** 与
**Claude Code / Claude Desktop（Cowork）** 的完整配置经验，附带可直接复用的适配器代码。

2026-10-19 至 2026-10-20 在本机实测通过，所有结论来自实际运行 `claude -p` / `codex`，
不是 curl 模拟，也不是推断。

## 这个仓库是什么

它同时是一份 **Claude Code skill**（`SKILL.md` + `references/`）和一个
**可运行的实现**（`scripts/`）。

| 目录 | 内容 |
| --- | --- |
| `SKILL.md` | skill 主体：四条通路、三个必踩的坑、配置顺序 |
| `references/` | 排错、模型菜单、CC Switch 内部行为、Codex 隔离、已知限制 |
| `scripts/` | 适配器与 CC Switch 注册脚本（幂等，密钥已占位符化） |

## 四条通路

| 通路 | 中间件 | 端点 |
| --- | --- | --- |
| DeepSeek → Codex | 不需要 | `https://api.deepseek.com` |
| DeepSeek → Claude Code | 不需要 | `https://api.deepseek.com/anthropic` |
| WorkBuddy → Codex | 需要 18791 适配器 | `http://127.0.0.1:18791/v1` |
| WorkBuddy → Claude Code / Cowork | 需要 18791 适配器 | `http://127.0.0.1:18791` |

DeepSeek 官方自带 Anthropic 兼容端点，所以那两条不需要任何中间件。
WorkBuddy 必须走适配器：上游认的是桌面版登录态（客户端 accessToken，还要会刷新），
不是普通 API key。

```
Claude Code    ──直连─────────────────→ 18791 适配器 → WorkBuddy 上游
Claude Desktop ──→ 15721(CC Switch) ──→ 18791 适配器 → WorkBuddy 上游
Claude Code    ──────────────────────→ api.deepseek.com/anthropic
```

## 快速开始

```bash
# 1. 填配置
cp scripts/local-settings.json.example scripts/local-settings.json
#    改 secret（本机随机令牌）、electron（WorkBuddy.exe 路径）

# 2. 起适配器
powershell -File scripts/start-workbuddy.ps1

# 3. 关掉 CC Switch，注册条目，再启动
$env:CCSWITCH_DB = 'C:/path/to/cc-switch.db'
$env:WORKBUDDY_LOCAL_SECRET = '<你的 secret>'
$env:DEEPSEEK_API_KEY = '<你的 key>'
python scripts/register-ccswitch-providers.py   # Codex 两个条目
python scripts/register-ccswitch-claude.py      # Claude Code
python scripts/register-ccswitch-desktop.py     # Claude Desktop / Cowork

# 4. 在 CC Switch 界面里点切换（直接改库只注册条目，不生效）
```

⚠️ CC Switch 是 GUI 托盘应用，**自动化会话里拉不起来** —— 进程会随会话被清理。
改完 Desktop 配置必须自己开 CC Switch。

## 最值得知道的三件事

### 1. 11128 是渠道指纹，不是限流

Claude Code 把 `x-anthropic-billing-header: cc_version=…` 塞进 system 第一段，
上游判为「未批准渠道」。与请求体大小、工具数量、`max_tokens` **全都无关**。

⚠️ 桌面版 Code 标签会把这串**连写两遍**放进同一个 system 块，只剥第一次不够。
必须 `/g` 全局剥离。

### 2. 11128 还有第二个来源

`Anthropic's official CLI for Claude` 这 40 个字符也会触发独立的检查。
去掉 `, running within the Claude Agent SDK` 不管用。
详见 [references/troubleshooting.md](references/troubleshooting.md)。

### 3. 模型菜单的开关不是 model-catalog

是 cc-switch 写的 **3P profile** 的 `inferenceModels`，`labelOverride` 决定显示文字。
cc-switch 4.0.15 没有模型映射功能且每次硬编码重写 4 项 —— **把 profile 设只读**才能持久化。
详见 [references/model-menu.md](references/model-menu.md)。

## 密钥处理

仓库里**不含任何真实密钥**。所有脚本从环境变量读取：

| 变量 | 用途 |
| --- | --- |
| `CCSWITCH_DB` | cc-switch.db 路径 |
| `ADAPTER_HOME` | 适配器目录（模型 catalog 所在） |
| `DEEPSEEK_API_KEY` | DeepSeek 官方 key |
| `WORKBUDDY_LOCAL_SECRET` | 18791 的本机令牌 |
| `CLAUDE_3P_PROFILE` | Claude Desktop profile 路径 |
| `LOCALAPPDATA` | 推导 profile 默认位置 |

## 已知限制

thinking 不回传（上游推理无签名，不伪造）、`cache_control` 丢弃、
`count_tokens` 是字符估算。逐个实测的只有 `deepseek-v4.1-flash` 与 `deepseek-v4-pro`。
WorkBuddy 通路是**试用适配，非腾讯官方 Codex 集成**，依赖客户端登录接口。

完整清单见 [references/limits.md](references/limits.md)。

## 来源与许可

- DSH 插件（WorkBuddy 认证）：https://github.com/corrinehu/dsh-workbuddy-connect （MIT）
- 官方 DeepSeek Codex 指南：https://api-docs.deepseek.com/quick_start/agent_integrations/codex/
- 本仓库：MIT

## 安装为 skill

```bash
# Claude Code
ln -s "$(pwd)" ~/.claude/skills/ds-wb-cc-routing
# 或复制进 CC Switch 的 skills 目录
```
