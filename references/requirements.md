# 哪些软件必须开着

按「你用哪条通路」决定，不是所有都要。

## 速查表

| 通路 | WorkBuddy | 适配器 18791 | CC Switch 15721 | Claude Desktop |
| --- | --- | --- | --- | --- |
| DeepSeek → Codex | ✗ | ✗ | ✗ | ✗ |
| DeepSeek → Claude Code | ✗ | ✗ | ✗ | ✗ |
| WorkBuddy → Codex | **✓** | **✓** | ✗ | ✗ |
| WorkBuddy → Claude Code | **✓** | **✓** | ✗ | ✗ |
| WorkBuddy → Claude Desktop / Cowork | **✓** | **✓** | **✓** | ✓（本来就是它） |

一句话：**DeepSeek 那两条什么都不用开；WorkBuddy 那三条必须开 WorkBuddy + 适配器；
只有 Desktop/Cowork 还要额外开 CC Switch。**

## 逐个说清楚

### WorkBuddy 桌面版 —— 必须开

**不是「登录一次就行」，是必须保持运行。** 两个原因：

1. **凭据是它的登录态。** 适配器读的是
   `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info`，
   没有这个文件就没有身份。
2. **⚠️ 解密要调 `WorkBuddy.exe` 拿密钥。** 凭据文件是加密的，适配器通过
   `WORKBUDDY_ELECTRON_BIN` 指向的 WorkBuddy 可执行文件来解析当前 at-rest key。
   **WorkBuddy 被卸载、升级换路径、或重装过（密钥变了），适配器就解不开**，
   报 `encrypted-credential-unreadable`。

`local-settings.json` 里的 `electron` 字段就是给这一步用的，路径错了同样解不开。

**WorkBuddy 完全退出（含托盘）会发生什么**：已缓存的密钥还在内存里时能继续跑一会儿；
一旦需要刷新 token 或重启适配器，就解不开了。

### 适配器 18791 —— 必须开

`node workbuddy-server.mjs`，用 `start-workbuddy.ps1` 拉起。

**它自己会判断该不该活着**（`start-workbuddy.ps1` + 服务内每 2 分钟自检）：

- Codex 的**活跃 provider**（`config.toml` 里 `model_provider` 指向的那个）`base_url`
  含 `127.0.0.1:18791`，**或**
- `~/.claude/settings.json` 的 `env.ANTHROPIC_BASE_URL` 含 `127.0.0.1:18791`

任一成立就保持运行；两个都不指了，约 4 分钟后自行退出。

⚠️ 判断时只看**活跃** provider。`[model_providers.workbuddy]` 段会长期留在配置里，
全文搜索 `127.0.0.1:18791` 会恒为真 —— 那样切走之后服务不退出。

**自动拉起**：计划任务 `CodexWorkBuddyAdapter` 每 1 分钟跑一次 tick
（入口用 `.vbs` 而不是 `.cmd`，否则每分钟闪一次黑框）。

手动：

```powershell
wb-adapter          # 启动
wb-adapter status   # 查状态
wb-adapter stop     # 停止
```

### CC Switch 15721 —— 只有 Claude Desktop / Cowork 需要

**Claude Code 和 Codex 直连 18791，不经过它。**

它只做一件事：把 Claude Desktop 的推理请求转到 15721，再转给 18791。

⚠️ **它是 GUI 托盘应用，自动化会话里拉不起来** —— `Start-Process` / `cmd start`
起的进程会随会话被清理，`tasklist` 里消失、15721 跟着不监听，
**Claude Desktop 直接连不上**。必须你自己启动。

判「当前 provider」看 `live-state.json` 的 `proxy_route`，别看 DB 的 `is_current`。

### Claude Desktop —— DeepSeek / WorkBuddy 两条都走它

这条通路下 Desktop 本来就是主角，不算额外依赖。但注意：

- Desktop 4.9 起走 `custom-3p` 模式，推理全发到 `127.0.0.1:15721/claude-desktop`
- 装了 WorkBuddy provider 之后，**CC Switch 不开 = Desktop 连不上模型**

## DeepSeek 那两条为什么什么都不用开

官方自带端点，走标准 API key：

```
Codex        → https://api.deepseek.com
Claude Code  → https://api.deepseek.com/anthropic
```

没有登录态、没有解密、没有 token 刷新，所以不需要任何本地进程。
**如果只是用 DeepSeek，把上面这些全关掉也能跑。**

## 排查顺序

模型不响应时，从上往下查：

1. **适配器在监听吗** —— `curl -s --noproxy '*' http://127.0.0.1:18791/health`
2. **WorkBuddy 开着吗** —— `tasklist | findstr WorkBuddy`
3. **CC Switch 开着吗**（仅 Desktop）—— `netstat -ano | findstr 15721`
4. **客户端指向对了吗** —— 看 `config.toml` 活跃 provider 的 `base_url`
   或 `~/.claude/settings.json` 的 `ANTHROPIC_BASE_URL`

⚠️ 第 1 步的 curl **必须带 `--noproxy '*'`**，否则被系统代理吃掉，
表现为超时 / `000`，看起来像「适配器没起」。
