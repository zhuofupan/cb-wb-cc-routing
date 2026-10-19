# Codex 官方与第三方为什么不能共存

## 问题

Codex CLI 0.159.2 实测：`auth.json` 的 `auth_mode` 是**全局的**。
为 `chatgpt` 时 Codex 只允许官方模型，任何第三方模型名都报：

```
The 'X' model is not supported when using Codex with a ChatGPT account.
```

`--profile` 只叠加配置、**不改变 auth 模式**，绕不过这个检查；
`preferred_auth_method` 在本版已被忽略。

→ 第三方模型必须跑在**没有 ChatGPT 登录态**的 `CODEX_HOME` 里。

## 方案 A（首选）：CC Switch 里切，单一 `~/.codex`

CC Switch 的 Codex 页两个条目：**DeepSeek 官方**、**WorkBuddy 本地**。
点卡片即切换，不需要命令行前缀。切换后重启 Codex，新会话用新供应商；
旧会话仍在同一个列表里。

前提（在 CC Switch 设置里开启）：

- **非接管切换时保留官方登录** —— 第三方 key 只写 `config.toml`，`auth.json` 保持 ChatGPT 登录
- **统一 Codex 会话历史** —— 官方与第三方会话共用一个列表

### CC Switch 的第三方模板（关键）

和手写配置不一样，这是它能work的原因：

```toml
model_provider = "custom"          # 复用共享 id，会话历史才对得上
preferred_auth_method = "apikey"   # 桌面版据此不再套用 ChatGPT 模型白名单
[model_providers.custom]
requires_openai_auth = true
experimental_bearer_token = "..."  # key 只在这里，绝不进 auth.json
```

## 方案 B：独立 CODEX_HOME（最后手段）

主目录 `~/.codex` 永远保持官方（GPT + ChatGPT 账号，模型菜单与账号切换正常）。
第三方走独立目录 `~/.codex-deepseek`：

```powershell
$env:CODEX_HOME = "$env:USERPROFILE\.codex-deepseek"
codex            # 或 codex -p workbuddy
```

**代价**：会话历史与主目录分开。

⚠️ **不要在 `~/.codex-deepseek` 里放 `auth.json` 或执行 `codex login`** ——
ChatGPT 登录态被带回，错误重现。

## 已弃用的做法

`select-provider.ps1` 改写主 `config.toml` 顶层，副作用是**桌面版丢失 GPT 和账号切换入口**。
仅当确实要让桌面版跑第三方时用，用完必须 `-Provider gpt` 切回并重启。

## 模型目录

WorkBuddy 条目用 `workbuddy-models-flagship.json`（8 个厂商各一个旗舰）；
完整 20 个模型的原始目录是 `workbuddy-models.json`。
在 Codex 的模型选择器里切换即可。刷新：`configure.py --workbuddy`。
