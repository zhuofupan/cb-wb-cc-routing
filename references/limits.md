# 适配器的已知限制

发布这些是为了**别误以为支持**。都是上游能力所限，不是没写。

## 转换层主动丢弃的东西

| 项 | 处理 | 原因 |
| --- | --- | --- |
| **thinking / redacted_thinking** | 丢弃，不回传 | 上游推理没有可验证签名，codec 不伪造 `signature` |
| `cache_control` | 丢弃 | 上游无 prompt caching |
| `top_k`、`metadata`、`service_tier` | 忽略 | 上游无对应 |
| `count_tokens` | **字符数估算** | 上游无计数接口 |

**thinking 不回传的后果**：多轮工具调用中，模型看不到自己的上一轮思考。
这是最影响实际效果的一条。

`count_tokens` 估算的后果：Claude Code 的上下文用量条会偏，但不影响对话。

## 只验过两个模型

逐个实测的只有 `deepseek-v4.1-flash` 与 `deepseek-v4-pro`。
其余 WorkBuddy 模型只做了目录发现，未逐个消耗额度试跑。

## 模型自身的身份约束（2026-10-20 后已复测：未复现）

⚠️ 早期记录：**`mimo-v2.6-pro` 自称「小米的 AI 助手 MiMo」**，收到带 `Read` 工具的请求
直接拒答（`stop_reason=end_turn`，内容是「无法读取您本地系统的文件……超出了我的权限」）。

**但后续复测四个场景全部正常，拒答未能复现**：

| 场景 | 结果 |
| --- | --- |
| 纯对话 | 正常 |
| 带 `Read` 工具 | `stop_reason=tool_use`，正确调用 |
| 回灌 `tool_result` 后下一轮 | 正确复述文件内容 |
| 带编码 agent system + `Read`/`Bash`/`Edit` 三工具 | 正确 `tool_use` |

可能的原因：上游模型更新，身份约束已松动；或早期测试时适配器尚未加
`CHANNEL_MARKERS`，实际触发的是 11128 渠道检查，与模型身份无关。

**结论**：mimo **可以再试**，但上面的复测是**直连适配器**做的，不是真实 `claude -p`。
用之前建议在真实客户端里跑一次「读文件」确认；若仍拒答，用 `WB_DUMP=1` 抓完整请求再定位。

其余已验证能正常跑工具调用：`deepseek-v4-pro` / `space-bunny` / `kimi-k3-2`。


## WorkBuddy 通路的稳定性依赖

本地 WorkBuddy 转换是**试用适配，非腾讯官方 Codex 集成**：

- 依赖客户端登录接口，**客户端升级可能要求更新 DSH 源码**。
- 工具定义直接展开，不提供上游原生延迟工具发现；支持函数和原始文本工具。
- 未验收：桌面版完整交互、图像、全部 MCP/应用工具、多代理、长上下文压缩、断线恢复。
- 不实现 `/responses/compact`、远端响应存储、Responses WebSocket；
  **不把未知接口伪装为成功**。
- 工具轮推理重放缓存只在进程内，**服务重启不保留**。
- 账号、额度和上游模型限制仍适用；不做多账号池或自动换号。

## Cowork 侧

- Cowork 只认 **MSIX 安装版**。Squirrel 版（`%LOCALAPPDATA%\AnthropicClaude\app-*`）
  命中前端 `case "msix_required"`，界面显示「Cowork 需要更新的安装」。
  **Squirrel 版再新也不行** —— 是安装形态问题，不是版本号问题。
  修法：`winget install --id 9P6K58THS811 --source msstore --force`。
- ⚠️ 早先看到的 `workspace VM not supported (status=unsupported)` 与
  `rootfs.vhdx missing` 是 Squirrel 版拿不到 MSIX 授权链路的表现，
  **不是机器不支持虚拟化**（判断已更正）。
- 这条通路依赖模型自身的工具调用稳定性。

## 上游来源

- DSH 插件：https://github.com/corrinehu/dsh-workbuddy-connect （MIT）
- 官方 DeepSeek Codex 指南：https://api-docs.deepseek.com/quick_start/agent_integrations/codex/
