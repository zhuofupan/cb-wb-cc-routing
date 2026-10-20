---
name: cb-wb-cc-routing
description: 将 DeepSeek 官方、CodeBuddy、WorkBuddy 通过 CC Switch 接入 Claude Desktop Code/Cowork 或 CLI；处理模型菜单、上下文、最高思考和工具协议兼容。
license: MIT
metadata:
  version: 1.4.0
  author: Codex
  tags: [cc-switch, claude-desktop, codebuddy, workbuddy, deepseek, codex]
---

# 读取路由

先确认用户目标是 Desktop Code / Cowork、Claude CLI 还是 Codex。更换模型不等于更换客户端工具体系；客户端原生工具/Skills/MCP/插件优先，厂商 MCP 只是可选补充。

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
| 最新修复结果与完整人工测试 | [validation-20261021.md](references/validation-20261021.md)、[manual-acceptance-r3.md](references/manual-acceptance-r3.md) |

## 必须遵守

1. 数据库变更前退出 CC Switch，先备份。运行中的程序可能覆盖写入；高权限进程拒绝操作时说明系统原因，不能反复假装已关闭。
2. 每厂商一个 Desktop 供应商，在 `meta.claudeDesktopModelRoutes` 内建模型菜单。使用 camelCase，不用旧 snake_case；不要设只读 profile，不改签名模型目录。
3. `providers.app_type='claude-desktop'` 与 CLI 的 `claude` 是两套配置。改库仅注册；以 CC Switch 实际激活和 live-state 的路由确认运行目标。
4. 真实密钥从环境变量/用户本地配置读取；不进 Git、不进日志。CodeBuddy 只用用户 ck key；WorkBuddy 登录态与可选原生 MCP 是另一套认证。
5. 默认仅配置 DeepSeek V4.1 Flash、MiniMax M3.1 Flash、GLM 5.3 FlashX，顺序与 Codex 一致，默认 DeepSeek。Kimi 和 GLM 5.3 仅在用户明确要求时添加，不自动恢复。最新型号以对应上游目录核对，保留用户所选档位。当前 MiniMax 是 M3.1-Flash（1M），不再使用旧 M3（512k）。CB/WB 显示名统一 `cb/ 模型名 (倍率x) · 窗口` / `wb/ 模型名 (倍率x) · 窗口`。
6. 分开报告端点测试、代理路由、CLI、真实 Desktop、满窗口负载。不能拿 HTTP 200、标签中的 1M 或 SDK contextWindow 单独证明全部能力。
7. 未完整声明 effort 范围的模型，只报告 max 请求获接受。默认三款在 Codex 显示 xhigh（极高），highest 策略向上游发送 max，会覆盖客户端低档，应明确告知。Hy4 与 Step-5 已移除。
8. 不默认更换或绕过客户端安全策略、认证、插件授权。原生 WebFetch/WebSearch 失败时可以提供 MCP 备选，但必须区分替代功能与原生功能修复。

9. Code 与 Cowork 的界面默认档分开处理。Code 手动选 MAX 不代表跨会话保存；Windows 官方用户级 effortLevel=max 策略见 [思考档位](references/reasoning-effort.md)。策略回读、账户 JSON 与实际界面是不同证据，不能凭环境变量或账户状态就声称 Code 新建页已修复。

## 适配实现

`scripts/gateway-server.mjs` 是 WorkBuddy / CodeBuddy 共享实现，`--settings` 指定配置。CodeBuddy 模式不加载 WorkBuddy 认证模块。`anthropic-codec.mjs` 将 tool_result 图片作为后续用户图像消息转发；Tencent 不支持的指定函数 tool_choice 对象转换为仅暴露目标函数的 required 调用。`responses-codec.mjs` 保留 Codex 协议适配；不代表所有官方服务端工具均可用。

`scripts/desktop_models.py` 为默认三模型的单一菜单定义；更新型号需同步配置示例和测试。`register-ccswitch-desktop.py` 注册三个厂商之一；`setup-claude-model-routes.py` 更新已有腾讯厂商的菜单，不强写运行中的 profile。

`register-ccswitch-providers.py` 为 Codex 生成逐模型目录并更新三个厂商卡片，保留插件/MCP/skills 和官方登录。先 `--prepare-only`，确认 CC Switch 退出后注册；`collect-codex-evidence.py` 只读用户手动测试的本地记录。本轮用户确认当前客户端功能验收完成，具体证据与历史限制见验证记录。

## 验证

先跑仓库离线回归，再仅对变更涉及的在线路径补测；不重复消耗额度测试未受影响的项目。对 Desktop 的结论必须有实际 Desktop 证据，用户禁用 Computer Use 后使用手动步骤和本地日志读取，不擅自恢复界面控制。

旧版对只读 profile、无模型映射、CLI 等同 Desktop 的结论均已废止，以当前文档为准。
