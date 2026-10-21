# 已知限制

以 [实测矩阵](desktop-validation.md) 为准。当前全部已选模型做过接口连通和识图能力诊断；官方 DeepSeek Pro 不支持图像。真实 Desktop 仅做代表性模型功能测试，不是每模型每功能的完整矩阵。

- thinking / redacted_thinking 不伪造 Anthropic 签名；不能承诺完整保留模型推理重放。
- count_tokens 是字符估算，不是真实 tokenizer；窗口显示不等于真实容量。
- 单次输出有独立上限（当前三款 128K/128K/131072）。`max_output_tokens` 失败不等于输入窗口用尽；不要用固定 16K/8K 兜底或据此判断模型容量。
- 不实现全部官方服务端工具、远端响应存储或 Responses WebSocket，不把未知接口伪装为成功。
- `/responses/compact` 和 `/v1/responses/compact` 通过当前上游模型生成续聊摘要，返回网关自己的 AES-GCM 加密 compaction 项；支持 `/responses` 中的 `compaction_trigger` 流式返回。不等于 OpenAI 原生隐藏推理压缩，不能把该令牌发给官方或其他网关。共享网关的 CB/WB 可复用，须保留运行目录中的 `compaction.key`。摘要不完整时返回错误。Codex 现有配置仍使用本地压缩；新接口的离线回归不等于桌面自动压缩已完成验收。
- 大图请求：默认接收上限 256 MiB（`requestLimitMiB`），转换、图片处理后的上游预算 128 MiB（`upstreamRequestLimitMiB`）。这是本地安全预算，尚无该推理接口公开的总字节硬上限证据；不套用其他腾讯云 API 的 10 MB 限制。超出预算返回 413，不截断正文，上游自身限制仍可能更低。
- 默认只转发最近 16 张图片，较旧图片以说明文字替代；聊天记录和源文件不变。超过 256 KiB 的内嵌图片转 JPEG，历史最长边 1280，最近两张 2048；小图和远程 URL 不重新编码。可用 `imagePolicy` 覆盖 `maxImages`、`recentImages`、`compressAboveBytes`、`historyMaxEdge`、`recentMaxEdge`。需要原图精确验收时重新读取源图；压缩会损失像素细节与透明度。
- 任意插件、连接器、子代理、定时任务、断线恢复、长会话压缩尚未逐项验收。客户端函数/MCP 协议通过不能外推为全部插件通过。
- 缺少完整 effort 范围时，max 被接受不代表最高计算量。highest 策略会覆盖低档，应按用户偏好启停。
- 模型目录、登录认证、WorkBuddy/CodeBuddy API 和 Desktop 会更新，本次结论不是永久支持承诺。
- 失败请求正文可能写入本地 last-failed-upstream.json；DUMP=1 会保存更多正文。默认不提交任何这些文件；不要将包含代码、对话或签名 URL 的诊断文件公开上传。

MiMo 在本次真实 Code、Cowork 中成功调用文件工具及 MCP；早期身份拒答未复现，不能继续标成“一律不能用”。旧 MiniMax-M3 的 512k 证据属于旧型号，当前选的是 M3.1-Flash（1M）。
