# ds-wb-cc-routing

用 **CC Switch** 把 **DeepSeek 官方**与 **WorkBuddy** 接进 **Codex CLI** 与
**Claude Code / Claude Desktop（Cowork）** 的配置经验与适配器实现。

在 Claude Code 中作为 skill 加载后，按下方读取路由工作。

---

# 写给用户

## 先说背景：为什么要做这件事

你手上有三套模型能用：

- **官方 Claude** —— Anthropic 的，最贵但最好用
- **DeepSeek 官方** —— 按量付费，有自己的 API key
- **WorkBuddy** —— 腾讯的 AI 编程客户端，按月订阅，里面接了一批国产模型

问题在于：**每一套只能在自己的界面里用。** 你用 Claude Code 写代码，就吃不到
WorkBuddy 的额度；你用 WorkBuddy，就用不了 Claude Code 的 skills 和记忆。

这套配置解决的就是这个问题 —— 把两个第三方上游接进你已经在用的客户端里。

## 配完之后是什么样

原来：

```
Claude Code ──→ Anthropic 官方（贵）
Codex       ──→ OpenAI 官方
WorkBuddy   ──→ 自己的界面，只能用自己家的模型
```

配完之后：

```
Claude Code ──┬─→ Anthropic 官方（随时切回）
              ├─→ DeepSeek 官方
              └─→ WorkBuddy 的模型

Codex       ──┬─→ OpenAI / DeepSeek 官方
              └─→ WorkBuddy 的模型
```

**你的代码、会话、记忆都还在 Claude Code / Codex 里，只是背后的模型换了。**
在菜单里点一下就切，不用重开窗口、重贴上下文。

## 四条通路，以及为什么要分

| 通路 | 需要装什么 | 为什么 |
| --- | --- | --- |
| DeepSeek → Codex | 什么都不用 | DeepSeek 官方提供了兼容端点，直接连 |
| DeepSeek → Claude Code | 什么都不用 | 同上 |
| WorkBuddy → Codex | 18791 适配器 | 见下方说明 |
| WorkBuddy → Claude Code | 18791 适配器 | 同上 |
| WorkBuddy → Desktop / Cowork | 适配器 + CC Switch | Desktop 的请求要先经 CC Switch 转发 |

**DeepSeek 为什么不用适配器**：它给你一个标准 API key，任何客户端填进去就能用。

**WorkBuddy 为什么必须适配器**：它没有给外部用的 API key。你能用的是**桌面版的
登录态** —— 就是你登录 WorkBuddy 客户端后，它存在硬盘上的那个登录凭证。
这个凭证：

- 是**加密**的，要用 WorkBuddy 自己的程序才能解开
- 会**过期**，需要定期刷新
- WorkBuddy 桌面版**必须开着**，否则解不开

适配器（一个跑在 `127.0.0.1:18791` 的小程序）就是干这个的：读那个凭证、
解密、拿你的身份去请求 WorkBuddy 的服务器。**它不拦截任何网络流量**，
只是读文件。

> ⚠️ 这意味着适配器是「非官方」的 —— 它复现了 WorkBuddy 官方客户端的登录方式。
> 用的是你自己的账号和额度，但 WorkBuddy 一升级，适配器可能就失效。

## 图什么，代价是什么

**好处**：

1. **换模型不用换工作现场** —— 同一个窗口里点一下菜单，上下文都还在
2. **一套额度跑三个壳** —— WorkBuddy 的订阅能在 Codex 和 Claude Code 里用
3. **能用 Claude Code 的生态** —— skills、hooks、记忆全都还在
4. **随时能退回官方** —— 上游挂了，CC Switch 点一下就回 Anthropic

**代价**：

- 多养一层适配器，WorkBuddy 升级可能要跟着修
- **模型的思考过程不保留** —— 多轮工具调用时，模型看不到自己上一轮怎么想的，
  这是实际效果上最明显的短板
- **CC Switch 必须手动开** —— 它是托盘程序，脚本拉不起来
- 多一层故障点，出问题要逐层排查

完整对照（含「什么时候不该这么配」）见 [`references/why.md`](references/why.md)。

## 开始之前：哪些软件必须开着

| 你要用的通路 | WorkBuddy | 适配器 18791 | CC Switch 15721 |
| --- | --- | --- | --- |
| 只用 DeepSeek | ✗ | ✗ | ✗ |
| WorkBuddy → Codex / Claude Code | ✓ | ✓ | ✗ |
| WorkBuddy → Desktop / Cowork | ✓ | ✓ | ✓ |

两个最容易出错的点：

- **WorkBuddy 不是「登录一次就行」**，必须保持**在运行**。它一旦被卸载、
  升级换了安装路径、或者重装过，适配器就解不开凭证了。
- **CC Switch 必须你自己启动**。它是 GUI 托盘程序，脚本或自动化会话里启动的
  进程会被清理掉，表现为 Claude Desktop 突然连不上模型。

## 自己动手配的步骤

1. 改 `scripts/local-settings.json` —— 填 `secret`（自己生成一串随机字符）
   和 `electron`（WorkBuddy.exe 的完整路径）
2. 跑 `powershell -File scripts/start-workbuddy.ps1` 启动适配器
3. **关掉 CC Switch**，再跑三个 `register-ccswitch-*.py` 注册条目
4. 打开 CC Switch，**在界面里点卡片切换**（直接改数据库不生效）

完整命令见下方「给 AI 的工作说明」里的安装一节，或直接用 agent 帮你配。

## 常见问题

**配错了怎么恢复？**
所有脚本都是幂等的，重跑就行。想彻底恢复，在 CC Switch 界面切回官方 provider。

**会不会花额外的钱？**
不会。用的都是你自己的 key 和订阅额度，没有中间商。

**安不安全？**
适配器只监听 `127.0.0.1`（只有本机能连），有随机令牌保护，不记录请求内容。
但它读的是你的登录凭证，且属于非官方方式，自己判断是否接受。

**三个必踩的坑是什么？**
11128 错误码的三个来源（渠道指纹、system 里的 CLI 身份句、新会话首轮追加的
「反馈」句），以及模型菜单的真正控制点。这些细节在 [`SKILL.md`](SKILL.md) 和
[`references/troubleshooting.md`](references/troubleshooting.md) 里。

**模型的「智能度」怎么调？**
就是上游的 `reasoning_effort`（`low`/`medium`/`high`/`xhigh`/`max`）。它有三个落点：
Codex 模型目录的默认档、Codex provider 的配置、以及适配器的 `effortDefault`
（Claude Code 根本不发这个字段，得由适配器补）。本仓库默认全部调到 **`max`**，
且只在请求没写的时候补位 —— 在 Codex 里手动选低档依然生效。
实测与改法见 [`references/reasoning-effort.md`](references/reasoning-effort.md)。

## 来源与许可

- DSH 插件（WorkBuddy 认证）：https://github.com/corrinehu/dsh-workbuddy-connect （MIT）
- 官方 DeepSeek Codex 指南：https://api-docs.deepseek.com/quick_start/agent_integrations/codex/
- 本仓库：MIT


# 给 AI 的工作说明

## 读取路由

先读 [`SKILL.md`](SKILL.md)，再按任务挑参考文件。

| 场景 | 读 |
| --- | --- |
| 全部 | [`SKILL.md`](SKILL.md) —— 四条通路、四个必踩的坑、配置顺序 |
| 报 11128 / 11133 / 超时 / `000` | [`references/troubleshooting.md`](references/troubleshooting.md) |
| 调「智能度 / 推理档位」、Claude Code 里想得比 Codex 浅 | [`references/reasoning-effort.md`](references/reasoning-effort.md) |
| 改 Desktop 模型菜单、菜单项重复 | [`references/model-menu.md`](references/model-menu.md) |
| 问「哪些软件必须开着 / 为什么连不上」 | [`references/requirements.md`](references/requirements.md) |
| 问「有什么好处 / 跟直接用有什么差别」 | [`references/why.md`](references/why.md) |
| 要写 CC Switch 数据库、`live-state` 不一致 | [`references/cc-switch-internals.md`](references/cc-switch-internals.md) |
| Codex 报 model not supported with ChatGPT account | [`references/codex-isolation.md`](references/codex-isolation.md) |
| 想知道没实现什么，别误以为支持 | [`references/limits.md`](references/limits.md) |

## 硬约束

1. **注册脚本必须在 CC Switch 关闭时运行**，否则写入被覆盖。
2. **切换 provider 只能在 CC Switch 界面点**。改库只注册条目，`live-state.json` 不认。
3. **CC Switch 是 GUI 托盘应用**，`Start-Process` 起的进程会随会话被清理。
   改完 Desktop 配置后必须提示用户自己开。
4. **直连 18791 必须带 `--noproxy '*'`**，否则被系统代理吃掉，表现为超时 / `000`。
   认证头是 `Authorization: Bearer`，**不是** `x-api-key`。
5. **`~/.claude/settings.json` 的 `env` 优先于进程环境变量**。要覆盖只能用
   `claude --settings <临时文件>`，`export` 会被旧配置盖掉。
6. **验证要真跑 `claude -p` / `codex`**，curl 模拟不算；报告结论时区分
   直连适配器与真实客户端验证。

## 排查顺序

模型不响应，从上往下：

1. `curl -s --noproxy '*' http://127.0.0.1:18791/health`
2. `tasklist | findstr WorkBuddy` —— 桌面版必须可运行（解密要调它）
3. `netstat -ano | findstr 15721` —— 仅 Desktop/Cowork
4. 看 `config.toml` **活跃** provider 的 `base_url`，或 `settings.json` 的 `ANTHROPIC_BASE_URL`

只看**活跃** provider —— `[model_providers.*]` 段会长期留在配置里，
全文搜 `127.0.0.1:18791` 恒为真。

## 分工前提

改任何东西之前先认清边界，否则会找错层。

**大模型只做单步决策；Agent 软件负责循环、上下文工程、harness、prompt 工程。**

| | 负责 |
| --- | --- |
| 大模型 | 读此刻给的 token，决定下一步：输出文本，还是调哪个工具、什么参数 |
| Agent 软件 | 循环（结果塞回再问）· 上下文工程（发什么）· harness（真执行、错误、权限、超时）· prompt 工程（system prompt 内容） |

两个容易搞反的点：

- **prompt 工程是软件的活儿。** 换模型，system prompt 与工具定义一个字都不变，
  变的只是决策准不准。
- **工具执行始终在客户端。** `Read`/`Write`/`Edit`/`Bash` 由 Codex / Claude Code
  自己跑，模型只决定读哪个文件、写什么。换模型换的是**决策质量**，不是执行机制。

## 内容边界

- 本仓库**不含密钥**。新增脚本一律从环境变量读，用占位符。
- 不要把真实 `secret` / `sk-` key / 主机绝对路径写进任何文件。

## 安装

```bash
ln -s "$(pwd)" ~/.claude/skills/ds-wb-cc-routing     # Claude Code
# 或复制进 CC Switch 的 skills 目录
```
