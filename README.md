# ds-wb-cc-routing

用 **CC Switch** 把 **DeepSeek 官方**与 **WorkBuddy** 接进 **Codex CLI** 与
**Claude Code / Claude Desktop（Cowork）** 的配置经验，附带可直接复用的适配器代码。

2026-10-19 起在本机实测，结论来自实际运行 `claude -p` / `codex`，不是推断。

---

# 第一部分：写给人看的

## 它解决什么问题

一句话：**直接用 WorkBuddy，你只有 WorkBuddy；配上之后，你在 Codex / Claude Code 里多了一个可选上游。**

| | 直接用 WorkBuddy | 配上这套路由 |
| --- | --- | --- |
| 界面 | WorkBuddy 自己的桌面 UI | Codex CLI、Claude Code、Claude Desktop |
| 能用的模型 | WorkBuddy 全家桶 | 全家桶 **+** DeepSeek 官方 **+** 官方 Claude |
| 会话历史 | 锁在 WorkBuddy 里 | 与官方模型并列在客户端自己那里 |
| 技能 / MCP 生态 | WorkBuddy 的 | Codex / Claude Code 的 |

## 为什么要把它嵌进 WorkBuddy 的工作流

这是整套配置存在的理由。四个好处，按实际价值排：

### 1. 换模型不用换工作现场

同一份代码、同一段对话，觉得当前模型不合适就切到另一个 —— 不用重开窗口、
重贴上下文。那 9 项模型菜单（见 [model-menu.md](references/model-menu.md)）
就是为了把「换上游」变成下拉框里点一下。

### 2. 一套额度跑三个壳

WorkBuddy 的额度原来只在 WorkBuddy 里能用。现在 Codex 和 Claude Code
也能消耗它，等于让订阅用满了。

### 3. 能用 Claude Code 的生态

WorkBuddy 那边没有 skills / hooks / subagent。这条通路让 WorkBuddy 的额度
能跑在已经调教好的 Claude Code 环境里 —— 你的记忆、约定、校验脚本全都还在。

### 4. 失败能退回官方

CC Switch 点一下回 Anthropic 官方，不用改任何东西。这是「保险丝」——
上游挂了不至于没活干。

### 代价

多养一层适配器、thinking 不回传、CC Switch 必须手动开、多一层故障点。

「什么时候不该这么配」见 [references/why.md](references/why.md)。

## 大模型和 Agent 软件，各干什么

理解分工，才知道在这套架构里**哪一层出了问题**。

```
一次 agent 循环 =
   [软件组装上下文] → [模型决策] → [软件执行] → [软件把结果塞回上下文] → 循环
            ↑____________ Agent 软件 ____________↑
```

| | 负责什么 | 具体到这套配置 |
| --- | --- | --- |
| **大模型** | **单步决策**：读此刻给它的全部 token，输出下一步做什么（文本 / 调哪个工具 / 参数） | DeepSeek、WorkBuddy 后面挂的那些模型。**只负责选**，不负责执行 |
| **Agent 软件** | **循环 + 上下文工程 + harness + prompt 工程** | Claude Code、Codex、WorkBuddy 桌面版 |

拆开说 Agent 软件那四块：

| | 干的事 |
| --- | --- |
| **循环** | 工具跑完把结果塞回去再叫一次模型，直到模型说停 |
| **上下文工程** | 决定这次发什么：system prompt、哪些历史、哪些工具定义、压缩到多少 |
| **harness** | 工具真的执行（Read/Write/Bash 落盘）、错误处理、重试、权限确认、超时 |
| **prompt 工程** | system prompt 的内容、工具描述怎么写 —— 这些是软件写死的 |

### 容易搞反的一格：prompt 工程是软件的活儿

`You are Claude Code, an AI coding agent` 这句是 Claude Code 拼进去的，
模型没参与。它只是收到这段文字后照做。

**换模型，system prompt 和工具定义一个字都不变**，变的只是「拿到同样输入后
选得准不准」。

### harness 是「工具执行始终在客户端」

不管后面接的是哪个模型，`Read` / `Write` / `Edit` / `Bash` 都是
Codex / Claude Code 进程自己在跑。模型只负责*决定*读哪个文件、写什么内容，
真正落盘的是客户端。

```
你选 Sonnet → Anthropic 决定「记忆写什么、文件怎么改」 → Claude Code 执行
你选 MiMo   → MiMo 决定                                → Claude Code 执行
```

**推论**：换模型换的是**决策质量**，不是执行机制。写记忆、改文件的质量
取决于当前选中谁在做决策 —— 格式对但内容走偏的记忆，客户端会照单执行。

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

### WorkBuddy 是怎么连上的

**不是拦截信号，是读文件。**

```
你登录 WorkBuddy 桌面版
        ↓
桌面版把凭据写在（加密）：
  %LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info
        ↓
适配器【只读】打开 → 调 WorkBuddy.exe 拿解密密钥 → 拿到 accessToken
        ↓
用 Bearer 打 https://copilot.tencent.com
```

三点值得知道：

- **不是 API key，是你的登录态。** 消耗的是你自己的额度。
- **不是拦截，是读文件。** 没有抓包、没有 hook 网络、没有中间人。
- **token 会过期。** 适配器不能在桌面版文件里刷新，所以在 `$DSH_HOME` 放自己的一份，
  谁过期晚用谁的。

这也解释了为什么 DeepSeek 一条命令就通、WorkBuddy 要一整套适配器。

## 哪些软件必须开着

| 通路 | WorkBuddy | 适配器 18791 | CC Switch 15721 |
| --- | --- | --- | --- |
| DeepSeek → Codex / Claude Code | ✗ | ✗ | ✗ |
| WorkBuddy → Codex / Claude Code | **✓** | **✓** | ✗ |
| WorkBuddy → Desktop / Cowork | **✓** | **✓** | **✓** |

⚠️ **WorkBuddy 不是「登录一次就行」，必须保持可运行** —— 凭据是加密的，
适配器要调 `WorkBuddy.exe` 拿解密密钥。卸载 / 升级换路径 / 重装过就解不开。

⚠️ **CC Switch 是 GUI 托盘应用，自动化会话里拉不起来，必须你自己开。**
它不运行 = 15721 不监听 = Claude Desktop 连不上。

完整说明和四步排查顺序见 [references/requirements.md](references/requirements.md)。

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

## 最值得知道的三件事

### 1. 11128 是渠道指纹，不是限流

Claude Code 把 `x-anthropic-billing-header: cc_version=…` 塞进 system 第一段，
上游判为「未批准渠道」。与请求体大小、工具数量、`max_tokens` **全都无关**。

⚠️ 桌面版 Code 标签会把这串**连写两遍**放进同一个 system 块，只剥第一次不够。

### 2. 11128 还有第二个来源

`Anthropic's official CLI for Claude` 这 40 个字符也会触发独立检查。
去掉 `, running within the Claude Agent SDK` 不管用。

### 3. 模型菜单的开关不是 model-catalog

是 cc-switch 写的 **3P profile** 的 `inferenceModels`，`labelOverride` 决定显示文字。
cc-switch 4.0.15 每次硬编码重写 4 项 —— **把 profile 设只读**才能持久化。

详细排查见 [references/troubleshooting.md](references/troubleshooting.md) 与
[references/model-menu.md](references/model-menu.md)。

## 密钥处理

仓库里**不含任何真实密钥**，所有脚本从环境变量读取：

| 变量 | 用途 |
| --- | --- |
| `CCSWITCH_DB` | cc-switch.db 路径 |
| `ADAPTER_HOME` | 适配器目录（模型 catalog 所在） |
| `DEEPSEEK_API_KEY` | DeepSeek 官方 key |
| `WORKBUDDY_LOCAL_SECRET` | 18791 的本机令牌 |
| `CLAUDE_3P_PROFILE` | Claude Desktop profile 路径 |

## 来源与许可

- DSH 插件（WorkBuddy 认证）：https://github.com/corrinehu/dsh-workbuddy-connect （MIT）
- 官方 DeepSeek Codex 指南：https://api-docs.deepseek.com/quick_start/agent_integrations/codex/
- 本仓库：MIT

---

# 第二部分：写给 AI 看的

> 这一节是给用 Claude Code / Codex 打开这个仓库的 agent 读的。
> 人的部分到上面为止。

## 仓库结构与读取路由

这是一个 **Claude Code skill** 仓库，同时含可运行实现。`SKILL.md` 是 skill 入口。

| 路径 | 何时读 |
| --- | --- |
| [`SKILL.md`](SKILL.md) | **先读这个**。四条通路、三个必踩的坑、配置顺序 |
| [`references/troubleshooting.md`](references/troubleshooting.md) | 报 11128 / 11133 / 超时 / 000 |
| [`references/model-menu.md`](references/model-menu.md) | 要改 Desktop 模型菜单、菜单项重复 |
| [`references/requirements.md`](references/requirements.md) | 问「哪些软件必须开着 / 为什么连不上」 |
| [`references/why.md`](references/why.md) | 问「有什么好处 / 值不值得 / 跟直接用有什么差别」 |
| [`references/cc-switch-internals.md`](references/cc-switch-internals.md) | 要写 CC Switch 数据库、`live-state` 不一致 |
| [`references/codex-isolation.md`](references/codex-isolation.md) | Codex 报「model not supported with ChatGPT account」 |
| [`references/limits.md`](references/limits.md) | 想知道没实现什么，别误以为支持 |

## 安装

```bash
ln -s "$(pwd)" ~/.claude/skills/ds-wb-cc-routing     # Claude Code
# 或复制进 CC Switch 的 skills 目录
```

## 硬约束（违反会出错）

1. **注册脚本必须在 CC Switch 关闭时运行**，否则写入被覆盖。
2. **切换 provider 只能在 CC Switch 界面点**。改库只注册条目，`live-state.json` 不认。
3. **CC Switch 是 GUI 托盘应用**，`Start-Process` 起的进程会随会话被清理。
   改完 Desktop 配置后必须提示用户自己开。
4. **直连 18791 必须带 `--noproxy '*'`**，否则被系统代理吃掉，表现为超时 / `000`。
   认证头是 `Authorization: Bearer`，**不是** `x-api-key`。
5. **`~/.claude/settings.json` 的 `env` 优先于进程环境变量**。要覆盖只能用
   `claude --settings <临时文件>`，`export` 会被旧配置盖掉。
6. **验证要真跑 `claude -p` / `codex`**，curl 模拟不算。

## 排查套路

模型不响应，从上往下：

1. `curl -s --noproxy '*' http://127.0.0.1:18791/health`
2. `tasklist | findstr WorkBuddy` —— 桌面版必须可运行（解密要调它）
3. `netstat -ano | findstr 15721`（仅 Desktop/Cowork）
4. 看 `config.toml` **活跃** provider 的 `base_url`，或 `settings.json` 的 `ANTHROPIC_BASE_URL`

判断时只看**活跃** provider —— `[model_providers.*]` 段会长期留在配置里，
全文搜 `127.0.0.1:18791` 恒为真。

## 内容边界

- 本仓库**不含密钥**。新增脚本一律从环境变量读，用占位符。
- 不要把真实 `secret` / `sk-` key / 主机绝对路径写进任何文件。
- 报告实测结论时区分**直连适配器**与**真实客户端**验证，别混为一谈。
