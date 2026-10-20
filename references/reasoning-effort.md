# 推理档位（智能度）：默认值放在哪、怎么调到最高

用户口中的「**智能度**」就是上游的 `reasoning_effort`。它不在 CC Switch 里，
也不在 Claude Code / Codex 的界面上 —— **它有三个落点，各管一段**，
少改一处就会出现「明明设了最高，跑起来还是原来的档」。

| 落点 | 管什么 | 本仓库里的位置 |
| --- | --- | --- |
| Codex 模型目录 | 菜单里给每个模型列出哪些档、默认选哪个 | `model_catalog_json` 指向的目录 JSON 的 `default_reasoning_level` |
| Codex provider 配置 | Codex 每轮实际发出去的 `reasoning.effort` | `config.toml` / CC Switch 条目里的 `model_reasoning_effort` |
| 适配器 | Claude Code / Cowork **根本不发**这个字段时，替它补一个 | `local-settings.json` 的 `effortDefault` |

## 关键事实：两个客户端的态度完全不同

- **Codex 会发**：每轮把 `model_reasoning_effort` 塞进 `reasoning.effort`，
  适配器 `responses-codec.mjs` 原样转成上游的 `reasoning_effort`。
  它一份配置管**所有**模型，所以模型之间支持的档不一样时，只能靠目录里的
  `supported_reasoning_levels` 表达差别。
- **Claude Code / Desktop 不发**：Anthropic Messages 协议里没有这个字段。
  旧版适配器于是什么都不传，上游按自己的默认走 —— 同一个模型在 Codex 里
  想得很深、在 Claude Code 里想得很浅，就是这个原因。

## 实测：所有模型都接受 `max`（2026-10-20）

上游暴露的档位拼写是固定的五个：`low` / `medium` / `high` / `xhigh` / `max`。

对 21 个模型逐个发真实请求（`max_tokens: 32`，读到流式返回算通过）：
**全部 9 个 WorkBuddy 路由模型对 `reasoning_effort: "max"` 返回 200**。

同一轮还测出两件容易误判的事：

1. **只有 `deepseek-v4.1-flash` 与 `deepseek-v4-pro` 会校验取值**。
   它们是五个档全收（low…max），但塞一个不存在的值会被 400 顶回来。
2. **其余模型不校验**：塞一个假的哨兵值（`probe_sentinel_…`）照样 200。
   也就是说这些模型「接受任意值但未见得照办」—— 设 `max` 是安全的，
   但**别指望它有可观测的差别**。要声称「某模型真的想得更久」，
   得另外用效果验证，不能拿 200 当证据。

`glm-5.1` 是特例的另一头：**不传**这字段会被 `11150` 拒（历史记录见
`references/limits.md`），传 `max` 正常。

## 调到最高的三处改动

### 1. 模型目录：`default_reasoning_level`

```jsonc
{
  "slug": "kimi-k3-2",
  "supported_reasoning_levels": [
    { "effort": "high", "description": "high" },
    { "effort": "max",  "description": "max" }
  ],
  "default_reasoning_level": "max"     // ← 选这个模型时的默认档
}
```

- 把 `max` 补进 `supported_reasoning_levels`，`default_reasoning_level` 指到列表末档。
- 校验方式：`codex debug models -c model_catalog_json="<绝对路径>"`，
  出来的 JSON 就是 Codex 真正认的目录 —— 别只看源文件。

### 2. Codex provider：`model_reasoning_effort`

```
model_reasoning_effort = "max"
```

CC Switch 的条目存在数据库里（`providers.settings_config` 的 `config` 字段，
是**转义过的** TOML 字符串）。改库时注意引号是 `\"`：

```sql
UPDATE providers SET settings_config = replace(settings_config,
       'model_reasoning_effort = \"high\"',
       'model_reasoning_effort = \"max\"')
 WHERE id = 'codex-workbuddy-local' AND app_type = 'codex';
```

改完**在 CC Switch 界面里重新点一次**该条目，才会写进 `config.toml`。

### 3. 适配器：`effortDefault`（Claude Code 侧的补位）

```json
"effortDefault": "max"
```

`workbuddy-server.mjs` 在两条通路上（`/v1/responses`、`/v1/messages`）只做
**填空**：请求里没有 `reasoning_effort` 就补 `max`，**有就不动**。

这条「有就不动」是故意的：Codex 里手动选低档仍然有效，用户不会被配置绑架。
代价是 Codex 侧的值由第 2 步决定，Claude Code 侧由本步决定 —— 生效点不同，
别拿一边的读数推断另一边。

生效证据（适配器日志，一行一次补位）：

```json
{"event":"effort_default","model":"deepseek-v4.1-flash","effort":"max"}
```

## 验证口径

```bash
# 1) Claude 侧：不传 effort，看日志有没有补位
curl -s --noproxy '*' -X POST http://127.0.0.1:18791/v1/messages \
  -H 'authorization: Bearer YOUR_LOCAL_SECRET' -H 'content-type: application/json' \
  -d '{"model":"claude-sonnet-5","max_tokens":32,"messages":[{"role":"user","content":"hi"}]}'
tail -n 3 server.stdout.log      # 应出现 effort_default … max

# 2) Codex 侧：真跑一轮，确认 max 被接受（Codex 不校验枚举，别拿 --version 当证据）
codex exec --skip-git-repo-check -s read-only \
  -c 'model="deepseek-v4.1-flash"' -c 'model_provider="wb"' \
  -c 'model_providers.wb={name="WorkBuddy",wire_api="responses",base_url="http://127.0.0.1:18791/v1",experimental_bearer_token="YOUR_LOCAL_SECRET"}' \
  -c 'model_reasoning_effort="max"' \
  "reply with exactly: OK" </dev/null
```

⚠️ `codex -c model_reasoning_effort=bogus --version` **不会报错** ——
`--version` 不解析配置，`codex debug models` 也不校验这个值。
想确认「Codex 认不认这个档」，只有真跑一轮。
