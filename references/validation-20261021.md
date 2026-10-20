# 2026-10-21：五模型与协议修复验证

当前 cb/wb 菜单各五款：DeepSeek-V4.1-Flash、GLM-5.3、Kimi-K3、MiniMax-M3.1-Flash、Xiaomi MiMo-V2.6-Pro。DeepSeek Pro、Space-Bunny、Hy4、Step-5 已移除；DeepSeek 官方供应商只保留 Flash。目录声明的 1M 窗口没有做满窗口负载验证。

## 已完成的修复

- 模型名称前缀统一为 `cb·` / `wb·`；更新 Codex 目录、Desktop 映射和配置示例。
- 当前 Codex 桌面默认启用档位列表不含 max；旧目录仅提供 max 时会被界面过滤。cb/wb 静态目录与自动同步改用 xhigh（极高），highest 网关策略继续发送上游 max；不是对不同厂商内部计算量的等价承诺。
- MiMo 曾以自由文本返回自定义工具参数；转换器现在同时支持 JSON input 包装和原始输入。
- MiMo 实际记录中，正文重复出现 `<tool_call><function=exec>` 和工具代码，同时还有正式工具调用。共享流处理过滤这类标记，保留正式调用；只有伪工具文本时显式报错，不执行正文代码。
- 新增已选模型目录刷新和按模型请求/错误/耗时/缓存 token 统计；不自动添加未选型号。
- 本机 Codex 已接入 WorkBuddy 原生 MCP，并同步本地配置与 CC Switch 的 Codex 卡片。公开安装方式见 [工具说明](tools-and-plugins.md)。

## 证据分层

| 层级 | 当前结果 | 限制 |
|---|---|---|
| 离线回归 | Node 13 项、Python 8 项通过 | 本地假上游，不证明真实客户端全部功能 |
| 真实接口 | cb/wb 各一条 MiMo 自定义工具调用、一条 MiniMax 中文/表情回复，共四条完成 | 代表性短探针；没有执行返回的模型代码 |
| 真实接口文本 | 四条响应无替换字符、无伪工具标记泄漏；MiMo 参数中的中文/表情完整 | 不是所有长回答均无异常的保证 |
| 上游档位 | 四条请求日志均为 max | 不证明供应商实际投入最高计算量 |
| 配置 | cb/wb 目录各五款、全为 xhigh；Desktop 卡片和当前 profile 各五款 | 配置核对不等于界面视觉验收 |
| WorkBuddy MCP | Codex CLI 识别启用；相同启动参数完成初始化并发现搜索、抓取、生图三个工具 | 新接入 Codex 后没有生成新图片，也没有完成应用内调用验收 |
| Codex 应用 R2 | CodeBuddy 的 MiMo、DeepSeek Flash 已生成计算/识图/写读记录 | Kimi 在错误的测试目录下缺素材，不能算完整通过；需要本轮统一目录复测 |
| Codex WorkBuddy、Claude Desktop Code | 历史上有代表性测试；当前五款完整矩阵待用户执行 R3 | 不用历史旧型号、HTTP 或 CLI 结果代替本轮验收 |
| Codex 官方生图 | 工具与官方说明已核对 | CC Switch 切到 cb/wb 后能否调用 GPT Image，尚未实际生成验证 |

WorkBuddy 生图是独立服务 `hunyuan-image-alpha`，与 Hy4 聊天模型无绑定；CodeBuddy 模型通过该 MCP 调用时，使用 WorkBuddy 认证和额度。Codex 官方生图是另一条通路，不声称仅有 cb key 就能获得官方图片权限。

## 下一轮人工验收

使用 [R3 完整测试清单](manual-acceptance-r3.md)：Codex WorkBuddy 五款、Claude Desktop Code 的 CodeBuddy 五款和 WorkBuddy 五款。先做 15 个无生图基础测试，再按需执行独立的生图测试。每项保留真实工具名、具体错误和产物；界面由用户核对。

公开记录仅包含脱敏结论，不包含账号登录、密钥、数据库、完整会话或带签名的图片 URL。
