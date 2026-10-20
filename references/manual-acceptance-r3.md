# cb-wb-cc-路由：三批完整人工验收 R3

日期：2026-10-21。取代 R2 的七模型清单。当前 cb/wb 各五款：DeepSeek Flash、GLM、Kimi、MiniMax、MiMo；Hy4、Step-5、DeepSeek Pro、Space-Bunny 不再测试。

本清单中的 Claude Code 指此前使用的 **Claude Desktop 桌面版的 Code 模式**；不是 Cowork 或独立 Claude CLI，三者的结果不能互相代替。

## 准备与切换顺序

1. 准备一个测试目录 `<测试目录>`，将仓库 `fixtures/input.txt`、`fixtures/vision.png` 复制到该目录根部。每次都打开这个目录，不要在相邻目录或仓库目录里误测。保留已有 results，不覆盖旧结果。
2. 第一批：CC Switch **Codex 页**启用 WorkBuddy，完全退出并重开 Codex，打开测试目录。依次选五款，每款新建聊天，复制对应提示词。
3. 第二批：CC Switch **Claude Desktop 页**启用 CodeBuddy，完全退出并重开 Claude Desktop，在 **Code 模式**打开测试目录。依次选五款，每款新建聊天。
4. 第三批：仍在 Claude Desktop 页切 WorkBuddy，完全重开 Claude Desktop，在 Code 模式重复五款。不要改独立 CLI 的供应商页来代替 Desktop 切换。
5. 同一厂商内只换模型和新建聊天，不需要每款重启。单款失败或卡住时记录错误后测下一款，不用逐条返回反馈。重试新建聊天，并在结果文件后加 attempt2，保留首次失败。

本轮不重复 Codex CodeBuddy 的五款基础矩阵；末尾有独立的 Codex cb/wb 官方生图探针，用于解决第三方聊天能否使用官方图片工具的问题。

## 用户目视记录（模型不能代填）

每款开始前记录：软件/模式、CC Switch 厂商、实际菜单名称、显示窗口、显示思考档位。Codex 五款预期均 xhigh（极高）、1M；Desktop 预期保持最高档 Max，菜单标签带 cb·/wb· 和 1M。UI 若不能选择 Max、只显示较低档或仍有已移除模型，如实记下，不把网关发送 max 当作 UI 已通过。

界面不一致可以继续测工具，但要保留该项失败。1M 标签、短请求成功与最高档字符串，均不证明满窗口容量或内部算力。

## 基础测试范围

以下 15 段均可独立复制，无须改模型名或文件名。每段包括中文/表情、文件读取、真实命令计算、直接看图、Skill、非 WorkBuddy 的搜索/抓取工具、WorkBuddy MCP 搜索/抓取、文件创建/编辑/回读和异常记录。**基础测试不生图**。

客户端原生 WebSearch/WebFetch、其他插件与 WorkBuddy MCP 必须分栏记录；某条失败时，其他通路成功不能覆盖它。工具未提供写“未提供”，工具调用报错保留具体错误，不自动绕过权限。


## Codex / WorkBuddy：五款基础测试


### 1. wb·DeepSeek-V4.1-Flash·1M

```text
验收编号：ROUTE-R3-CODEX-WB-deepseek-v4.1-flash
软件/厂商：Codex / WorkBuddy；预期模型：deepseek-v4.1-flash；预期档位：xhigh（极高），网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 优先使用 apply_patch创建 results/CODEX-WB-deepseek-v4.1-flash-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CODEX-WB-deepseek-v4.1-flash-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CODEX-WB-deepseek-v4.1-flash-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


### 2. wb·GLM-5.3·1M

```text
验收编号：ROUTE-R3-CODEX-WB-glm-5.3
软件/厂商：Codex / WorkBuddy；预期模型：glm-5.3；预期档位：xhigh（极高），网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 优先使用 apply_patch创建 results/CODEX-WB-glm-5.3-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CODEX-WB-glm-5.3-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CODEX-WB-glm-5.3-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


### 3. wb·Kimi-K3·1M

```text
验收编号：ROUTE-R3-CODEX-WB-kimi-k3-2
软件/厂商：Codex / WorkBuddy；预期模型：kimi-k3-2；预期档位：xhigh（极高），网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 优先使用 apply_patch创建 results/CODEX-WB-kimi-k3-2-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CODEX-WB-kimi-k3-2-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CODEX-WB-kimi-k3-2-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


### 4. wb·MiniMax-M3.1-Flash·1M

```text
验收编号：ROUTE-R3-CODEX-WB-minimax-m3.1-flash
软件/厂商：Codex / WorkBuddy；预期模型：minimax-m3.1-flash；预期档位：xhigh（极高），网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 优先使用 apply_patch创建 results/CODEX-WB-minimax-m3.1-flash-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CODEX-WB-minimax-m3.1-flash-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CODEX-WB-minimax-m3.1-flash-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


### 5. wb·Xiaomi MiMo-V2.6-Pro·1M

```text
验收编号：ROUTE-R3-CODEX-WB-mimo-v2.6-pro
软件/厂商：Codex / WorkBuddy；预期模型：mimo-v2.6-pro；预期档位：xhigh（极高），网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 优先使用 apply_patch创建 results/CODEX-WB-mimo-v2.6-pro-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CODEX-WB-mimo-v2.6-pro-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CODEX-WB-mimo-v2.6-pro-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


## Claude Desktop Code / CodeBuddy：五款基础测试


### 1. cb·DeepSeek-V4.1-Flash·1M

```text
验收编号：ROUTE-R3-CLAUDE-CODE-CB-deepseek-v4.1-flash
软件/厂商：Claude Desktop Code / CodeBuddy；预期模型：deepseek-v4.1-flash；预期档位：客户端最高档 Max；网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 使用客户端实际提供的 Write/Edit（如提供 apply_patch 也可）创建 results/CLAUDE-CODE-CB-deepseek-v4.1-flash-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CLAUDE-CODE-CB-deepseek-v4.1-flash-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CLAUDE-CODE-CB-deepseek-v4.1-flash-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


### 2. cb·GLM-5.3·1M

```text
验收编号：ROUTE-R3-CLAUDE-CODE-CB-glm-5.3
软件/厂商：Claude Desktop Code / CodeBuddy；预期模型：glm-5.3；预期档位：客户端最高档 Max；网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 使用客户端实际提供的 Write/Edit（如提供 apply_patch 也可）创建 results/CLAUDE-CODE-CB-glm-5.3-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CLAUDE-CODE-CB-glm-5.3-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CLAUDE-CODE-CB-glm-5.3-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


### 3. cb·Kimi-K3·1M

```text
验收编号：ROUTE-R3-CLAUDE-CODE-CB-kimi-k3-2
软件/厂商：Claude Desktop Code / CodeBuddy；预期模型：kimi-k3-2；预期档位：客户端最高档 Max；网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 使用客户端实际提供的 Write/Edit（如提供 apply_patch 也可）创建 results/CLAUDE-CODE-CB-kimi-k3-2-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CLAUDE-CODE-CB-kimi-k3-2-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CLAUDE-CODE-CB-kimi-k3-2-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


### 4. cb·MiniMax-M3.1-Flash·1M

```text
验收编号：ROUTE-R3-CLAUDE-CODE-CB-minimax-m3.1-flash
软件/厂商：Claude Desktop Code / CodeBuddy；预期模型：minimax-m3.1-flash；预期档位：客户端最高档 Max；网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 使用客户端实际提供的 Write/Edit（如提供 apply_patch 也可）创建 results/CLAUDE-CODE-CB-minimax-m3.1-flash-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CLAUDE-CODE-CB-minimax-m3.1-flash-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CLAUDE-CODE-CB-minimax-m3.1-flash-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


### 5. cb·Xiaomi MiMo-V2.6-Pro·1M

```text
验收编号：ROUTE-R3-CLAUDE-CODE-CB-mimo-v2.6-pro
软件/厂商：Claude Desktop Code / CodeBuddy；预期模型：mimo-v2.6-pro；预期档位：客户端最高档 Max；网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 使用客户端实际提供的 Write/Edit（如提供 apply_patch 也可）创建 results/CLAUDE-CODE-CB-mimo-v2.6-pro-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CLAUDE-CODE-CB-mimo-v2.6-pro-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CLAUDE-CODE-CB-mimo-v2.6-pro-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


## Claude Desktop Code / WorkBuddy：五款基础测试


### 1. wb·DeepSeek-V4.1-Flash·1M

```text
验收编号：ROUTE-R3-CLAUDE-CODE-WB-deepseek-v4.1-flash
软件/厂商：Claude Desktop Code / WorkBuddy；预期模型：deepseek-v4.1-flash；预期档位：客户端最高档 Max；网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 使用客户端实际提供的 Write/Edit（如提供 apply_patch 也可）创建 results/CLAUDE-CODE-WB-deepseek-v4.1-flash-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CLAUDE-CODE-WB-deepseek-v4.1-flash-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CLAUDE-CODE-WB-deepseek-v4.1-flash-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


### 2. wb·GLM-5.3·1M

```text
验收编号：ROUTE-R3-CLAUDE-CODE-WB-glm-5.3
软件/厂商：Claude Desktop Code / WorkBuddy；预期模型：glm-5.3；预期档位：客户端最高档 Max；网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 使用客户端实际提供的 Write/Edit（如提供 apply_patch 也可）创建 results/CLAUDE-CODE-WB-glm-5.3-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CLAUDE-CODE-WB-glm-5.3-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CLAUDE-CODE-WB-glm-5.3-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


### 3. wb·Kimi-K3·1M

```text
验收编号：ROUTE-R3-CLAUDE-CODE-WB-kimi-k3-2
软件/厂商：Claude Desktop Code / WorkBuddy；预期模型：kimi-k3-2；预期档位：客户端最高档 Max；网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 使用客户端实际提供的 Write/Edit（如提供 apply_patch 也可）创建 results/CLAUDE-CODE-WB-kimi-k3-2-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CLAUDE-CODE-WB-kimi-k3-2-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CLAUDE-CODE-WB-kimi-k3-2-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


### 4. wb·MiniMax-M3.1-Flash·1M

```text
验收编号：ROUTE-R3-CLAUDE-CODE-WB-minimax-m3.1-flash
软件/厂商：Claude Desktop Code / WorkBuddy；预期模型：minimax-m3.1-flash；预期档位：客户端最高档 Max；网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 使用客户端实际提供的 Write/Edit（如提供 apply_patch 也可）创建 results/CLAUDE-CODE-WB-minimax-m3.1-flash-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CLAUDE-CODE-WB-minimax-m3.1-flash-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CLAUDE-CODE-WB-minimax-m3.1-flash-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


### 5. wb·Xiaomi MiMo-V2.6-Pro·1M

```text
验收编号：ROUTE-R3-CLAUDE-CODE-WB-mimo-v2.6-pro
软件/厂商：Claude Desktop Code / WorkBuddy；预期模型：mimo-v2.6-pro；预期档位：客户端最高档 Max；网关最高策略预期发送 max。
请实际执行测试，不要只回复开工说明。只操作当前测试目录；不读凭据、父目录或无关配置，不改供应商/权限/登录设置。系统提供的 Skill 可按要求读取；工具返回的图片可按返回路径查看。若有相关 Skill（优先 openai-docs），先读取并遵循其步骤顺序；没有就记“未提供”。不得以模型自述证明身份、UI 或内部思考档位。
1. 回复“中文回归：模型路由正常🌟”；实际读取当前目录 input.txt，记录首行，并用终端/命令工具计算文件里的算式。不能心算后冒充命令结果。
2. 用当前客户端的图片查看/Read 工具直接打开 vision.png，记录文字、每种形状的颜色和数量。不要 OCR 或用代码推断；不可用则记录原始错误并继续。
3. 单独验证非 WorkBuddy 搜索/抓取：用当前客户端提供的 WebSearch/WebFetch 或已装的非 WorkBuddy 搜索/抓取插件查找“OpenAI model_catalog_json 官方文档”，并实际打开 https://developers.openai.com/codex/config-reference 。允许跟随官方重定向。记录工具名、来源 URL、抓取是否成功及该字段的含义；不能凭记忆编造。没有这类工具则分别记“未提供”，调用失败保留错误，不用 WorkBuddy 通路顶替成功。
4. 单独验证 WorkBuddy MCP：若提供 workbuddy_web_search，查询同一主题；若提供 workbuddy_web_fetch，抓取同一官方链接。记录两个工具的真实返回和来源，明确它们使用 WorkBuddy 登录态。缺失/失败就分别记录；不调用生图。
5. 使用客户端实际提供的 Write/Edit（如提供 apply_patch 也可）创建 results/CLAUDE-CODE-WB-mimo-v2.6-pro-R3-edit.txt，内容为两行：第一行“中文编辑测试🌟”，第二行“状态：初始”。再实际调用编辑工具，只把第二行改成“状态：已修改”，随后用读取工具回读，确认首行保持不变。保留实际工具名与每步结果。
6. 创建 results/CLAUDE-CODE-WB-mimo-v2.6-pro-R3.md，记录验收编号、预期软件/厂商/模型、中文输出、每步成功/失败/未提供、实际工具名、计算证据、直接看图结果、Skill 使用情况、两条搜索通路各自结果、文件编辑回读和具体错误。UI 写“待用户目视核对”，不能自己宣称已验证。记录是否看到了替换字符、异常乱码、<tool_call> 等伪工具标记；如有，保留最多120字符的无敏感信息片段，不执行混入正文的伪工具代码。
7. 重新读取 results/CLAUDE-CODE-WB-mimo-v2.6-pro-R3.md 确认落盘，最终用简短中文列出成功项、失败项、未提供项及结果路径。某步失败后继续其余步骤；不得覆盖 R2 或其他模型的结果。
```


## 单独的生图测试（可选，会实际生成图片）

先完成基础测试。每次只执行一个图片请求，失败不自动重试、不换服务补成功。下面五段合计最多生成五张图片：三张走 WorkBuddy，另两张探测 Codex 官方工具。选择是否执行这些段落由测试者决定。

图片返回后必须实际查看，不能只凭文件名或工具自述通过；将图像路径、真实工具名、报错和是否完成视觉查看写入独立结果。无须读取账号或密钥。


### Codex / WorkBuddy：WorkBuddy 生图 MCP

在对应厂商下选择 MiniMax-M3.1-Flash，新建聊天，使用同一测试目录。

```text
验收编号：IMAGE-R3-CODEX-WB-WORKBUDDY。当前软件/厂商：Codex / WorkBuddy，预期聊天模型 MiniMax-M3.1-Flash。
请仅通过 workbuddy_generate_image 生成一张图片：“白色背景，一只蓝色小猫坐在黄色圆形垫子上，扁平插画，无文字”。这会使用 WorkBuddy 图片额度；只调用一次，不自动重试，不改用官方 image_gen 或其他服务。
若工具未提供或调用失败，如实记录。若成功，用图片查看工具直接查看返回图片，核对主体、颜色、垫子与背景；无法查看就记未完成视觉验证。仅操作测试目录、系统 Skill 文件及工具返回的图片路径，不读凭据或修改配置。
将真实调用的工具名、成功/失败、返回的本地图片路径、视觉核对结果和错误写入 results/IMAGE-R3-CODEX-WB-WORKBUDDY.md，再回读。不要把服务调用成功当成图像内容已合格，不覆盖既有结果。
```


### Claude Desktop Code / CodeBuddy：WorkBuddy 生图 MCP

在对应厂商下选择 MiniMax-M3.1-Flash，新建聊天，使用同一测试目录。

```text
验收编号：IMAGE-R3-CLAUDE-CODE-CB-WORKBUDDY。当前软件/厂商：Claude Desktop Code / CodeBuddy，预期聊天模型 MiniMax-M3.1-Flash。
请仅通过 workbuddy_generate_image 生成一张图片：“白色背景，一只蓝色小猫坐在黄色圆形垫子上，扁平插画，无文字”。这会使用 WorkBuddy 图片额度；只调用一次，不自动重试，不改用官方 image_gen 或其他服务。
若工具未提供或调用失败，如实记录。若成功，用图片查看工具直接查看返回图片，核对主体、颜色、垫子与背景；无法查看就记未完成视觉验证。仅操作测试目录、系统 Skill 文件及工具返回的图片路径，不读凭据或修改配置。
将真实调用的工具名、成功/失败、返回的本地图片路径、视觉核对结果和错误写入 results/IMAGE-R3-CLAUDE-CODE-CB-WORKBUDDY.md，再回读。不要把服务调用成功当成图像内容已合格，不覆盖既有结果。
```


### Claude Desktop Code / WorkBuddy：WorkBuddy 生图 MCP

在对应厂商下选择 MiniMax-M3.1-Flash，新建聊天，使用同一测试目录。

```text
验收编号：IMAGE-R3-CLAUDE-CODE-WB-WORKBUDDY。当前软件/厂商：Claude Desktop Code / WorkBuddy，预期聊天模型 MiniMax-M3.1-Flash。
请仅通过 workbuddy_generate_image 生成一张图片：“白色背景，一只蓝色小猫坐在黄色圆形垫子上，扁平插画，无文字”。这会使用 WorkBuddy 图片额度；只调用一次，不自动重试，不改用官方 image_gen 或其他服务。
若工具未提供或调用失败，如实记录。若成功，用图片查看工具直接查看返回图片，核对主体、颜色、垫子与背景；无法查看就记未完成视觉验证。仅操作测试目录、系统 Skill 文件及工具返回的图片路径，不读凭据或修改配置。
将真实调用的工具名、成功/失败、返回的本地图片路径、视觉核对结果和错误写入 results/IMAGE-R3-CLAUDE-CODE-WB-WORKBUDDY.md，再回读。不要把服务调用成功当成图像内容已合格，不覆盖既有结果。
```


### Codex / CodeBuddy：官方 GPT Image 通路

在 CC Switch 的 Codex 页启用 CodeBuddy，重开 Codex，选择 MiniMax-M3.1-Flash，新建聊天。此项不要求修改或清空官方登录。

```text
验收编号：IMAGE-R3-CODEX-CB-OFFICIAL。当前聊天预期为 Codex / CodeBuddy / MiniMax-M3.1-Flash。
请使用 Codex 官方内置 image_gen 生成一张图片：“白色背景，一只蓝色小猫坐在黄色圆形垫子上，扁平插画，无文字”。只调用一次；不要调用 workbuddy_generate_image、API/CLI 后备、其他图片服务或程序绘制，也不申请读取凭据或改登录/供应商配置。
若当前没有 image_gen，明确记录“官方工具未提供”；有工具但权限、额度、网络或执行错误时，保留原始错误，不换通路掩盖失败。若成功，实际打开图片做视觉核对，记录真实工具名、图片产物路径和视觉结果；不要靠模型自述确认后端版本或额度扣费。
将结果写入 results/IMAGE-R3-CODEX-CB-OFFICIAL.md，再回读。此项用于验证第三方聊天下官方生图是否真的可用，不能预先写成通过。
```


### Codex / WorkBuddy：官方 GPT Image 通路

在 CC Switch 的 Codex 页启用 WorkBuddy，重开 Codex，选择 MiniMax-M3.1-Flash，新建聊天。此项不要求修改或清空官方登录。

```text
验收编号：IMAGE-R3-CODEX-WB-OFFICIAL。当前聊天预期为 Codex / WorkBuddy / MiniMax-M3.1-Flash。
请使用 Codex 官方内置 image_gen 生成一张图片：“白色背景，一只蓝色小猫坐在黄色圆形垫子上，扁平插画，无文字”。只调用一次；不要调用 workbuddy_generate_image、API/CLI 后备、其他图片服务或程序绘制，也不申请读取凭据或改登录/供应商配置。
若当前没有 image_gen，明确记录“官方工具未提供”；有工具但权限、额度、网络或执行错误时，保留原始错误，不换通路掩盖失败。若成功，实际打开图片做视觉核对，记录真实工具名、图片产物路径和视觉结果；不要靠模型自述确认后端版本或额度扣费。
将结果写入 results/IMAGE-R3-CODEX-WB-OFFICIAL.md，再回读。此项用于验证第三方聊天下官方生图是否真的可用，不能预先写成通过。
```


## 返回结果与人工判定

完成后集中提供 results 中的 R3 Markdown 文件，以及用户目视记录。不要上传登录文件、数据库、完整会话、密钥、带签名的远程图片链接或不相关日志。结果目录里的 edit.txt 是编辑证据，不必逐个粘贴。

素材人工核对答案：input.txt 首行为 ROUTING_FIXTURE_20261020，算式 17 + 25 = 42；vision.png 文字为 Q7V9K2，红色三角形1、蓝色圆形1、绿色正方形3。此答案仅供用户验收，不能代替模型实际读取/计算/看图。

通过范围应逐项报告：文件/终端/视觉/Skill/非 WorkBuddy 搜索/WorkBuddy MCP/文件编辑/正文清洁度/UI/生图。工具未提供、调用失败、素材缺失和权限不足是不同原因。未执行的生图和满窗口测试保持未验证；单个模型失败不需要重跑其他已完成的模型。
