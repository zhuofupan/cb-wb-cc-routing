# Codex 应用：配置与人工验收

本页讨论本地 Codex 应用。Claude Desktop、Claude CLI、Codex CLI 与端点测试的结果分别记录，不能互相替代。目前新增配置和离线回归已完成，Codex 应用交互仍待用户操作验收。

## 配置

CC Switch 的 **Codex** 页每厂商一张卡片：CodeBuddy、WorkBuddy、DeepSeek。更新既有 ID，不为每模型新建供应商。

```powershell
# 生成目录，不改数据库或活动配置
python scripts/register-ccswitch-providers.py --prepare-only
# 从托盘退出 CC Switch，并安全设置各厂商凭据后注册
python scripts/register-ccswitch-providers.py --provider all
```

目录模板默认来自本机 `~/.codex/models_cache.json`，可用 `--template` 指定兼容目录。生成 CB/WB 各九模型、DeepSeek 两模型，沿用 `CB·名称·窗口` / `WB·名称·窗口`。DeepSeek 声明窗口为 1,048,576，Hy4 为 960,000，其他当前腾讯模型为 1,000,000。保留客户端 95% 有效窗口预算以容纳开销；目录和标签不是满窗口负载证明。

默认 MiniMax-M3.1-Flash / DeepSeek Flash，effort=max。Hy4、Step-5 的目录最高为 high，腾讯网关也将请求限制为 high。未声明完整 effort 范围的模型仍只有“max 请求获接受”的证据。

脚本备份数据库，保留卡片选中状态、认证数据和无关元数据。模板保留当前配置的插件、MCP、skills、项目与安全设置，不修改活动 `config.toml` 或 `auth.json`。切换前确认 CC Switch 的“非接管切换时保留官方登录”已开启。

第三方 provider 使用 `wire_api="responses"`、`requires_openai_auth=false`，使用自己的 bearer token；旧文档“必须强制 OpenAI 认证/清空官方登录”的结论已撤回。内联 token 只存本机模板；手写配置优先用 `env_key`，不要提交真实 token。

DeepSeek 使用官方原生 Responses；腾讯两厂商经过本地网关。关闭不支持的 WebSocket 和远程压缩，使用本地压缩。切换后重启 Codex，创建**新会话**，先核对菜单。

## 工具与插件

文件、命令、补丁和 MCP 由客户端执行。适配器保留命名空间、custom apply_patch、工具结果图片和流式事件，已有离线回归；模型能否在实际应用正确使用仍需验收。Skills/MCP 不代表所有云端 App 服务自动可用。

腾讯网关不实现 OpenAI 托管 `web_search`，当前模板关闭该项，避免普通聊天携带不支持的工具而失败。这不禁用已安装的搜索/抓取 MCP，也不代表内置搜索已打通。DeepSeek Pro 官方另有部分原生搜索支持，当前共用保守模板未开启，需单独验收。

优先测试用户已安装的 Codex 插件。可选 WorkBuddy MCP 仍需 WorkBuddy 登录和对应额度；聊天 CB key 不能替代该认证。原生工具失败应单独记录，不能以备用工具成功覆盖失败。

## 用户配合步骤

1. CC Switch **Codex** 页启用 CodeBuddy，重启 Codex，创建本地新会话。选择 `CB·MiniMax-M3.1-Flash·1M`，保持默认思考档位。
2. 用独立测试目录完成文本、读文件、执行命令、apply_patch、读图，并保存结果。以真实文件和工具返回验收。
3. 其余模型逐一在新会话重复基础测试；DeepSeek Pro 跳过读图。核对 Hy4 为 high/960k、Step-5 为 high/1M，其余 max/对应窗口。
4. 用代表模型单独测试搜索插件、网页抓取、一个常用插件/Skill；生图单独记录工具、认证和产物，避免重复付费。
5. 切 WorkBuddy、DeepSeek，重启后重复。失败时停在该步骤，收集错误，不标记后续项目通过。

用户操作后可采集本地证据：

```powershell
python scripts/collect-codex-evidence.py --marker YOUR_UNIQUE_TEST_MARKER --output codex-evidence.json
```

仅检查最近 100 个 rollout 中含测试标记的用户消息，保存模型、effort、工具名和完成事件，不保存完整对话、工具输出或凭据。工具调用不证明执行成功，须结合文件产物和用户看到的结果。没有进行满窗口负载测试。

## 官方参考

- [Codex 配置参考](https://developers.openai.com/codex/config-reference)：provider、目录、认证和能力。
- [Codex 高级配置](https://developers.openai.com/codex/config-advanced)：本地自定义配置范围。
- [DeepSeek Responses API](https://api-docs.deepseek.com/api/create-response/)：原生图像和工具兼容范围。
