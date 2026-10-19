# CC Switch 的内部行为

## 三个页面是三套独立条目

Claude 页、Claude Desktop 页是**两套独立条目**（**同 id、不同 `app_type`**），
要各注册一次。Codex 页又是第三套。

```
providers 表: (id, app_type) 联合区分
  app_type = 'claude'          → Claude Code
  app_type = 'claude-desktop'  → Claude Desktop / Cowork
  app_type = 'codex'           → Codex CLI
```

所以 `claude-workbuddy-local` 这个 id 在 claude 和 claude-desktop 下**各有一行**，
内容还不一样（Claude 页要带 `ANTHROPIC_DEFAULT_*_MODEL`，Desktop 页只要
`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`）。

## 切换怎么生效

- `currentProviderClaudeDesktop` 写在 `settings.json`，
- 但真正生效的是 **`live-state.json` 的 `proxy_route`**，
- 且**只有它在界面里点过才认**。

**直接改库能注册条目，切换仍应在 UI 里做。**
判「当前 provider」看 `live-state.json`，别只看 DB 的 `is_current`（会不一致）。

## ⚠️ 它是 GUI 托盘应用，自动化会话里拉不起来

`Start-Process` / `cmd start` 起的进程**都会随会话被清理**：
`tasklist` 里消失、`15721` 跟着不监听，Claude Desktop 直接连不上。

这不是偶发，是稳定行为。
⚠️ **改过 Desktop 配置后，必须提醒用户自己开 CC Switch**，否则他对面是断的。

## 写数据库的正确姿势

1. **先关掉 CC Switch**（`Stop-Process -Name cc-switch -Force`），否则写进去也可能被覆盖。
2. 跑注册脚本（幂等：`delete` 同 id + `insert`）。
3. 再启动：`Start-Process cc-switch.exe`。

`providers` 表插入要填全这些列，缺一列会写不进：

```sql
insert into providers
  (id, app_type, name, settings_config, website_url, category, created_at,
   sort_index, notes, icon, icon_color, meta, is_current, in_failover_queue,
   cost_multiplier, limit_daily_usd, limit_monthly_usd, provider_type)
values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
```

- `settings_config` 是 JSON 字符串：Codex 是 `{"auth": {...}, "config": "<toml>"}`，
  Claude / Desktop 是 `{"env": {...}}`。
- `meta` 常用 `{"commonConfigEnabled": false, "endpointAutoSelect": true,
  "apiFormat": "anthropic"}`（Codex 用 `"openai_responses"`）。
- `created_at` 是**毫秒**时间戳。
- `is_current` 别手改，交给 UI。

## 「路由」不能替代适配器

CC Switch 的路由只是把请求经 `127.0.0.1:15721` **再转一手**（格式转换 + 故障转移），
它**不会启动 18791**，供应商配置里也没有任何「启动命令」字段。两者是**串联**关系：

```
Codex ──直连──────────────────────────────→ 18791 适配器 → WorkBuddy 上游
Codex ──路由→ 15721(CC Switch) ───────────→ 18791 适配器 → WorkBuddy 上游
```

WorkBuddy 接口本来就是 Responses 格式，**不需要路由**。
