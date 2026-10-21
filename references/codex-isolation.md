# Codex 应用：配置与人工验收

本页讨论本地 Codex 应用。Claude Desktop、Claude CLI、Codex CLI 与端点测试的结果分别记录，不能互相替代。当前默认三模型的配置和离线回归已完成；2026-10-21 用户确认当前客户端功能测试完成，详见验证记录。

## 配置

CC Switch 的 **Codex** 页每厂商一张卡片：CodeBuddy、WorkBuddy、DeepSeek。更新既有 ID，不为每模型新建供应商。

```powershell
# 生成目录，不改数据库或活动配置
python scripts/register-ccswitch-providers.py --prepare-only
# 从托盘退出 CC Switch，并安全设置各厂商凭据后注册
python scripts/register-ccswitch-providers.py --provider all
```

目录模板默认来自本机 `~/.codex/models_cache.json`，可用 `--template` 指定兼容目录。生成 cb/wb 各三模型、DeepSeek 官方一款 Flash，沿用 `cb/ 名称 (倍率x) · 窗口` / `wb/ 名称 (倍率x) · 窗口`。DeepSeek 声明窗口为 1,048,576，默认三款腾讯模型为 1,000,000。保留客户端 95% 有效窗口预算以容纳开销；目录和标签不是满窗口负载证明。

默认 DeepSeek Flash；cb/wb 客户端为 xhigh（极高），网关最高策略发送 max。官方 DeepSeek 直连保持 max。未声明完整 effort 范围的模型仍只有“max 请求获接受”的证据。

脚本备份数据库，保留卡片选中状态、认证数据和无关元数据。模板保留当前配置的插件、MCP、skills、项目与安全设置，不修改活动 `config.toml` 或 `auth.json`。切换前确认 CC Switch 的“非接管切换时保留官方登录”已开启。

第三方 provider 使用 `wire_api="responses"`、`requires_openai_auth=false`，使用自己的 bearer token；旧文档“必须强制 OpenAI 认证/清空官方登录”的结论已撤回。内联 token 只存本机模板；手写配置优先用 `env_key`，不要提交真实 token。

DeepSeek 使用官方原生 Responses；腾讯两厂商经过本地网关。关闭不支持的 WebSocket，当前配置继续使用 Codex 本地压缩。网关另外支持摘要式 `/responses/compact` 与 `compaction_trigger`，其令牌只能交回同一共享网关，见[限制](limits.md)。增加接口不会自动切换现有会话的压缩方式。切换供应商后重启 Codex，创建**新会话**，先核对菜单。

## 工具与插件

文件、命令、补丁和 MCP 由客户端执行。适配器保留命名空间、custom apply_patch、工具结果图片和流式事件，已有离线回归；模型能否在实际应用正确使用仍需验收。Skills/MCP 不代表所有云端 App 服务自动可用。

腾讯网关不实现 OpenAI 托管 `web_search`，当前模板关闭该项，避免普通聊天携带不支持的工具而失败。这不禁用已安装的搜索/抓取 MCP，也不代表内置搜索已打通。DeepSeek Pro 官方另有部分原生搜索支持，当前共用保守模板未开启，需单独验收。

优先测试用户已安装的 Codex 插件。可选 WorkBuddy MCP 仍需 WorkBuddy 登录和对应额度；聊天 CB key 不能替代该认证。原生工具失败应单独记录，不能以备用工具成功覆盖失败。

## 用户配合步骤

完整逐模型步骤与可直接复制的提示词见 [R3 清单](manual-acceptance-r3.md)，旧清单中的已移除型号应跳过。先在 CC Switch 的 Codex 页选择厂商，完全重开 Codex，每款新建聊天。当前 cb/wb 默认各三款，名称使用小写 cb/wb 前缀，目录只提供 xhigh（极高）；Kimi、GLM-5.3 不默认配置。模型不能凭自述证明 UI、实际路由或内部算力。

用户操作后可采集本地证据：

```powershell
python scripts/collect-codex-evidence.py --marker YOUR_UNIQUE_TEST_MARKER --output codex-evidence.json
```

仅检查最近 100 个 rollout 中含测试标记的用户消息，保存模型、effort、工具名和完成事件，不保存完整对话、工具输出或凭据。工具调用不证明执行成功，须结合文件产物和用户看到的结果。没有进行满窗口负载测试。

## 官方参考

- [Codex 配置参考](https://developers.openai.com/codex/config-reference)：provider、目录、认证和能力。
- [Codex 高级配置](https://developers.openai.com/codex/config-advanced)：本地自定义配置范围。
- [DeepSeek Responses API](https://api-docs.deepseek.com/api/create-response/)：原生图像和工具兼容范围。
