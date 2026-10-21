---
name: cb-wb-cc-routing
description: 将 DeepSeek 官方、CodeBuddy、WorkBuddy 通过 CC Switch 接入 Claude Desktop Code/Cowork 或 CLI；处理模型菜单、上下文、最高思考和工具协议兼容。
license: MIT
metadata:
  version: 1.5.0
  author: Codex
  tags: [cc-switch, claude-desktop, codebuddy, workbuddy, deepseek, codex]
---

# 读取路由

默认目标是 Claude Desktop 的 Code / Cowork；只有用户明确要求时才配置 Claude CLI（CC Switch 的 Claude 页），Codex 目标另见 [Codex 隔离](references/codex-isolation.md)。更换模型不等于更换客户端工具体系；客户端原生工具/Skills/MCP/插件优先，厂商 MCP 只是可选补充。

| 任务 | 读取 |
|---|---|
| 安装与认证 | [README.md](README.md)、[requirements.md](references/requirements.md) |
| 默认三模型、菜单与前后缀 | [model-menu.md](references/model-menu.md) |
| 200k / 1M、逐模型窗口 | [context-window.md](references/context-window.md) |
| Max / High、默认与强制 | [reasoning-effort.md](references/reasoning-effort.md) |
| 搜索、抓取、生图、Codex 插件 | [tools-and-plugins.md](references/tools-and-plugins.md) |
| 哪些已实测、哪些证据不能外推 | [desktop-validation.md](references/desktop-validation.md)、[limits.md](references/limits.md) |
| 数据库 / live-state | [cc-switch-internals.md](references/cc-switch-internals.md) |
| 11128 / 11133 | [troubleshooting.md](references/troubleshooting.md) |
| Codex 官方与第三方隔离 | [codex-isolation.md](references/codex-isolation.md) |
| Codex 原生指令、工具发现与等待边界 | [native-integration.md](references/native-integration.md) |
| Desktop 按需工具、默认压缩与设置清理 | [claude-desktop-native.md](references/claude-desktop-native.md) |
| 最新修复结果与完整人工测试 | [validation-20261021.md](references/validation-20261021.md)、[manual-acceptance-r3.md](references/manual-acceptance-r3.md) |

## 必须遵守

1. 数据库变更前退出 CC Switch，先备份。运行中的程序可能覆盖写入；高权限进程拒绝操作时说明系统原因，不能反复假装已关闭。
2. 每厂商一个 Desktop 供应商，在 `meta.claudeDesktopModelRoutes` 内建模型菜单。使用 camelCase，不用旧 snake_case；不要设只读 profile，不改签名模型目录。
3. `providers.app_type='claude-desktop'` 与 CLI 的 `claude` 是两套配置。改库仅注册；以 CC Switch 实际激活和 live-state 的路由确认运行目标。
4. 真实密钥从环境变量/用户本地配置读取；不进 Git、不进日志。CodeBuddy 只用用户 ck key；WorkBuddy 登录态与可选原生 MCP 是另一套认证。
5. 默认仅配置 DeepSeek V4.1 Flash、MiniMax M3.1 Flash、GLM 5.3 FlashX，顺序与 Codex 一致，默认 DeepSeek。Kimi 和 GLM 5.3 仅在用户明确要求时添加，不自动恢复。最新型号以对应上游目录核对，保留用户所选档位。当前 MiniMax 是 M3.1-Flash（1M），不再使用旧 M3（512k）。CB/WB 显示名统一 `cb/ 模型名 (倍率x) · 窗口` / `wb/ 模型名 (倍率x) · 窗口`。
6. 分开报告端点测试、代理路由、CLI、真实 Desktop、满窗口负载。不能拿 HTTP 200、标签中的 1M 或 SDK contextWindow 单独证明全部能力。
7. 默认使用 client 档位策略，保留显式选择并持久记忆客户端和模型对应的档位；缺失时采用上游默认值。DeepSeek/GLM 的 medium→low、xhigh→high 是兼容映射，不是不同算力档。highest 仅在用户明确要求时启用，它会覆盖低档。请求接受不证明实际推理投入。
8. 不默认更换或绕过客户端安全策略、认证、插件授权。原生 WebFetch/WebSearch 失败时可以提供 MCP 备选，但必须区分替代功能与原生功能修复。

9. Code 与 Cowork 分开保存界面选择，清理设置时保留账号选择。默认不写强制 Max 的环境变量或 Windows 策略；已有受保护策略不能擅自提权清理。策略回读、账户 JSON 与实际界面是不同证据，不能凭文件写入声称界面已生效。

10. 输出上限按模型的 maxOutputTokens 和剩余窗口收敛，不共用固定 16K/8K 上限。保持真实 context_window / max_context_window；Codex 的 auto_compact_token_limit=null，Desktop 受管理别名不写固定 autoCompactWindow，由安装版本采用原生策略。已有会话副本也需清理，但不擅自截断历史。设置写入、客户端重载与长会话实际压缩分别验证。

## 适配实现

`scripts/gateway-server.mjs` 是 WorkBuddy / CodeBuddy 共享实现，`--settings` 指定配置。CodeBuddy 模式不加载 WorkBuddy 认证模块。`anthropic-codec.mjs` 将 tool_result 图片作为后续用户图像消息转发；Tencent 不支持的指定函数 tool_choice 对象转换为仅暴露目标函数的 required 调用。`responses-codec.mjs` 保留 Codex 协议适配；不代表所有官方服务端工具均可用。

`scripts/desktop_models.py` 为默认三模型的单一菜单定义；更新型号需同步配置示例和测试。`register-ccswitch-desktop.py` 注册三个厂商之一；`setup-claude-model-routes.py` 更新已有腾讯厂商的菜单，不强写运行中的 profile。

`register-ccswitch-providers.py` 为 Codex 生成逐模型目录并更新三个厂商卡片，保留插件/MCP/skills 和官方登录。先 `--prepare-only`，确认 CC Switch 退出后注册；`collect-codex-evidence.py` 只读用户手动测试的本地记录。本轮用户确认当前客户端功能验收完成，具体证据与历史限制见验证记录。

默认只注册 `claude-desktop`。Claude CLI 的 `app_type='claude'` 是独立一套配置，仅在用户明确要求时用 `register-ccswitch-claude.py --provider codebuddy|workbuddy` 更新；不要因为它与 Desktop 同名就一起改写。

## 验证

网关部署不能以结束进程作为最后一步。先确认独立于当前模型连接的 supervisor
正在运行；只逐个重启涉及的网关，每个都须恢复 `/health` 和实际协议请求后才继续。
修改 supervisor 必须运行 `powershell -NoProfile -File tests/supervisor.test.ps1`，
并实测一次网关退出后自动恢复；仅端口首次监听、防重复启动或 Node/Python 测试通过，
都不能证明保活有效。日志使用 Host/Information 流或文件，不得混入返回 Process 的成功流。

先跑仓库离线回归，再仅对变更涉及的在线路径补测；不重复消耗额度测试未受影响的项目。对 Desktop 的结论必须有实际 Desktop 证据，用户禁用 Computer Use 后使用手动步骤和本地日志读取，不擅自恢复界面控制。

旧版对只读 profile、无模型映射、CLI 等同 Desktop 的结论均已废止，以当前文档为准。
