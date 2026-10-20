# 2026-10-20 验证记录

环境：Windows、CC Switch 4.0.15、Claude Desktop MSIX 2.42304.2.0、会话 SDK 2.1.299、Node 24.15.0。以下为一次账户/版本环境中的结果，不含个人路径、key、登录态、数据库、会话正文或图片签名 URL。

## 全模型接口与路由

- CodeBuddy / WorkBuddy 当前各九模型：文本连通与图像识别协议诊断通过。WorkBuddy Step-5 首轮 429 排队，后续仅补测该项成功；不是一律缺少图像能力。
- 官方 DeepSeek Flash 文本和识图通过；Pro 文本通过，本身目录仅声明文本输入，不把“不支持图片”记为配置失败。
- 两厂商九个菜单别名此前均逐个做过 CC Switch HTTP 路由验证。MiniMax 升级后，两适配器的模型发现和数据库映射已核对；当前 WorkBuddy CC Switch 路由实际返回 minimax-m3.1-flash。
- 新 MiniMax-M3.1-Flash 在两厂商分别通过文本、识图、强制函数工具调用及 tool_result 回灌。初次强制选择返回 400；修正 Tencent 只接受字符串 tool_choice 后复验通过。
- 官方规范 ID deepseek-flash（目录显示 V4.1-Flash）另做文本与识图测试通过。

## 真实 Desktop 操作

| 路由 / 模型 | 模式 | 实测 |
|---|---|---|
| CodeBuddy / DeepSeek Flash | Code | 对话、Read 图片；内置 WebSearch/WebFetch 未通过 |
| CodeBuddy / DeepSeek Flash | Cowork | 对话、上传图片识别 |
| CodeBuddy / MiMo | Code | MCP 搜索、抓取、生图并显示 |
| CodeBuddy / MiMo | Cowork | MCP 搜索、抓取、生图、创建及读取文件 |
| CodeBuddy / 旧 MiniMax-M3 | Code | 文件写读；窗口由旧别名 200k 修正为显示 512k |
| CodeBuddy / Hy4 | Code | Read 文件，窗口显示 960k；上游 effort=high |
| WorkBuddy / MiMo | Code | Read 文件、MCP 抓取 |
| WorkBuddy / 旧 MiniMax-M3 | Cowork | MCP 搜索/抓取、文件写读；固定最高策略实际 effort=max |

新 MiniMax-M3.1-Flash 的接口已验，不能把旧 M3 的 Desktop 行当作新型号逐模式 UI 验收。此前 CLI 测试也不能替代这些 Desktop 证据。

## 上下文与思考证据

已核对模型目录、最终配置、代表性 Code 显示和安全 effort 日志。新会话默认 Max 曾在真实 Desktop 显示；Cowork 切模型可恢复已保存的较低档，因此适配器显式 highest 策略提供上游最高请求，并按目录限制 Hy4 / Step-5 为 high。

没有发送满 1M token 负载；没有完成每模型、每 Desktop 模式的全部工具/插件矩阵。Cowork 隔离目录内写入设置、SDK audit 报告 contextWindow=1000000，均不能单独证明真实上游容量或自动压缩策略。后续验证应逐项扩展，不用一句“全部通过”覆盖不同证据层级。

## 发布代码的离线回归

tests/gateway.test.mjs 使用本地假上游验证 CodeBuddy 无 WorkBuddy 依赖启动、鉴权、别名映射、最高 effort 封顶、指定函数兼容、工具结果图像保留及响应转换；不使用真实账号。Python 测试验证九模型前后缀、camelCase 映射和已有供应商元数据/选中状态保留。在线结果和这些离线回归分别记录。
