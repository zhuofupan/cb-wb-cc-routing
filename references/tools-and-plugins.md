# 原生工具、MCP 与插件

目标是用第三方模型，继续使用 Claude / Codex 的客户端工具体系。Read/Write/Edit/Bash 的执行、权限和循环由客户端负责；模型决定调用什么。优先使用现有原生工具、Skills 和已安装的 MCP/插件，不默认依赖 WorkBuddy 自带工具。

## 不同能力不能混为一谈

| 能力 | 当前证据 |
|---|---|
| 文件工具 | 代表性 Desktop Code / Cowork 真实写读通过 |
| 图像输入 | 所选腾讯模型接口诊断通过；代表性 Desktop Read/上传通过 |
| 普通函数/MCP 往返 | 已验证；指定函数 tool_choice 兼容问题已修复 |
| Claude 内置 WebSearch | 曾有协议错误；通用参数修复后未在原生工具中复验，不能宣称已修好 |
| Claude 内置 WebFetch | 曾因 claude.ai 域名检查失败；没有更改客户端安全策略来绕过 |
| WorkBuddy MCP 搜索/抓取 | 两模式真实调用通过，是可选替代，不是内置修复 |
| 所有 Codex 插件 | 未做逐插件矩阵，不能保证全部可用 |

OpenAI 官方说明插件可以组合 Skills、MCP 与 hooks；能力和运行环境可能有表面差异：[插件架构](https://developers.openai.com/plugins/concepts/plugins)。Skills 提供流程，MCP 提供数据、认证与动作。官方插件也可能包含特定平台连接器，例如 [OpenAI Developers 插件](https://developers.openai.com/learn/developers-codex-plugin) 的 Claude/Cursor 适配不包含 Codex 专用 Platform 连接器。因此不能把“能用第三方模型”推成“全部官方云端功能也获得授权”。这些是架构边界，不是本仓库完成了所有插件测试的声明。

## 可选 WorkBuddy 原生工具

`scripts/workbuddy-tools-mcp.mjs` 以 stdio JSON-RPC 暴露：

- workbuddy_web_search
- workbuddy_web_fetch
- workbuddy_generate_image

与用户已登录的 WorkBuddy 共享认证；不把访问 token 发给聊天模型。生图调用独立 `hunyuan-image-alpha` 服务，生成图片后返回文件路径和像素，消耗 WorkBuddy 图片额度，不是 Hy4 聊天模型直接生成。Code、Cowork 各真实生成过一张，单张返回 5.71 credits；不代表所有账号未来固定价格。

安装前先完成 WorkBuddy 认证依赖。合并到第三方 Desktop 的 `%LOCALAPPDATA%/Claude-3p/claude_desktop_config.json`，不要覆盖已有 mcpServers：

```json
{
  "mcpServers": {
    "workbuddy-native-tools": {
      "command": "C:/path/to/node.exe",
      "args": ["--experimental-strip-types", "C:/path/to/cb-wb-cc-routing/scripts/workbuddy-tools-mcp.mjs"]
    }
  }
}
```

重开 Desktop 后再验工具发现、实际调用和结果；仅 tools/list 不等于功能通过。该 MCP 使用 scripts/local-settings.json 中的 WorkBuddy 安装配置；只有 CodeBuddy key 时不启用它。用户可继续选择其他独立搜索/抓取/生图 MCP，无须绑定这套可选服务。

## 在 Codex 接入相同 MCP

把下面配置合并到用户级 `~/.codex/config.toml`，使用自己的仓库绝对路径和可用的 Node 24。不要覆盖其他 MCP。安装目录必须已有可用的 WorkBuddy local-settings.json、认证源码和依赖。

```toml
[mcp_servers.workbuddy-native-tools]
command = "node"
args = ["--experimental-strip-types", "C:/path/to/cb-wb-cc-routing/scripts/workbuddy-tools-mcp.mjs"]
startup_timeout_sec = 30
tool_timeout_sec = 300
```

完全重开 Codex 后检查工具发现，再实际调用。若用 CC Switch 切换配置，应在生成供应商卡片前保留此 MCP 配置；Codex 注册脚本会保留公共 MCP。已有卡片需同步其 config，避免切换后丢失。工具执行超时给生图等待留出余量，不代表每次请求必定成功。

2026-10-21 本机已验证 Codex CLI 能识别启用，进程初始化及 tools/list 返回三个工具；新接入后的 Codex 应用内调用仍待 R3。此工具不限制聊天厂商，cb/wb 模型都可以发起调用，但使用的是 WorkBuddy 登录和额度。

Codex 官方 `image_gen` 与本 MCP 分开；仅因为模型能调用 MCP，不能推出切换第三方供应商后官方 GPT Image 一定可用。R3 提供两条独立的官方生图探针，不自动改走 WorkBuddy。
