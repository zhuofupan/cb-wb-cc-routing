# 为什么要这么配：和直接用 WorkBuddy 的区别

## 一句话

**直接用 WorkBuddy，你只有 WorkBuddy；配上之后，你在 Codex / Claude Code 里多了一个可选上游。**

## 对照表

| | 直接用 WorkBuddy | 配上这套路由 |
| --- | --- | --- |
| 界面 | WorkBuddy 自己的桌面 UI | Codex CLI、Claude Code、Claude Desktop 各自的 UI |
| 能用的模型 | WorkBuddy 全家桶 | WorkBuddy 全家桶 **+** DeepSeek 官方 **+** 官方 Claude |
| 会话历史 | 锁在 WorkBuddy 里 | 在 Codex / Claude Code 自己的历史里，与官方模型并列 |
| 技能 / 插件 / MCP | WorkBuddy 的生态 | Codex / Claude Code 的生态 |
| 记忆存放 | `~/.workbuddy/` | Claude Code 的 skill 机制（`~/.claude/`），与模型无关 |

## 四个实际好处

### 1. 换模型不用换工作现场

同一份代码、同一段对话，觉得当前模型不合适就切到另一个 —— 不用重开窗口、
重贴上下文。

那 9 项模型菜单（见 [model-menu.md](model-menu.md)）就是为了这一个目的 ——
让「换上游」变成下拉框里点一下。

### 2. 一套额度跑三个壳

WorkBuddy 的额度原来只在 WorkBuddy 里能用。现在 Codex 和 Claude Code 也能消耗它，
等于把订阅用满了。

### 3. 能用 Claude Code 的生态

WorkBuddy 那边没有 skills / hooks / subagent。这条通路让 WorkBuddy 的额度
能跑在已经调教好的 Claude Code 环境里 —— 记忆、约定、校验脚本全都还在。

### 4. 失败能退回官方

CC Switch 点一下回 Anthropic 官方，不用改任何东西。这是「保险丝」——
上游挂了不至于没活干。

## 代价（说清楚才好选）

- 维护一套 18791 适配器，**WorkBuddy 客户端升级可能要跟着改 DSH 源码**
- **thinking 不回传** —— 多轮工具调用里模型看不到自己上一轮思考，
  这是实际效果上最明显的短板（见 [limits.md](limits.md)）
- `count_tokens` 是估算，上下文用量条会偏
- **CC Switch 必须保持运行**，它挂了 Claude Desktop 就连不上；启动及常驻方式见 [requirements.md](requirements.md)
- 多一层故障点：适配器 → CC Switch → 上游，任一层挂了都要单独排查

## 分工边界：模型只决策，软件管其余

**大模型只做单步决策；Agent 软件负责循环、上下文工程、harness、prompt 工程。**

不管后面接的是哪个模型，`Read` / `Write` / `Edit` / `Bash` 这些工具都是
**Codex / Claude Code 进程自己在跑**。模型只负责*决定*读哪个文件、写什么内容，
真正落盘的是客户端。

```
你选 Sonnet   → Anthropic 决定「记忆写什么、文件怎么改」 → Claude Code 执行
你选 MiMo     → MiMo 决定                                → Claude Code 执行
```

**推论**：换模型换的是**决策质量**，不是执行机制。写记忆、改文件的质量
取决于当前选中谁在做决策 —— 格式对但内容走偏的内存，客户端会照单执行。

完整分工表与「prompt 工程是软件的活儿」见仓库 README 的
「大模型和 Agent 软件，各干什么」一节。

## 什么时候不该这么配

- 你只想用 WorkBuddy 干活 → 直接用最省事
- 你不需要多模型切换 → 多一层适配器纯属负担
- 你对 thinking 回传有要求 → 这条通路做不到

这套配置的价值在于**你不被锁在任何一家**，代价是多一层适配器要养。
