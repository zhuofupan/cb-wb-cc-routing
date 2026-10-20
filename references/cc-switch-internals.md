# CC Switch 内部边界

`providers` 以 `(id, app_type)` 区分。`claude` 是 CLI，`claude-desktop` 是 Desktop，不要因同名供应商而混写。一个 Desktop 供应商可在 `meta.claudeDesktopModelRoutes` 内容纳九模型。

数据库修改前退出 CC Switch，使用 SQLite backup 备份，保留现有 active/failover 等状态；注册不等于激活。运行路由以 live-state.json 的 apps.claude-desktop.proxy_route 为准。不要盲写 live-state，也不要靠 is_current 单字段猜测实际目标。

当前已验证 camelCase 模型映射有效；此前 snake_case 搜索和只读 profile 的建议错误。profile 必须可写，否则供应商切换可能失败。CC Switch 持续运行才能提供 15721 代理；可以用进程启动方式拉起，但应验证退出当前会话后是否仍常驻，不能绝对声称“脚本永远无法启动”。

若它以高权限运行，普通进程的 Stop-Process / 窗口操作可能被系统拒绝，应请用户从托盘退出，不规避权限边界。界面操作、离线文件更新和代理 HTTP 测试是不同证据。

CC Switch 不代替 18791/18792 适配器的认证和协议转换，也不会因写入供应商而自动启动这些服务。使用自己的计划任务或进程管理器，并分别检查 /health 与当前激活路由。
