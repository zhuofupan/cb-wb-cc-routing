# 2026-10-21：模型调整与测试结果

## 原生适配更新（最新）

- 本轮离线回归：Node 39 项、Python 12 项、Windows PowerShell 5.1 supervisor 检查通过；技能入口校验通过。
- Codex 目录保留官方模板指令；默认档与最高档分开，档位记忆跨网关重启保留。Codex 和 Desktop 均移除适配器固定压缩阈值，交给当前客户端原生策略。
- Responses 客户端 tool_search、Anthropic tool_reference 支持按需加载，保留具名工具和并行调用控制；不把托管工具伪装成本地函数。[Codex 细节](native-integration.md)、[Desktop 细节](claude-desktop-native.md)。
- CB/WB 真实 Anthropic 三轮工具引用往返通过；Claude Code 2.1.303 两条路由均完成 ToolSearch → MCP 调用。Codex CLI 0.163.0 两条路由均完成终端命令及结果回答。CLI 不代替 Desktop 视觉验收。
- 修复 [1m] 后缀绕过精确路由的问题；两条路由上的 MiniMax/GLM 后缀请求均发往对应上游 ID 并成功回答。
- 网关临时拒绝最多补试一次，取消终止等待，部分流不重放。此项不代表 Desktop 自己的外层重试已更改。
- 仍未验证满上下文容量、长会话实际压缩和修改前后同条件性能。Cowork junction、原生安全分类服务故障及受保护的 Windows 初始默认策略仍分别保留为限制。

## 较早的配置与用户验收

2026-10-21，用户明确确认“现在所有功能都测试好了”。此项记为用户对当前使用范围的客户端验收确认；下面的历史失败、旧型号记录和未执行的满 1M token 负载测试仍分别保留，不把该确认扩写为未记录的逐功能矩阵。

- cb/wb 默认仅三款：DeepSeek-V4.1-Flash → MiniMax-M3.1-Flash → GLM-5.3-FlashX；初始模型为 DS。Kimi、GLM-5.3 仅按明确请求配置，目录刷新不会自动加回未选模型。
- 标签统一为 `cb/ 模型 (倍率x) · 1M`、`wb/ 模型 (倍率x) · 1M`；修复旧分隔符乱码以及刷新后重复前缀、倍率的问题。
- MiniMax 的菜单别名改为 `claude-fable-5-1`，避免旧 `claude-haiku-5` 的自动审批能力限制。内置 Claude Code 返回 supportsAutoMode=true，切换 auto 成功；代理文本实测确认真实模型仍为 MiniMax。
- 用户测试记录曾将标为 DS 的 `claude-sonnet-5` 实际路由到 Kimi。现已统一标签和路由。Clash 运行连接显示腾讯接口走 DIRECT，两种连接探针响应头约 125ms；该结果不能外推所有网络和长请求耗时。
- Claude 的 MAX 与 Codex 的 xhigh 分开配置，网关仍强制上游 max。Code 新建页最终采用官方 Windows 用户级 effortLevel=max 策略；Cowork 独立保存逐模型档位，保留 1M 配置。详见[思考档位](reasoning-effort.md)。
- 持久用量账本记录上游数字用量，修复 Anthropic 输入 token 对缓存的重复计算；离线测试覆盖账本内容和协议转换。缺失的信用额度保持 null，不记为零。该账本不包含会话正文或凭据。
- 发布前回归：Node 16 项、Python 8 项通过；技能结构校验通过；Code 策略脚本通过 Windows PowerShell 的 -WhatIf 无修改预览，Git 差异格式检查通过。本次发布整理未重复消耗额度执行在线矩阵。

## 历史：五模型菜单与新增 FlashX

cb/wb 各五款，按用户指定顺序：DeepSeek-V4.1-Flash 0.11x、MiniMax-M3.1-Flash 0.08x、GLM-5.3-FlashX 0.19x、GLM-5.3 0.69x、Kimi-K3 1.62x。各声明 1M；名称格式为 `cb·模型 (倍率x) · 1M` / `wb·模型 (倍率x) · 1M`。移除 Xiaomi MiMo，不继续为其增加适配补丁；已有共享协议兼容保留。

- 账号目录确认 FlashX 的 ID 为 `glm-5.3-flashx`，支持图片、最高档 max，倍率来自 `billing.credits`。这些是目录声明，不等于满窗口或完整能力实测。
- Node 14 项、Python 8 项回归通过；覆盖菜单顺序、去除 MiMo、新增 FlashX、倍率刷新与名称重复刷新、配置保留及协议转换。
- cb/wb 各完成一条 FlashX Responses 文本请求和一条 Anthropic 强制函数调用，共四条真实请求通过。未执行模型返回的工具代码；没有完成 FlashX 的识图、工具结果回灌、真实客户端完整验收。
- 本机两条网关部署重启后，分别核对 `/v1/models` 与 Codex 目录的五款顺序、倍率、1M 和 xhigh；各补测一条 `claude-haiku-5-5` 别名文本请求，统计确认路由到 `glm-5.3-flashx` 且实际 effort=max。本轮共六条真实请求通过。
- 退出 CC Switch 后已备份并更新两厂商 Desktop 卡片及当前 Desktop profile，核对五款顺序与倍率；保留原有供应商选中状态、认证和其他 Desktop 设置。CC Switch 已重新启动，客户端菜单仍待目视验收。
- Desktop 别名按字典序分配给上述五款，避免 profile 按别名排序后改变菜单顺序；Codex 使用 0–4 的 priority。别名及真实 ID 同步更新，不能把旧聊天的原生别名当作固定模型身份。

## 本轮 R3 聊天与落盘记录

已检查 Codex / WorkBuddy 的 DeepSeek、MiniMax、GLM、Kimi、MiMo 五个 R3 聊天及对应报告。五款均记录了本地读取/计算、直接识图、非 WorkBuddy 搜索/抓取、WorkBuddy 搜索、文件编辑回读。共同失败项为 WorkBuddy 抓取 OpenAI 配置文档：HTTP 403 / code 15021，`domain rejected by via routing policy`；搜索摘要不能替代抓取成功。该失败不归因为某一个聊天模型。

R3 报告未记录最终输出中的异常乱码，但不能据此否定用户报告的 MiMo 适配问题。模型 UI、实际档位仍缺目视证据；Claude Desktop Code 的两厂商完整矩阵仍未完成。R3 原清单保留为历史，MiMo 项已作废；当前菜单以 README 为准。

## 较早一轮修复（历史）

当前 cb/wb 菜单各五款：DeepSeek-V4.1-Flash、GLM-5.3、Kimi-K3、MiniMax-M3.1-Flash、Xiaomi MiMo-V2.6-Pro。DeepSeek Pro、Space-Bunny、Hy4、Step-5 已移除；DeepSeek 官方供应商只保留 Flash。目录声明的 1M 窗口没有做满窗口负载验证。

## 已完成的修复

- 模型名称前缀统一为 `cb·` / `wb·`；更新 Codex 目录、Desktop 映射和配置示例。
- 当前 Codex 桌面默认启用档位列表不含 max；旧目录仅提供 max 时会被界面过滤。cb/wb 静态目录与自动同步改用 xhigh（极高），highest 网关策略继续发送上游 max；不是对不同厂商内部计算量的等价承诺。
- MiMo 曾以自由文本返回自定义工具参数；转换器现在同时支持 JSON input 包装和原始输入。
- MiMo 实际记录中，正文重复出现 `<tool_call><function=exec>` 和工具代码，同时还有正式工具调用。共享流处理过滤这类标记，保留正式调用；只有伪工具文本时显式报错，不执行正文代码。
- 新增已选模型目录刷新和按模型请求/错误/耗时/缓存 token 统计；不自动添加未选型号。
- 本机 Codex 已接入 WorkBuddy 原生 MCP，并同步本地配置与 CC Switch 的 Codex 卡片。公开安装方式见 [工具说明](tools-and-plugins.md)。

## 证据分层

### 2026-10-21 输出预算回归

- 根因：`responses-codec.mjs` 在 Codex 未传 `max_output_tokens` 时固定发 16384，`anthropic-codec.mjs` 在 Claude 未传 `max_tokens` 时固定发 8192。两次真实 Codex turn 都在 16,385 output tokens 处结束为 `max_output_tokens`，当时输入仅约 184k / 950k。
- 修正：改为读取账号目录的逐模型 `maxOutputTokens`（DeepSeek 128000、MiniMax 128000、GLM 131072），显式客户端值仍优先，并按剩余窗口收敛。
- 修正：Codex 目录自动压缩阈值改为 `窗口 − 输出上限 − 32000`，`context_window` / `max_context_window` 保持模型声明的 1M；Claude 的 `autoCompactWindow` 按别名路由到对应模型计算，不再统一 1M。
- 真实接口：三款分别用各自声明上限发 `max_tokens`，均 HTTP 200；本机 CodeBuddy 网关重启后，MiniMax Responses 探针返回 completed，日志记录 `max_tokens: 128000`。
- 长输出：2026-10-21 经本机 18792 发 `max_output_tokens: 60000`，上游 `completed`，`output_tokens: 17708`（其中推理 14107），超过旧 16384 上限后正常结束，不再报 `max_output_tokens`。另有 `max_output_tokens: 24000` 探针以 `incomplete / max_output_tokens` 结束，usage 恰为 24000，证明客户端预算被如实执行而非代理另加 16K 限制。
- 六款路由：重启后的 18792 上，`deepseek-v4.1-flash`、`minimax-m3.1-flash`、`glm-5.3-flashx` 各发一条 Responses 请求均 `completed`；日志记录 `max_tokens` 分别为 128000 / 128000 / 131072。
- 三别名经 CC Switch：`claude-fable-5 → deepseek-v4.1-flash`、`claude-fable-5-1 → minimax-m3.1-flash`、`claude-haiku-5-5 → glm-5.3-flashx` 经 `15721/claude-desktop/v1/messages` 均 HTTP 200 并返回 OK。


| 层级 | 当前结果 | 限制 |
|---|---|---|
| 离线回归 | Node 21 项、Python 9 项通过 | 本地假上游，不证明真实客户端全部功能 |
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
