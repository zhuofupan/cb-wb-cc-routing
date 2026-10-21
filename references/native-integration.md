# Codex 原生接入优化（2026-10-21）

## 工具加载

Responses 的 `tool_search` 在 `execution=client` 时映射为上游普通函数，输出恢复为原生 `tool_search_call`，由 Codex 执行发现。`tool_search_output.tools` 中的定义成为下一轮可调用工具；标记 defer_loading 的未加载工具不再提前发送。加载状态来自当前请求历史，不在不同聊天之间共享。

仅服务器搜索且已提供工具定义时保留兼容的展开模式。适配器没有实现 OpenAI 托管搜索服务，也不会通过猜测用户问题删除必要工具。转发 parallel_tool_calls 设置；工具名称转换发生冲突时明确失败。

## 上下文

Codex 模型目录保留官方模板的原生指令。auto_compact_token_limit=null，移除之前的 308750/840k 固定覆盖，采用安装版本的模型默认压缩策略；Claude 的 autoCompactWindow 是独立设置。

两种协议统一把工具 schema、文本 UTF-8 字节、图片预留计入输入估算。该估算用于分配剩余输出预算，不是精确分词，不主动截断历史。逐模型实际窗口和输出上限继续生效。

## 重试与等待边界

- 只对开始接收响应流之前的明确 502/503/504 拒绝和既有 11128 错误补试一次，间隔默认 2500ms。
- 鉴权错误、429、连接不可达、超时及部分流不自动重放；这不能保证供应商不会对失败请求收费。
- 用户取消会终止上游及补试等待。
- upstreamHeaderTimeoutMs 默认 180000；upstreamIdleTimeoutMs 默认 120000。持续输出可以超过上述时长，计时器只检测上游无数据；需要更长静默推理时可在网关设置文件中提高数值并重启。
- /health 返回 pid 和 active_requests，用于判断进程加载版本与空闲状态；不含凭证。

## 验证

34 项 Node、10 项 Python 检查及 Windows PowerShell 5.1 守护检查通过。真实 CB/WB 路由完成工具搜索、加载函数调用、读取工具结果三轮往返；隔离的 Codex CLI 0.163.0 在两条路由下均成功执行一条只读终端命令并回答。

测试覆盖三款模型的静态档位映射；真实上游和 CLI 验证使用 deepseek-v4.1-flash，不外推为所有模型或满上下文验证。没有桌面选择器视觉验收，也没有同条件的修改前后性能基准。

官方依据：[工具搜索](https://developers.openai.com/api/docs/guides/tools-tool-search)、[Codex 配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)。
