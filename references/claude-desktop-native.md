# Claude Desktop 原生适配（2026-10-21）

Desktop 与 Codex 共用网关，但客户端的协议、会话配置和权限检查分别处理。

- Anthropic 自定义 ToolSearch 返回的 tool_reference 会展开为当前请求中已声明的工具定义；defer_loading 工具在加载前不发给上游。状态只来自该聊天的历史。已调用工具在历史压缩后继续可用。
- 保留工具错误、具名 tool_choice、disable_parallel_tool_use 语义。tool_choice=none 不发送工具 schema。托管工具搜索未实现，不伪装成本地工具。
- Claude 别名先去除 [1m] 再精确匹配，避免错误回退到默认模型。
- native_desktop_settings 保留手动选择与无关设置，移除受管理别名的固定压缩覆盖和全局 effort 环境覆盖；ENABLE_TOOL_SEARCH=auto 允许 SDK 按需启用发现。
- optimize-claude-desktop.py 默认仅预览，--apply 要求退出 CC Switch；备份数据库与设置后更新全局、会话隔离副本及当前 gateway profile。它不修改账号保存的模型/思考选择。
- 可选的 --clear-legacy-effort-policy 只尝试清理旧 Windows max 初始默认值；受保护时保留原策略并报告，不提权、不关闭安全检查。

39 项 Node、12 项 Python 检查通过；真实 CB/WB 工具引用往返、Claude Code 2.1.303 MCP 工具发现和 MiniMax/GLM 后缀路由请求通过。CLI 不等于 Desktop 视觉验收。

最近聊天还存在独立的 Cowork junction 隔离环境故障、安全分类服务不可用，以及本地后端曾离线而触发 Desktop 最多十次重试的问题。修路由不会自动修复隔离环境或安全服务。不能绕过这些保护来宣称优化成功。

官方协议：[工具搜索](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)。
