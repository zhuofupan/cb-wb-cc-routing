# ds-wb-cc-routing

用 CC Switch 将 **DeepSeek 官方、CodeBuddy、WorkBuddy** 接入 **Claude Desktop 的 Code / Cowork**，并保留 Claude Code / Codex 的协议适配示例。目标是更换模型与额度来源，同时继续使用客户端的文件工具、Skills、MCP 和插件；不是把厂商聊天界面搬过来。

2026-10-20 更新：每厂商一个 Desktop 供应商，模型在供应商内部选择；CodeBuddy / WorkBuddy 各九模型，显示名为 `CB·模型名·窗口` / `WB·模型名·窗口`。MiniMax 已由 M3 升级为 **M3.1-Flash（1M）**。详细测试覆盖见 [实测记录](references/desktop-validation.md)。

## 认证与依赖

| 通路 | 用户提供什么 | 本地依赖 |
|---|---|---|
| DeepSeek 官方 | 自己的 API key | Desktop 模型映射使用 CC Switch；推理直接发官方接口 |
| CodeBuddy | 自己的 `ck_…` API key | CC Switch + 18792 适配器；不需要 WorkBuddy 登录或 DSH |
| WorkBuddy | 自己的桌面登录态、本地随机令牌 | CC Switch + 18791 适配器 + WorkBuddy 可用安装 + DSH 认证源码 |

```text
Claude Desktop Code / Cowork → CC Switch :15721
  ├─ DeepSeek 官方 Anthropic 兼容端点
  ├─ :18792 CodeBuddy → 腾讯上游（用户 ck key）
  └─ :18791 WorkBuddy → 腾讯上游（用户登录态）
```

CodeBuddy 的“只需 key”指认证，不表示 Claude Desktop 原生提供了任意 API key 输入框。WorkBuddy 原生生图、搜索、抓取 MCP 是**可选补充**，另需 WorkBuddy 登录和额度，不属于 CodeBuddy key 附赠能力。

## 当前九模型

| 模型 | 上游 ID | 目录声明上下文 |
|---|---|---:|
| Hy4 preview | `hy4-preview` | 960000 |
| Step-5-Preview | `step-5-preview` | 1000000 |
| DeepSeek-V4.1-Flash | `deepseek-v4.1-flash` | 1000000 |
| DeepSeek-V4-Pro | `deepseek-v4-pro` | 1000000 |
| GLM-5.3 | `glm-5.3` | 1000000 |
| Kimi-K3 | `kimi-k3-2` | 1000000 |
| MiniMax-M3.1-Flash | `minimax-m3.1-flash` | 1000000 |
| Xiaomi MiMo-V2.6-Pro | `mimo-v2.6-pro` | 1000000 |
| Space-Bunny | `space-bunny` | 1000000 |

Pro / Flash 等不同档位分别保留当前版本，不按数字把高能力档静默换成轻量档。目录会更新，安装时应重新核对。DeepSeek 官方当前为 `deepseek-flash`（V4.1-Flash）与 `deepseek-v4-pro`，声明 1048576 token；官方 Pro 不支持图像输入，腾讯同名通路实测可识图。

## 启动适配器

需要 Node.js 24（本次实测版本 24.15.0）、Python 3 和 Windows PowerShell。

CodeBuddy 可独立安装，不必安装 WorkBuddy：

```powershell
Copy-Item scripts/codebuddy-settings.json.example scripts/codebuddy-settings.json
powershell -File scripts/start-workbuddy.ps1 -SettingsPath scripts/codebuddy-settings.json
```

WorkBuddy 路由另需 DSH 的认证模块：

```powershell
git clone https://github.com/corrinehu/dsh-workbuddy-connect scripts/dsh-workbuddy-connect
# 本次验证的认证源码版本；升级认证模块后重新验收。
git -C scripts/dsh-workbuddy-connect checkout 9e2d2559119e93113097554adacc52d62aef7882
npm.cmd install --omit=dev
Copy-Item scripts/local-settings.json.example scripts/local-settings.json
# 编辑 local-settings.json：填写自己的 WorkBuddy.exe 路径与随机 secret。
powershell -File scripts/start-workbuddy.ps1
```

前台诊断也可运行 `node --experimental-strip-types scripts/gateway-server.mjs --settings scripts/codebuddy-settings.json`。常驻需使用自己的计划任务/进程管理器；验证端口实际存活，不能把一次 Start-Process 成功等同于会话退出后仍常驻。配置示例关闭按 CLI 活跃状态自动退出，适用于只使用 Desktop 的场景。

认证依赖是可选依赖，仅 WorkBuddy/MCP 使用；CodeBuddy 不需要执行上述 clone 或 npm 安装。WorkBuddy 如提示缺少 `@deepseek-ai/dsh-atomic-write` 或 `@deepseek-ai/dsh-home-paths`，应确认两项依赖安装成功，不能把模块缺失当成账号认证失败。

## 注册 Desktop 供应商

先从托盘退出 CC Switch。脚本只注册/更新对应供应商，会备份数据库，保留已有供应商的选中状态，不为每模型建卡片，也不直接修改 live-state。

```powershell
# 先在当前终端安全设置自己的 CODEBUDDY_API_KEY、WORKBUDDY_LOCAL_SECRET 或 DEEPSEEK_API_KEY。
# 不要把真实值写入仓库、截图或 issue。
python scripts/register-ccswitch-desktop.py --provider codebuddy
python scripts/register-ccswitch-desktop.py --provider workbuddy
python scripts/register-ccswitch-desktop.py --provider deepseek
```

默认数据库为 `~/.cc-switch/cc-switch.db`，可用 `CCSWITCH_DB` 指定位置。只需更新已存在的腾讯模型菜单时运行 `python scripts/setup-claude-model-routes.py --provider all`。如果已有不同 ID 的 DeepSeek 供应商，应更新已有条目，避免重复注册。

打开 CC Switch，在 **Claude Desktop** 页启用相应厂商，再完全退出并打开 Claude Desktop。保持 profile 可写；`meta.claudeDesktopModelRoutes`、`labelOverride`、`supports1m` 必须使用 camelCase。旧版文档根据 snake_case 搜索误判“不支持映射”，并建议只读 profile，已纠正。

## 上下文与最高思考

窗口声明、压缩阈值、客户端显示、实际长请求容量是不同证据。每模型设置示例、Cowork 隔离目录和 SDK audit 的判断边界见 [上下文](references/context-window.md)。没有进行满 1M token 负载测试。

示例启用 `effortPolicy: "highest"`：请求 max，再将 Hy4 / Step-5 限制到目录声明的 high。它会覆盖手动低档；若希望保留手动选择，删除该策略，仅用 `effortDefault` 填空。请求 200 不证明供应商内部执行了最高计算量，详见 [思考档位](references/reasoning-effort.md)。

## 原生工具与插件

优先使用 Claude / Codex 自带工具和已安装插件。模型负责选择工具，客户端负责文件、命令、MCP 执行。本地函数协议通过，不代表全部官方服务端能力自动可用。

本机 Desktop Code 内置 WebSearch 曾因参数不兼容失败，已修复通用强制函数选择参数；但未把该修复冒充 WebSearch 已复验通过。内置 WebFetch 曾因 claude.ai 域名检查失败。可选 WorkBuddy MCP 的搜索/抓取在两个 Desktop 模式真实调用成功，但它不是原生工具已修好的证明。插件机制、认证边界与生图安装见 [工具与插件](references/tools-and-plugins.md)。

## 测试与读取路由

```powershell
node --test tests/gateway.test.mjs
python -m unittest discover -s tests -p "test_*.py"
```

这些离线回归测试不使用真实 key、不消耗模型额度；实际在线/客户端测试覆盖见 [实测记录](references/desktop-validation.md)。[SKILL.md](SKILL.md) 是给 agent 的读取路由。

旧的 Codex / Claude CLI 注册脚本仍保留供参考，不能把 CLI 通过视为 Desktop 通过。更多记录：[模型菜单](references/model-menu.md)、[CC Switch 内部](references/cc-switch-internals.md)、[限制](references/limits.md)、[排错](references/troubleshooting.md)、[Codex 隔离](references/codex-isolation.md)。

## 来源与许可

- DSH 认证源码：[corrinehu/dsh-workbuddy-connect](https://github.com/corrinehu/dsh-workbuddy-connect)（MIT，另行安装）。
- [DeepSeek 模型目录](https://api-docs.deepseek.com/api/list-models/)、[思考模式](https://api-docs.deepseek.com/guides/thinking_mode/)。
- [CC Switch Desktop 文档](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/en/2-providers/2.6-claude-desktop.md)。
- 本仓库 MIT。只提交源码、占位符模板及脱敏结论，不提交登录态、数据库、失败请求正文、签名图片 URL 或个人日志。
