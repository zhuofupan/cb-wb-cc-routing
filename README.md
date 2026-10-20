# ds-wb-cc-routing

用 **CC Switch** 把 **DeepSeek 官方**与 **WorkBuddy** 接进 **Codex CLI** 与
**Claude Code / Claude Desktop（Cowork）** 的配置经验与适配器实现。

在 Claude Code 中作为 skill 加载后，按下方读取路由工作。

---

# 给 AI 的工作说明

## 读取路由

先读 [`SKILL.md`](SKILL.md)，再按任务挑参考文件。

| 场景 | 读 |
| --- | --- |
| 全部 | [`SKILL.md`](SKILL.md) —— 四条通路、三个必踩的坑、配置顺序 |
| 报 11128 / 11133 / 超时 / `000` | [`references/troubleshooting.md`](references/troubleshooting.md) |
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

---

# 给人快速了解

## 是什么

同一套配置能把两个上游（DeepSeek 官方、WorkBuddy）接进两个客户端
（Codex CLI、Claude Code / Desktop）的四条通路，附带可运行的适配器代码。

## 四条通路

| 通路 | 中间件 |
| --- | --- |
| DeepSeek → Codex / Claude Code | 不需要（官方自带 Anthropic 兼容端点） |
| WorkBuddy → Codex / Claude Code | 需要 18791 适配器 |
| WorkBuddy → Desktop / Cowork | 需要 18791 适配器 + CC Switch |

WorkBuddy 必须走适配器：上游认的是桌面版登录态（accessToken，会过期要刷新），
不是普通 API key。适配器**只读**打开桌面版的加密凭据，调 `WorkBuddy.exe` 取
解密密钥，再以 Bearer 打上游 —— 不拦截流量。

## 图什么

**不被锁在任何一家。** 换模型不用换工作现场、一套额度跑三个壳、
能用 Claude Code 的生态、失败能退回官方。

代价是多养一层适配器、thinking 不回传、CC Switch 必须手动开。

详见 [`references/why.md`](references/why.md)。

## 依赖哪些软件

| 通路 | WorkBuddy | 适配器 18791 | CC Switch 15721 |
| --- | --- | --- | --- |
| DeepSeek 两条 | ✗ | ✗ | ✗ |
| WorkBuddy → Codex / Claude Code | ✓ | ✓ | ✗ |
| WorkBuddy → Desktop / Cowork | ✓ | ✓ | ✓ |

WorkBuddy 必须保持**可运行**（不只是登录过）—— 解密要调它的可执行文件。

详见 [`references/requirements.md`](references/requirements.md)。

## 注意

配置步骤在 [`SKILL.md`](SKILL.md)；三个必踩的坑（11128 的两个来源、
模型菜单的真正开关）也在那里和 [`references/troubleshooting.md`](references/troubleshooting.md)、
[`references/model-menu.md`](references/model-menu.md)。

仓库不含真实密钥，脚本从环境变量读取：`CCSWITCH_DB`、`ADAPTER_HOME`、
`DEEPSEEK_API_KEY`、`WORKBUDDY_LOCAL_SECRET`、`CLAUDE_3P_PROFILE`。

## 来源与许可

- DSH 插件（WorkBuddy 认证）：https://github.com/corrinehu/dsh-workbuddy-connect （MIT）
- 官方 DeepSeek Codex 指南：https://api-docs.deepseek.com/quick_start/agent_integrations/codex/
- 本仓库：MIT
