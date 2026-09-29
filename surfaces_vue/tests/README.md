# P0 前端回归验证

在 `surfaces_vue` 目录运行：

```powershell
npm test
npm run build
npm run test:browser
```

- `npm test` 使用 Node 自带测试运行器，验证设置转换/校验、MCP 参数、历史拒绝状态、上下文用量和自动化完成状态机。
- 浏览器脚本针对上一步生成的 `dist`，启动临时静态服务器，使用 Playwright 拦截 HTTP/WebSocket 并模拟后端响应。不会启动或修改 Python 后端，不会连接实际模型、MCP 或外部服务。
- 浏览器脚本复用 `surfaces/gui/node_modules/@playwright/test`，需要先安装原 React 前端的依赖。默认使用本机 Microsoft Edge；可以通过 `P0_BROWSER_CHANNEL=chrome` 使用 Chrome。
- 浏览器覆盖保存失败保留输入、设置回显、MCP 命令参数、历史拒绝状态、用量刷新、会话显示数量、自动审批关闭、模型/角色刷新、切换会话后自动化回写及运行失败不误报成功。
- 浏览器失败时将截图保存在被 Git 忽略的 `surfaces_vue/dist/p0-failure.png`。

## 当前接口限制

后端 `finalize` 接口只能写入成功状态。前端仅在观察到 `turn_end.status=completed` 且随后收到 `turn_done` 时调用；回写失败可重试，同一运行不会并发/重复回写。

运行过程中切换会话保留自动化连接；意外断线会重连。浏览器同一标签页刷新后，通过 `sessionStorage` 恢复运行跟踪，且不会重发任务。若断线期间错过了完整结束事件，前端明确提示结果待确认，不根据可能只是部分输出的历史回答猜测成功。

失败/中断的运行显示提示，不调用成功接口，因此后端运行记录可能仍为 `running`。本次按要求只改前端；这些状态的后端持久化不在本次实现范围。浏览器关闭期间的可靠结算也不由本次前端回归验证保证。
