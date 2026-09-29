# Windows 桌面版构建

在项目根目录双击 `build-desktop.cmd`，或从 PowerShell 执行：

```powershell
.\build-desktop.cmd
```

需要 Windows 10/11 x64、Node.js 22.12 及以上（含 npm）、Git，以及 Python 3.11 x64。默认解释器为
`D:\self\self_code_softwafe\python3.11_compiler_64bit\python311.exe`。
首次构建需要联网下载 Python 依赖、Electron 和 NSIS 工具。

```powershell
# 指定另一份 Python 3.11
.\build-desktop.ps1 -Python 'C:\Python311\python.exe'
# 依赖已安装时跳过安装
.\build-desktop.ps1 -SkipInstall
# 只生成可运行目录，不生成安装程序
.\build-desktop.ps1 -SkipInstall -Unpacked
# 构建后额外启动桌面窗口，验证 HTTP、WebSocket 和退出清理
.\build-desktop.ps1 -SkipInstall -VerifyDesktop
```

脚本遇到任一步骤失败会立即返回非零退出码。构建依次执行：

1. 在 `.venv-desktop` 中安装后端及构建依赖。
2. 优先使用 `surfaces_vue/assets/logo.png`，不存在时使用 `surfaces_vue/assets/AIworker_logo.png`，生成多尺寸 Windows ICO。Vue 界面、网页图标和 Electron 窗口也遵循同一优先级。`logo.png` 仅供本地覆盖，Git 忽略它；`AIworker_logo.png` 是仓库默认图标。更换图片后重新构建，开发服务器则需要重启。
3. PyInstaller 打包后端及内置 personas、动态 providers、原生依赖。
4. 构建 Vue，并用临时配置启动冻结后的后端，验证鉴权接口。
5. electron-builder 将后端目录作为 extraResources 合入 Windows 桌面程序，生成 NSIS 安装包。

产物位于：

- `dist/desktop/AIWorker-0.0.0-x64-Setup.exe`：安装程序。
- `dist/desktop/win-unpacked/AIWorker.exe`：免安装入口，分发时需要整个 `win-unpacked` 目录。
- `dist/coworker-server/`：独立后端及运行库，需要保留整个目录。

用户运行桌面程序无需另装 Python、Node.js。模型密钥和外部工具（如 Git、MCP 所需的命令及浏览器自动化所需的浏览器）仍按功能配置。
安装包尚未配置代码签名证书；对外发布时应通过 electron-builder 的签名环境变量配置证书。

## 启动与数据

Electron 在随机本地端口启动后端，为每次启动生成内存令牌，等待鉴权接口可用（最多 90 秒），然后加载 Vue 窗口。
前端静态资源通过仅监听 `127.0.0.1` 的本地服务加载，与现有后端 Origin 策略兼容。
渲染器启用 sandbox 和 contextIsolation，并通过 preload 获得本次连接信息。
关闭桌面程序会终止后端；后端也监测 Electron 父进程，避免主进程异常退出后遗留服务。

后端沿用 `%APPDATA%\coworker` 保存配置、会话和密钥，可通过 `COWORKER_STATE_DIR` 覆盖。
Electron 日志目录下的 `coworker.log` 保存本次后端输出，具体路径会在启动错误提示中显示。
不向安装目录写入用户配置。重复启动会聚焦已有窗口。

后端和前端构建好以后，也可在 `surfaces_vue` 目录执行 `npm run desktop:start` 调试 Electron。
`npm run dev` 继续支持原有 Web 开发模式。
