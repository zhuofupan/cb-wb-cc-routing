# 上下文窗口：为什么 Claude Code 只给你 200k、怎么开到最大

## 现象：上游说 1M，Claude Code 只认 200k

上游的模型元数据里写得很清楚（`GET /v1/models`、`contextWindow` 字段）：

```
deepseek-v4.1-flash   1,000,000
glm-5.3               1,000,000
space-bunny           1,000,000
hy4-preview             960,000
minimax-m3-pay          512,000
```

但 Claude Code 对**不认识的模型**一律按 **200k** 规划上下文，并据此提前压缩。
实测（`claude -p … --output-format json` 的 `modelUsage`）：

```json
{"modelUsage":{"deepseek-v4.1-flash":{"contextWindow":200000,"maxOutputTokens":32000}}}
```

同时 stderr 会先吐一行 `[claude-code:unrecognized_model] {"model":"deepseek-v4.1-flash"}` ——
那行就是判据：模型 id 不在它内置的能力表里。

## 唯一的开关：`CLAUDE_CODE_MAX_CONTEXT_TOKENS`

放在 `~/.claude/settings.json` 的 `env` 里（CC Switch 的 Claude 页条目也是写这里）：

```json
"env": {
  "CLAUDE_CODE_MAX_CONTEXT_TOKENS": "1000000"
}
```

实测效果（同一模型、同一句 prompt，只改这一个变量）：

| 设置 | `modelUsage.contextWindow` |
| --- | --- |
| 不设 | 200000 |
| `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1` | 200000（**无效**，别被名字骗） |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000` | **1000000** |

⚠️ `~/.claude/settings.json` 的 `env` **优先于进程环境变量**。测的时候要用
`claude --settings <临时文件>`，否则你 `export` 的值会被旧配置盖掉，
表现为「改了没反应」。

## 两个不要搞混的数

- **窗口**（`contextWindow`）可以用上面的变量放大。
- **单次输出上限**（`maxOutputTokens`）**放不大**：`CLAUDE_CODE_MAX_OUTPUT_TOKENS`
  会被内置能力表的 `upperLimit` 夹住（不认识的模型 = 32000）。硬设 128000 也没用，
  它读回来还是 32000。这是客户端的能力表，不是配置能改的东西。

## 风险：设 1M 是「按最大声明」，不保证每个模型真有 1M

`CLAUDE_CODE_MAX_CONTEXT_TOKENS` 是**全局**的，不区分模型。所以：

| 模型 | 真实窗口 | 设 1M 后 |
| --- | --- | --- |
| deepseek-v4.1-flash / v4-pro / glm-5.3 / kimi-k3-2 / step-5-preview / mimo / space-bunny | 1,000,000 | 正好 |
| hy4-preview | 960,000 | 超 40k 才出问题 |
| **minimax-m3-pay** | **512,000** | **长会话会在 512k 附近被上游顶回来** |

真要长期用 `minimax-m3-pay`，把这个值降到 `512000`；用 `hy4-preview` 降到 `960000`。
**换成别的上游（DeepSeek 官方等）时也要跟着改** —— 它不认识你的模型，
一样按 200k 算，除非你给一个匹配的值。

## Codex 侧：本来就是最大，别多此一举

Codex 的窗口来自模型目录，不由客户端猜：

```jsonc
{ "slug": "deepseek-v4.1-flash",
  "context_window": 1000000,          // = 上游声明的真实窗口
  "max_context_window": 1000000,
  "effective_context_window_percent": 95,
  "auto_compact_token_limit": null }
```

`context_window` 已经是上游最大值，**不需要**再设 `model_context_window`
（那是全局覆盖，会让小窗口模型跟着一起超）。`effective_context_window_percent: 95`
是 Codex 计划使用的比例（1M × 95% = 950k），留 5% 给输出与估算误差 ——
**不建议为了「全要最大」把它改成 100**：输入顶到窗口上限、输出一加上去就越界了，
换来的只有 50k，代价是随机的 400。

## 验证命令

```bash
# 窗口看 modelUsage.contextWindow
claude -p "reply with exactly OK" --output-format json </dev/null \
  | grep -o '"contextWindow":[0-9]*,"maxOutputTokens":[0-9]*'

# Codex 的目录口径（别只看源文件，看渲染结果）
codex debug models -c model_catalog_json="<绝对路径>" \
  | python -c "import json,sys; [print(m['slug'], m['context_window'], m.get('effective_context_window_percent')) for m in json.load(sys.stdin)['models']]"
```
