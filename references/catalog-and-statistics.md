# 模型目录、默认档位与运行统计

CodeBuddy / WorkBuddy 显示名统一使用 `cb/ 模型 (倍率x) · 窗口`、`wb/ 模型 (倍率x) · 窗口`。Hy4、Step-5 和 Xiaomi MiMo 已移除，新增 GLM-5.3-FlashX。三款在 Codex 目录中都提供 low/medium/high/xhigh/max 五档，默认档取上游 defaultEffort（DeepSeek/GLM high，MiniMax max）。目录说明标注每一档真正发送的上游档位；网关默认 client 策略尊重手动选择。请求被接受不代表供应商内部算力已验证。客户端启动时加载目录，更新后应完全重开 Codex，再检查切换模型后的强度显示。

网关启动时和每小时刷新一次目录：CodeBuddy 读取 `~/.codebuddy/local_storage/entry_*.info` 中最近的有效模型目录；WorkBuddy 使用既有认证客户端读取账号模型接口。只有已选型号的明确上下文、思考档位、billing.credits 倍率元数据会更新；新增型号只列入提示，不自动加入，缺失字段保留已知配置。本机或用户未安装 CodeBuddy CLI、没有账号缓存时继续使用配置目录。可用 `catalogCacheDir` 指定其他缓存目录。

配置 `codexCatalog` 为该厂商的 Codex JSON 目录路径后，会同步名称、上下文、五档列表和默认档位；相对路径从网关 settings 文件所在目录解析。使用 `refreshCatalog: false` 可关闭自动刷新。刷新失败保留当前服务，日志仅输出错误类型；目录缺失不会创建任意新配置。

认证后的 `GET /v1/models?refresh=1` 可立即刷新。`GET /v1/stats` 返回按模型累计的请求数、错误数、耗时毫秒总量、输入/输出/缓存 token、最近实际发送档位，以及目录来源、刷新时间和发现的新模型 ID。统计只在内存保存，重启清零，不含 key、提示词、对话和工具参数；未认证请求及转换前拒绝的无效请求不计入模型推理统计。上游未提供 usage 时相关 token 不累加，不能据此推断实际用量为零。

默认 `effortPolicy: "client"`：客户端选择优先，未发送时按“客户端+模型”沿用上次显式选择。`highest` 只在要求永远最强时使用。Codex 目录必须同时列出全部客户端档位，不能只改标签。已有聊天可能保留旧的档位；应用内显示仍需验收。


2026-10-21：适配器另将逐请求用量写入 `~/.cc-switch/buddy-usage.jsonl`，用于用量看板的上游实记口径。只存 ID、时间、账户渠道、模型、协议、状态和数字用量，不存密钥或对话；`usage.credit` 缺失时保留 null，不能视作零扣费。配置 `usageLedger` 可改位置或设为 false 禁用。此账本包含直连适配器与 CC Switch 转发请求，不能再次与代理日志累加。Anthropic 输出输入 token 按总输入减缓存转换为未命中输入；内存统计仍将输入恢复为含缓存总数。
