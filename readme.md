# 🤖 AIWorker

AIWorker 是一个面向日常办公、文件处理和开发协作的 AI 工作助手。它将大语言模型、工具执行、工作区文件、任务审批和会话管理连接起来，让用户通过自然语言提出任务，并在同一个界面中查看执行过程、确认关键操作和获取结果。

**👨‍💻 开发者与主要维护者：tedzheng。**

项目借鉴了吴恩达团队的核心任务循环方法论，并结合现有运行时与工具体系，构建 AIWorker 的交互体验。当前使用 **Python 后端 + Vue 前端**，支持 Web 和 Electron Windows 桌面端，通过 HTTP 和 WebSocket 通信。

Windows 桌面版：在根目录运行 `build-desktop.cmd`，一键打包 PyInstaller 后端及 Electron 前端，安装包输出到 `dist/desktop/`。详细说明见 [桌面构建文档](DESKTOP_BUILD.md)。

## 🔄 核心任务循环

AIWorker 将一次任务组织为连续的「模型判断 → 工具执行 → 结果反馈」循环：

1. 接收用户目标，结合会话历史、工作区信息、技能和记忆建立上下文。
2. 模型决定直接回答、调用工具，或向用户请求补充信息。
3. 后端检查工具权限；需要审批时暂停执行，等待用户确认。
4. 执行工具，将结果写入上下文，并向前端推送进度与状态。
5. 模型根据结果继续判断，直到完成本轮任务、触发限制或被用户中断。

核心循环位于 `coworker/engine.py`，工具与智能体组装位于 `coworker/agent.py`，会话调度位于 `coworker/server/manager.py`。模型负责选择下一步，工具负责执行实际操作，前端负责呈现过程和承接用户反馈。

## ✨ 主要功能

- **会话与模型**：流式对话、多提供商配置、连接测试、模型切换、上下文用量与压缩设置。
- **工作区与文件**：目录访问、文件读写、附件上传，以及 Markdown、图片、PDF、CSV 和 Excel 等内容预览。
- **智能体与技能**：智能体安装和管理、技能导入与编辑、会话级能力选择。
- **工具与审批**：本地工具执行、MCP 接入、权限确认、审批收件箱和活动审计。
- **任务与协作**：自动化任务、任务看板、团队协作，以及消息和第三方服务连接器。
- **记忆与偏好**：记忆管理和撤销、中英文界面、浅色/深色及跟随系统外观。

模型服务与外部连接器需要相应的凭据或账号授权。项目支持本地 Web 运行和 Windows Electron 桌面端打包。

## 🛠️ 技术栈

### 🐍 后端

| 技术 | 用途 |
| --- | --- |
| Python 3.11、asyncio | 智能体运行时、异步任务循环和会话调度 |
| FastAPI、Uvicorn | REST API、WebSocket 服务与 ASGI 运行 |
| Pydantic 2 | 数据模型与参数校验 |
| OpenAI / Anthropic / Google GenAI SDK、aisuite | 多模型调用与提供商适配 |
| MCP Python SDK | 外部工具服务器接入 |
| HTTPX、aiohttp、websockets | HTTP 请求、异步连接与事件传输 |
| SQLite、JSON / JSONL、TOML / YAML | 本地状态、会话记录、记忆与配置存储 |
| croniter | 自动化任务的 cron 调度解析 |
| pypdf、pypdfium2 | PDF 内容提取与页面处理 |
| Playwright、Slack Bolt、python-telegram-bot、boto3 | 浏览器工具、消息渠道与云服务集成 |

后端依赖定义在 [coworker/requirements.txt](coworker/requirements.txt)。其中 `aisuite` 固定到一个 Git 提交，安装时需要 Git，并能访问对应 GitHub 仓库。后端使用本地 SQLite 和文件存储，无需单独部署数据库服务。

### 🖥️ 前端

| 技术 | 当前锁定版本 | 用途 |
| --- | --- | --- |
| Vue 3 | 3.5.42 | Composition API、单文件组件与响应式界面 |
| Vite | 5.4.21 | 开发服务器与生产构建 |
| @vitejs/plugin-vue | 5.2.4 | Vue 单文件组件编译 |
| JavaScript ES Modules、CSS | — | 页面逻辑、布局、主题与响应式适配 |
| markdown-it | 15.0.2 | Markdown 渲染 |
| PDF.js / pdfjs-dist | 4.10.38 | PDF 预览 |
| SheetJS / xlsx | 0.18.5 | Excel 文件解析与预览 |
| Fetch、WebSocket | 浏览器原生 API | 请求后端接口、接收流式消息和审批事件 |

上表版本取自 [surfaces_vue/package-lock.json](surfaces_vue/package-lock.json)，依赖声明与脚本见 [surfaces_vue/package.json](surfaces_vue/package.json)。测试使用 Node 内置测试运行器和 Playwright。

## 📋 环境要求

开发环境推荐使用 **Python 3.11.x + Node.js 22.x**。开始前，请安装以下工具，并确保可在终端中调用：

| 工具 | 推荐版本 | 说明 |
| --- | --- | --- |
| Python | 3.11.x | 用于后端运行，建议为项目创建独立虚拟环境 |
| Node.js | 22.x | 用于前端开发、构建和测试 |
| npm | 10.x | 用于安装前端依赖，可使用 Node.js 附带的 npm |
| Git | — | 用于获取源码及安装 Git 来源的 Python 依赖 |

## 📁 项目结构

```text
AIWorker/
├── coworker/                 # Python 后端与智能体运行时
│   ├── engine.py             # 核心任务循环
│   ├── agent.py              # 智能体与工具组装
│   ├── server/               # API、WebSocket、会话管理和启动入口
│   ├── providers/            # 模型提供商适配
│   ├── tools/                # 工具注册与执行
│   ├── connectors/           # 第三方连接器
│   ├── automation/           # 自动化任务
│   ├── memory/               # 记忆存储与工具
│   ├── personas/             # 智能体定义与管理
│   └── requirements.txt      # Python 依赖
├── surfaces_vue/             # 当前主 Web 前端
│   ├── src/                  # Vue 组件、接口封装、样式和语言资源
│   ├── tests/                # 单元测试与浏览器回归脚本
│   ├── package.json
│   └── vite.config.js
├── LICENSE
└── readme.md
```

## 🚀 启动指引

从 GitHub 克隆本仓库后，进入源码根目录，即同时包含 `coworker/` 和 `surfaces_vue/` 的目录。以下分别提供 Windows PowerShell 和 macOS / Linux 的命令，选择适合自己系统的一组执行。

### 1. 创建 Python 环境并安装依赖

**Windows（PowerShell）**

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r coworker/requirements.txt
```

如果系统未安装 Python Launcher（`py`），先使用 `python --version` 确认当前 Python 为 3.11，再将第一条命令改为 `python -m venv .venv`。

**macOS / Linux（Bash 或 Zsh）**

```bash
python3.11 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -r coworker/requirements.txt
```

如果系统的 `python3` 已指向 Python 3.11，也可使用 `python3 -m venv .venv`。部分 Linux 发行版需要先安装 Python 3.11 对应的 `venv` 系统软件包。

上述命令直接调用项目虚拟环境中的 Python，无需先激活虚拟环境。

### 2. 启动后端

在源码根目录打开一个终端，启动后端并保持该终端运行。

**Windows（PowerShell）**

```powershell
.\.venv\Scripts\python.exe -m coworker.server.run --host 127.0.0.1 --port 8765
```

**macOS / Linux**

```bash
./.venv/bin/python -m coworker.server.run --host 127.0.0.1 --port 8765
```

后端默认监听 `http://127.0.0.1:8765`。如需指定初始工作区，可在启动命令末尾添加 `--cwd "工作区路径"`，将占位文字替换为实际目录。其他参数可将启动命令中的 `--host 127.0.0.1 --port 8765` 替换为 `--help` 查看。

请从源码根目录运行模块命令，以确保 Python 能找到 `coworker` 包。

### 3. 启动 Vue 前端

后端启动后，另开一个终端，从源码根目录运行：

```shell
cd surfaces_vue
npm ci
npm run dev
```

浏览器打开 [http://localhost:1421](http://localhost:1421)。前端默认连接 `http://127.0.0.1:8765` 和 `ws://127.0.0.1:8765`。

> 💡 **启动顺序为后端 → 前端。** 后端生成本地接口令牌，Vite 启动时从状态目录读取 `sidecar-8765.token`。后端重新启动后会生成新令牌，此时应重启前端开发服务器并刷新页面。

### 4. 配置模型并开始任务

1. 按首次使用引导连接模型，或进入「设置 → 模型」。
2. 点击提供商卡片，填写凭据；有需要时展开「自定义端点」。
3. 执行连接测试并保存，选择显示在输入框中的模型并设置默认模型。
4. 新建会话，选择工作目录，输入任务；根据实际需要处理审批和连接器授权。

启动页面不要求事先填写模型密钥，实际执行模型任务前需要完成模型配置。外部连接器可按需接入。

## ⚙️ 配置与数据目录

默认状态目录如下，可通过 `COWORKER_STATE_DIR` 修改：

| 系统 | 默认目录 |
| --- | --- |
| Windows | `%APPDATA%\coworker` |
| macOS / Linux | `~/.config/coworker` |

全局配置位于状态目录下的 `config.toml`，工作区配置位于 `<工作区>/.coworker/config.toml`。设置自定义状态目录时，前后端终端需要使用相同的 `COWORKER_STATE_DIR`。

后端默认对状态目录持有进程锁；同一目录已被使用时等待最多 10 秒，随后以退出码 `3` 拒绝重复启动。Electron 固定使用严格模式。独立服务优先配置不同的状态目录；确需兼容旧启动方式时可显式设置 `COWORKER_STATE_LOCK=warn`，此模式只记录竞争告警，不能保证状态目录并发写入安全。凭据写入和 OAuth 刷新另有跨进程事务锁，取得锁后会重读最新凭据，锁超时拒绝写入。

后端新增以下配置，环境变量优先于 TOML：

| TOML 字段 | 环境变量 | 默认值及作用 |
| --- | --- | --- |
| `max_output_tokens` | `COWORKER_MAX_OUTPUT_TOKENS` | 未设置时沿用提供商默认；设置正整数输出上限 |
| `reasoning_effort` | `COWORKER_REASONING_EFFORT` | 可选 `none`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`，按提供商能力映射 |
| `tool_result_max_bytes` | `COWORKER_TOOL_RESULT_MAX_BYTES` | `10000` 字节；`0` 关闭结果预算 |
| `compaction_cap_tokens` | `COWORKER_COMPACTION_CAP_TOKENS` | `250000`，压缩触发上限；同时受模型窗口比例限制 |
| `compaction_summary_max_tokens` | `COWORKER_COMPACTION_SUMMARY_MAX_TOKENS` | `16000`，摘要模型输出上限 |

设置页保存的压缩参数优先于上述配置，并对现有会话生效。超限工具结果的全文和被压缩历史保存在会话临时目录的 `tool-output` 下；模型可通过返回路径回读，界面也可打开压缩记录中的全文。摘要会保留最初任务、近期用户修正、工作状态及省略计数。

输出达到提供商上限且没有工具行动时自动续接，连续最多两次；仍未完成则显示“输出已截断”，可以重试，自动化不会因此记为成功。停止会话会持久化停止状态并取消旧提醒，新的用户输入可以继续会话。`current_time` 和 `runtime_context` 分别提供按需时间与有限环境信息，环境发现不读取 `.env` 或凭据内容。

模型管理显示密钥来自应用保存还是环境变量；环境变量密钥需在启动环境中修改，因此隐藏移除按钮。Telegram 审批人可在连接器账号页配置；私聊默认仅允许该聊天用户处理审批，群聊需要显式审批人，同时校验审批绑定的聊天和渠道。

前端支持以下环境变量：

| 环境变量 | 用途 |
| --- | --- |
| `VITE_COWORKER_HTTP` | 后端 HTTP 地址，默认 `http://127.0.0.1:8765` |
| `VITE_COWORKER_WS` | 后端 WebSocket 地址，默认 `ws://127.0.0.1:8765` |
| `VITE_COWORKER_API_TOKEN` | 显式指定接口令牌；默认开发流程自动读取本地令牌文件 |

如修改后端端口，需要同时修改 HTTP、WebSocket 地址，并提供对应端口的令牌。Vite 的自动读取路径固定为 `sidecar-8765.token`。

## 🧪 构建与验证

### 单独使用 PyInstaller 打包后端

在 **项目根目录** 打开 PowerShell 执行。以下示例使用本机项目路径；其他机器请替换为实际路径。
要求 `.venv-desktop` 已创建并安装 `coworker/requirements.txt` 和 `packaging/requirements-build.txt` 中的依赖；首次可通过根目录的 `build-desktop.cmd` 完成环境准备及完整打包。

```powershell
cd D:\self_Code_Storage\gongniu\gongniu_worker\openworker

# 先生成图标：优先 logo.png，不存在时使用 AIworker_logo.png
.\.venv-desktop\Scripts\python311.exe packaging/make_icon.py

# 按 spec 配置打包后端
.\.venv-desktop\Scripts\python311.exe -m PyInstaller --noconfirm --clean --distpath dist --workpath build/pyinstaller packaging/coworker.spec

# 可选：检查生成的后端 EXE 能否启动并响应鉴权接口
.\.venv-desktop\Scripts\python311.exe packaging/smoke_backend.py dist/coworker-server/coworker-server.exe
```

若虚拟环境中的解释器名为 `python.exe`，将命令中的 `python311.exe` 替换为 `python.exe`。

| 参数 | 作用 |
| --- | --- |
| `--noconfirm` | 允许覆盖已有构建产物，不再询问 |
| `--clean` | 构建前清理 PyInstaller 缓存和临时文件 |
| `--distpath dist` | 指定最终产物输出目录 |
| `--workpath build/pyinstaller` | 指定构建中间文件目录 |
| `packaging/coworker.spec` | 指定后端入口、依赖、资源和图标等打包配置 |

后端最终产物为 `dist/coworker-server/`，运行和分发时必须保留整个目录（包括 `_internal/`），不能只复制 EXE。
上述操作只更新独立后端产物；更新桌面安装包请运行根目录的 `build-desktop.cmd`，完整流程见 [桌面构建文档](DESKTOP_BUILD.md)。

### Vue 前端构建与验证

在 `surfaces_vue/` 中运行：

```shell
npm test
npm run build
```

生产构建输出到 `surfaces_vue/dist/`。如需在本机预览构建结果并连接后端，先保持后端在默认端口运行，再于前端目录执行：

**Windows（PowerShell）**

```powershell
$aiworkerStateDir = if ($env:COWORKER_STATE_DIR) {
    $env:COWORKER_STATE_DIR
} else {
    Join-Path $env:APPDATA 'coworker'
}
$env:VITE_COWORKER_API_TOKEN = (Get-Content -Raw (Join-Path $aiworkerStateDir 'sidecar-8765.token')).Trim()
npm run build
Remove-Item Env:\VITE_COWORKER_API_TOKEN
npm run preview -- --host 127.0.0.1 --port 4173
```

**macOS / Linux（Bash 或 Zsh）**

```bash
aiworker_state_dir="${COWORKER_STATE_DIR:-$HOME/.config/coworker}"
export VITE_COWORKER_API_TOKEN="$(cat "$aiworker_state_dir/sidecar-8765.token")"
npm run build
unset VITE_COWORKER_API_TOKEN
npm run preview -- --host 127.0.0.1 --port 4173
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。构建阶段不会自动读取开发令牌，所以上述本地预览流程显式传入令牌；它会被编入构建产物，此产物仅用于本机预览，不应发布到公共站点。后端重启后，需使用新令牌重新构建。

## 🔎 常见启动问题

| 现象 | 排查方式 |
| --- | --- |
| 提示找不到 `coworker` 模块 | 回到源码根目录，使用 `python -m coworker.server.run` 形式启动 |
| 提示缺少 `fastapi` 等模块 | 使用同一个虚拟环境解释器安装 `coworker/requirements.txt` 并启动服务 |
| 前端请求返回 401 或 WebSocket 无法认证 | 确认先启动后端，再重启 Vite；自定义状态目录时保持两端设置一致 |
| 前端端口 1421 已被占用 | 关闭占用进程，或通过 `npm run dev -- --port 1422` 使用其他端口 |
| 后端已连接，但模型调用失败 | 在「设置 → 模型」检查凭据、端点、模型名称和连接测试结果 |

## 🙌 致谢与许可证

感谢吴恩达团队的核心任务循环方法论及相关开源工作。AIWorker 由 **tedzheng** 开发并主要维护。

仓库采用 [MIT License](LICENSE)，保留现有上游版权声明。第三方依赖与品牌资源遵循各自的许可证和使用条款。
