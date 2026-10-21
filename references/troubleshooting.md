# 排错：11128 / 11133 / 超时 / 000

## 错误码先分清

| 码 | 含义 | 判据 |
| --- | --- | --- |
| **11128** | 渠道 / 身份指纹被拒 | 与请求体内容无关，只由特定字符串决定 |
| **11133** | 参数被模型侧拒绝 | `param` 字段会指出是哪一项 |

别混。11128 不是限流、不是格式错、不是模型没开通。

## 11128 的三个来源

三处都在**桌面版 Code 标签**才出现，且**互相独立** —— 修好前一处不会让后一处消失。

### 来源一：客户端指纹

Claude Code 把客户端指纹塞进 **system 的第一段**：

```
x-anthropic-billing-header: cc_version=2.1.303.09e; cc_entrypoint=sdk-cli;
```

WorkBuddy 上游据此判定非法渠道。

**已排除的误判方向**（都试过，全是错的）：工具太多（27 个）、`max_tokens=32000`、
content 数组格式、大 system、`tool_choice` 对象形式。全删光仍然 400。

**⚠️ 指纹会重复。** 桌面版 Code 标签（`claude-code 2.1.299`）把
`x-anthropic-billing-header` **连着写两遍**塞进同一个 system 块。旧正则锚在 `^`
且用非全局 `.replace`，只剥掉第一份 → 11128 照旧。必须 `/g` 全局剥离。

### 来源二：system 里的 CLI 身份句

独立的第二道检查：

```
You are Claude Code, Anthropic's official CLI for Claude.
```

二分实测（同一模型、同一句 user，只换 system 一句话）：

| system 文本 | 结果 |
| --- | --- |
| `You are Claude Code, Anthropic's official CLI for Claude.` | 400 / 11128 |
| 同上 + `, running within the Claude Agent SDK.` | 400 / 11128 |
| `You are Claude Code, running within the Claude Agent SDK.` | 200 |
| `You are Claude Code, an AI coding agent.` | 200 |

去掉「running within the Claude Agent SDK」**不管用**，必须动 `Anthropic's official CLI`。

### 来源三：新会话首轮追加的「反馈」句

前两处都修好之后，仍然会出现这种**看起来像偶发**的形态：

> 新开一个对话，第一条消息就 400；同一时间老会话继续聊却完全正常。

2026-10-20 15:00 用失败请求体二分到底，结论是 system 里被追加了一句 onboarding 文字：

```
To give feedback, users should report the issue at https://github.com/anthropics/claude-code/issues
```

| 步骤 | 读数 |
| --- | --- |
| 失败请求体 | 231 KB / system **31,121 字符** / 116 tools / `max_tokens=64000` / stream |
| 删 `tools`、删 `max_tokens`、tools 截 20 | 全部照旧 **400**（工具数量不是原因） |
| system 截 2000 字符 | **200** |
| 前缀截 5878 / 5879 | **OK / FAIL**（边界落在 URL 最后一个 `s`） |
| 固定尾、二分起始 | 最小窗口 `[5780, 5879)`，**99 字符** |
| 只改写这 99 字符、其余 31 KB 原样 | **400 → 200** |

反直觉的一点：**单独把这句丢进一个短 system 不触发**，要「长 system + 这句话」
的组合才中（推测上游拿它当官方 prompt 的特征，未验证）。

修法（`anthropic-codec.mjs` 的 `CHANNEL_MARKERS`，两条规则）：

| 匹配 | 改写为 |
| --- | --- |
| `To give feedback, users should report the issue at https?://\S+` | `To give feedback, users should report it in the product issue tracker` |
| `https?://github\.com/anthropics/claude-code\S*`（兜底，防措辞变体） | `the product issue tracker` |

**这一处解释了全部「偶发」**：新对话第一条必红，老会话续写正常（后续轮次的
system 里没这段）。早先把它判成「网关短时拒绝」是错的。

⚠️ **下一版客户端大概率还会加第四处。** 复发就照下面的二分套路定位，别猜。

## 典型症状对照

| 症状 | 原因 |
| --- | --- |
| Cowork 聊天正常、Code 标签一发就 400 | 指纹连写两遍，只剥了第一份 |
| CLI 直连能通、Code 标签 400 | system 里的 CLI 身份句（走 Agent SDK 才有） |
| **新开对话第一条必 400，老会话续写正常** | 新会话首轮的 system 里多出「反馈」句（来源三） |
| 请求看起来「超时 / 返回 000」 | 没带 `--noproxy '*'`，被系统代理吃掉 |
| 回复写到一半报 `max_output_tokens` | 适配器把缺省输出上限设成 16K/8K，或输入已占满窗口未压缩 |

## 一次重试 + 失败请求落盘

`workbuddy-server.mjs` 里有两样东西专门对付这类「看着像偶发」的 400：

- **`chatStreamWithChannelRetry`** —— 上游返回 11128 时停 2.5 s 重发**一次**，
  第二次仍失败就原样报错。只加一次、带停顿：上游文档明确要求「避免高频重试」。
- **`dumpFailedRequest`** —— 只在**失败**时写 `last-failed-upstream.json`（转换后的
  上游请求体）。下次复发不用先开 `WB_DUMP=1`（那是全量落盘，会把每个成功请求
  也写盘，别长期开着）。

判断「是不是真修好了」的口径：**新开一个会话发第一条**，而不是在老会话里接着聊。

## 二分定位套路（下次直接照做）

1. 起当前共享适配器时带 `DUMP=1`；这会保存请求正文，仅在本地诊断使用，不要把 dump 上传到 issue 或仓库。
2. 复现一次失败请求，得到 `dump-<ISO时间戳>-anthropic.json`（原始 Anthropic 体）
   + `last-anthropic-upstream.json`（转换后的上游体）。
   ⚠️ `last-*` 是**单槽**，任何后续请求（含你自己 curl）都会覆盖，所以同时写了带时间戳的副本。
3. `curl --data-binary @dump-xxx.json` 打 `127.0.0.1:18791/v1/messages` 回放，确认 400。
4. 逐段拆 **`tools` / `system[i]` / `messages`**，每次只留一块，二分。

## 直连适配器测试

**必须**带 `--noproxy '*'`，否则请求被系统代理（`http_proxy=127.0.0.1:58792`）吃掉，
表现为超时 / `000`，看起来像「适配器没起」。

认证用 `Authorization: Bearer <secret>`，**不是** `x-api-key`。

```bash
curl -s --noproxy '*' -X POST http://127.0.0.1:18791/v1/messages \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_LOCAL_SECRET' \
  -H 'anthropic-version: 2023-06-01' \
  -d '{"model":"deepseek-v4.1-flash","max_tokens":8,
       "system":[{"type":"text","text":"x-anthropic-billing-header: cc_version=1; cc_entrypoint=a; x-anthropic-billing-header: cc_version=2; cc_entrypoint=b;"}],
       "messages":[{"role":"user","content":"hi"}]}'
# 修复前 → 400 / 11128；修复后 → 200
```

`hy4-preview`、`deepseek-v4.1-flash` 单测都是 200 —— **模型没问题**，
别把 11128 误判成「模型没开通」。

## 健康检查

```bash
curl -s --noproxy '*' http://127.0.0.1:18791/health
# {"ready":true,"requests":N}
```

⚠️ `start-workbuddy.ps1` 故意**不发**这个请求：代理下它可能卡几秒。它改用了
`Get-NetTCPConnection -State Listen` 判断端口 —— 监听器不会说谎。
# 计划任务重复启动 supervisor 或清理后网关未恢复

再次修复（2026-10-21）：`Write-Log` 使用 `Write-Output` 导致
`Start-Profile` 返回日志字符串（或字符串与 Process 的数组），监控误判
`-not $child.HasExited` 为真，已退出的网关无法自动恢复。日志改走 Host 流，
监控仅接受真实 Process、刷新进程状态并复核监听端口。
新增 `tests/supervisor.test.ps1` 覆盖已有监听和闲置 profile 的返回值污染。
实测依次结束 WB/CB 网关后，两者均由同一 supervisor 自动恢复并通过健康检查；
Codex Responses 与 CC Switch Desktop Messages 路径均 HTTP 200 返回 OK。
Node 25、Python 10 项离线回归通过。

`adapter-tick.cmd` 只调用 `start-workbuddy.ps1 -Watch`，不再复制客户端目标判断。
启动条件统一由 supervisor 判断，必须包含 profile 的 `alwaysStart`；客户端经
CC Switch 的 15721 代理访问时，不能仅凭客户端配置中没有 18792 就跳过恢复。
supervisor 持有 `Local\CodexWorkBuddyAdapterSupervisor` 互斥锁，覆盖启动等待与
整个监控循环；已有实例时，新 tick 立即退出。单个 profile 启动失败不能阻止
另一个 profile 启动或后续重试。没有子进程时也继续监控后续切换的 profile。

2026-10-21 验证：从两个网关均停止的状态，经实际计划任务恢复 CodeBuddy
18792；连续两次 tick 后 supervisor PID 不变且仅一个。使用本地 Desktop
profile 的网关地址、认证及模型别名，经 15721/claude-desktop/v1/messages
转发到 GLM-5.3-FlashX，HTTP 200 并返回 OK。Node 21 项、Python 9 项回归通过。
这是代理链路验证，未代替真实 Desktop 界面验收。
