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

## 它解决什么问题

一句话：**直接用 WorkBuddy，你只有 WorkBuddy；配上之后，你在 Codex / Claude Code 里多了一个可选上游。**

| | 直接用 WorkBuddy | 配上这套路由 |
| --- | --- | --- |
| 能用的模型 | WorkBuddy 全家桶 | 全家桶 **+** DeepSeek 官方 **+** 官方 Claude |
| 会话历史 | 锁在 WorkBuddy 里 | 与官方模型并列在 Codex / Claude Code 自己那里 |
| 技能 / MCP 生态 | WorkBuddy 的 | Codex / Claude Code 的 |

四个实际好处：**换模型不用换工作现场**、**一套额度跑三个壳**、
**能用 Claude Code 的生态**、**失败能退回官方**。

代价：多养一层适配器、thinking 不回传、CC Switch 必须手动开。

完整对照（含「什么时候不该这么配」）见 [references/why.md](references/why.md)。

## 哪些软件必须开着

| 通路 | WorkBuddy | 适配器 18791 | CC Switch 15721 |
| --- | --- | --- | --- |
| DeepSeek → Codex / Claude Code | ✗ | ✗ | ✗ |
| WorkBuddy → Codex / Claude Code | **✓** | **✓** | ✗ |
| WorkBuddy → Desktop / Cowork | **✓** | **✓** | **✓** |

⚠️ **WorkBuddy 不是「登录一次就行」，必须保持运行** —— 凭据文件是加密的，
适配器要调 `WorkBuddy.exe` 拿解密密钥。它被卸载 / 升级换路径 / 重装过，
适配器就解不开。

⚠️ **CC Switch 是 GUI 托盘应用，自动化会话里拉不起来，必须你自己开。**
它不运行 = 15721 不监听 = Claude Desktop 连不上。

完整说明和排查顺序见 [references/requirements.md](references/requirements.md)。

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
