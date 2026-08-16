# 轻量级 SSH 客户端设计方案

> 项目代号：**c-ssh**
> 目标：一款轻量（安装包 ~10–15 MB）、跨平台（Windows / macOS / Linux）、带连接配置管理与主题系统的 SSH 终端客户端。
> 技术栈：**Tauri 2 + React + TypeScript + xterm.js + ssh2（Rust crate）**

---

## 1. 总体概览

| 维度 | 选择 | 理由 |
|---|---|---|
| 应用外壳 | Tauri 2（Rust 主进程 + 系统 WebView） | 安装包体积小、内存占用低、跨平台一致、IPC 安全 |
| 前端 UI | React + TypeScript + Vite | xterm.js 生态最贴合；组件化管理连接列表/设置/主题 |
| 终端模拟 | xterm.js（含 fit / web-links / search / unicode11 addon） | 终端模拟事实标准，功能完整、性能好 |
| SSH 协议 | Rust `ssh2` crate（libssh2 绑定） | 与 Node `ssh2` 同源协议栈；无需捆绑 Node 运行时，单二进制 |
| 状态管理 | zustand | 轻量，适合 tabs / connections / theme 三块状态 |
| 样式 | CSS 变量 + `data-theme` 属性 | 主题系统直接复用 CSS 变量，切换零重载 |
| 凭据存储 | OS keyring（Rust `keyring` crate） | 密码/口令不进配置文件 |

**终端数据流（核心）**

```
xterm.js (前端)  ←─ Channel 事件 ──  Tauri 主进程 (Rust)
   │  用户输入  ── invoke ─────────→│
   │                                ├─ ssh2: Session / Channel (远程 PTY + shell)
   │                                └─ 字节流双向转发
```

- 远程会话**不需要本地 PTY**：直接用 `ssh2` 的 `channel.request_pty(...)` + `channel.shell()`，通道的 stdout 字节流推给 xterm.js，xterm.js 的输入字节写回通道。
- 传输层：MVP 用 `tauri::ipc::Channel<Vec<u8>>` 推终端输出（字节以 base64 编码走 IPC）；若大输出场景出现卡顿，再升级为 Tauri 2 二进制 payload 或分块发送。

---

## 2. 功能清单

### 2.1 MVP（里程碑 M1–M2）

**连接管理**
- 连接配置 CRUD：名称、主机、端口、用户名、认证方式
- 分组 + 模糊搜索 + 排序 + 最近连接
- 一键连接、连接测试（只认证不开终端）
- 导入 / 导出连接配置（JSON）

**终端**
- 多标签页（每个会话一个 tab）、关闭/重命名标签
- 复制粘贴（Ctrl+Shift+C/V、右键菜单、选中即复制可选）
- 字号调节（Ctrl+`+`/`-`）、窗口自适应（fit addon）、回滚滚动
- 终端大小变化实时同步远端（`window_change`）

**SSH**
- 认证：密码 / 私钥（Ed25519、RSA，支持 passphrase）/ SSH Agent
- keep-alive 心跳、断线提示与手动重连
- 转义键（Ctrl+C 等）、常见交互终端（vim、htop、tmux）正常渲染

**主题**
- 内置 6+ 主题（One Dark、Dracula、Nord、Solarized Dark/Light、Gruvbox）
- 亮 / 暗 / 跟随系统（`prefers-color-scheme`）三档
- 主题同时作用于 UI（CSS 变量）与终端（xterm.js ANSI 16 色）
- 每个连接可单独覆盖主题

### 2.2 里程碑 M3–M4（后续增强）

- 终端内搜索（search addon）、URL 高亮（web-links addon）
- SFTP 文件浏览/上传/下载
- 跳板机（ProxyJump）、本地/远程/动态端口转发
- 断线自动重连、会话日志记录
- 主题编辑器（GUI 调色板）、主题/配置在线导入
- 快捷键面板、多语言（i18n）

---

## 3. 数据模型

### 3.1 连接配置（`connections.json`）

```json
{
  "id": "b3f2...",
  "name": "生产服务器",
  "group": "生产环境",
  "host": "192.168.1.10",
  "port": 22,
  "username": "root",
  "auth": {
    "type": "password",              // password | key | agent
    "keyPath": "~/.ssh/id_ed25519",  // type=key 时
    "useAgent": true                 // type=agent 时
  },
  "options": {
    "keepAliveInterval": 30,
    "compression": false,
    "connectTimeout": 10
  },
  "terminal": {
    "fontSize": 14,
    "fontFamily": "Cascadia Mono, Consolas, monospace",
    "cursorStyle": "block",
    "scrollback": 5000
  },
  "theme": "One Dark"
}
```

**安全约定**
- 密码 / 私钥 passphrase **永不写入 JSON**，存 OS keyring（`keyring` crate，键 = 连接 id）。
- 编辑连接时密码字段留空 = 保持不变；前端不回读已存密码。
- 私钥路径支持 `~` 展开；`type=agent` 时无任何密钥材料落盘。

### 3.2 主题文件（`themes/*.json`）

```json
{
  "name": "One Dark",
  "type": "dark",                     // dark | light
  "ui": {
    "--color-bg": "#282c34",
    "--color-bg-alt": "#21252b",
    "--color-fg": "#abb2bf",
    "--color-accent": "#61afef",
    "--color-border": "#3e4451",
    "--color-hover": "#2c313a",
    "--color-selection": "#3e4451"
  },
  "terminal": {
    "background": "#282c34",
    "foreground": "#abb2bf",
    "cursor": "#528bff",
    "cursorAccent": "#282c34",
    "selectionBackground": "#3e4451",
    "black": "#282c34", "red": "#e06c75",
    "green": "#98c379", "yellow": "#e5c07b",
    "blue": "#61afef",  "magenta": "#c678dd",
    "cyan": "#56b6c2",  "white": "#abb2bf",
    "brightBlack": "#5c6370", "brightRed": "#e06c75",
    "brightGreen": "#98c379", "brightYellow": "#e5c07b",
    "brightBlue": "#61afef",  "brightMagenta": "#c678dd",
    "brightCyan": "#56b6c2",  "brightWhite": "#ffffff"
  }
}
```

- `ui` 直接映射为 `<html data-theme="...">` 下的 CSS 变量，UI 样式全部引用变量，**换主题 = 换变量表，无重载**。
- `terminal` 映射为 xterm.js 的 `theme` 配置；新建会话时读取当前（或连接级覆盖的）主题。
- 跟随系统：系统主题变化事件 → 自动切换内置亮/暗默认主题。
- 内置主题打包进二进制（`include_dir!`），用户自定义主题存 `themes/` 目录，支持导入导出。

### 3.3 存储位置（跨平台）

| 内容 | 路径（`dirs` crate） |
|---|---|
| 连接配置 | `config_dir()/c-ssh/connections.json` |
| 用户主题 | `config_dir()/c-ssh/themes/*.json` |
| 会话日志 | `data_dir()/c-ssh/logs/` |

Windows 即 `%APPDATA%\c-ssh\`，macOS `~/Library/Application Support/c-ssh/`，Linux `~/.config/c-ssh/`。

---

## 4. Tauri IPC 设计

### 4.1 Commands（`invoke`，走 capabilities 白名单）

```
list_connections() → Connection[]
save_connection(cfg) → Connection       // 密码类字段单独走 set_secret
delete_connection(id)
test_connection(id) → { ok, error? }    // 只认证，立即断开

open_session(connId) → { sessionId }    // 建立 ssh2 会话并启动转发任务
write_input(sessionId, bytes: base64)
resize(sessionId, cols, rows)           // channel.window_change
close_session(sessionId)
reconnect(sessionId)

list_themes() / get_theme(name) / save_theme(json) / delete_theme(name)
get_settings() / save_settings(settings)
```

### 4.2 事件 / Channel（后端 → 前端）

```
term:data    { sessionId, bytes }   // 终端输出（Channel 推送）
term:exit    { sessionId, code? }   // 会话结束
term:error   { sessionId, message }
conn:status  { sessionId, state }   // connecting / auth / connected / closed
```

### 4.3 会话生命周期（Rust 侧）

```
open_session
  → TcpStream::connect(host:port)（connectTimeout 内）
  → Session::handshake
  → 按 auth.type 认证（password / pubkey_file / agent）
  → channel.request_pty(term="xterm-256color")
  → channel.shell()
  → 后台线程循环：channel.read → Channel 推送 term:data
  → 前台事件：write_input → channel.write
  → resize → channel.window_change
  → EOF/错误 → term:exit / term:error → 清理资源
```

每个会话一个 `Arc<Mutex<SessionState>>`，以 `sessionId` 为 key 存 `HashMap`；关闭时显式 `channel.close()` + 线程 join。

---

## 5. 目录结构

```
c-ssh/
├── package.json / vite.config.ts / tsconfig.json
├── src/                          # 前端
│   ├── main.tsx / App.tsx
│   ├── components/
│   │   ├── Sidebar.tsx           # 连接列表/分组/搜索/最近
│   │   ├── ConnectionForm.tsx    # 新建/编辑连接
│   │   ├── TabBar.tsx
│   │   ├── TerminalPane.tsx      # xterm.js 封装（Terminal + addons + IPC 桥）
│   │   └── SettingsPanel.tsx
│   ├── stores/                   # zustand
│   │   ├── connections.ts / tabs.ts / theme.ts / settings.ts
│   ├── themes/                   # 内置主题 JSON
│   └── ipc/                      # invoke / Channel 封装 + 类型
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json           # 窗口尺寸、CSP、bundle 配置
│   ├── capabilities/default.json # IPC 白名单
│   └── src/
│       ├── main.rs / lib.rs
│       ├── commands.rs           # Tauri 命令注册
│       ├── ssh/                  # session.rs / auth.rs / keepalive.rs
│       ├── store/                # connections.rs / themes.rs / keyring.rs
│       └── events.rs             # Channel 与事件封装
└── docs/
```

**依赖清单（Rust）**：`tauri`、`tauri-plugin-shell`（可选）、`ssh2`、`dirs`、`keyring`、`serde`、`tokio`（或 std 线程 + `tauri::async_runtime`）、`include_dir`。
**依赖清单（前端）**：`react`、`xterm`、`@xterm/addon-fit/web-links/search/unicode11`、`zustand`、`@tauri-apps/api`、`@tauri-apps/cli`。

---

## 6. 安全设计

1. **凭据隔离**：密码/passphrase 只进 OS keyring；连接配置文件不含任何秘密，可放心备份/同步。
2. **IPC 白名单**：Tauri capabilities 只开放上述 commands，禁用 `shell` 插件（除非 M3 需要），前端运行在沙箱 WebView。
3. **CSP**：`tauri.conf.json` 配置严格 CSP，禁止远程资源加载。
4. **不落日志**：终端日志可选且默认关闭；任何日志不记录密码与密钥内容。
5. **主机密钥校验**：首次连接显示指纹并要求确认（known_hosts 支持），防中间人。

---

## 7. 构建与发布

- 开发：`npm run tauri dev`（需要 Rust 工具链 + Node 18+）。
- 打包：`npm run tauri build` → Windows（NSIS/MSI）、macOS（dmg，需签名公证）、Linux（AppImage/deb）。
- CI：GitHub Actions 三平台矩阵 + `tauri-action`，Rust 依赖缓存，产物上 Release。
- 体积预期：安装包 ~10–15 MB（对比 Electron 同类 100 MB+）。
- 已知编译注意点：
  - `ssh2`（libssh2）依赖 `openssl-src` 从源码编译 OpenSSL，**需要完整的 Perl**。Windows 上 Git Bash 自带的 MSYS Perl 缺少模块会失败（报 `Can't locate Locale/Maketext/Simple.pm`），需安装 Strawberry Perl 并确保其 `perl` 在 PATH 最前：`winget install StrawberryPerl.StrawberryPerl`。
  - `Cargo.toml` 中 `ssh2 = { version = "0.9", features = ["vendored-openssl"] }` 可免系统 OpenSSL 依赖。
  - ssh2 0.9 API 与旧版不同：PTY 用 `channel.request_pty("xterm-256color", None, Some((w,h,0,0)))`，调整尺寸用 `channel.request_pty_size(cols, rows, None, None)`（无 `Pty` 结构体、无 `window_change`）；keep-alive 用 `session.set_keepalive(false, interval_secs)`（libssh2 应用层心跳，替代不稳定且平台相关的 TCP keepalive API）。

---

## 8. 里程碑状态

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 脚手架 | Tauri + React + xterm.js 跑通，本地 echo 演示 | ✅ 已完成（演示终端按钮） |
| M1 核心 | ssh2 会话、认证三方式、连接配置 CRUD、多标签、resize | ✅ 已完成 |
| M2 主题 | 内置 8 套主题、亮/暗/跟随系统、连接级覆盖、设置面板 | ✅ 已完成 |
| M3 体验 | 终端搜索、URL 高亮、快捷键（复制/粘贴/字号）、导入导出配置、字号设置 | ✅ 已完成 |
| M4 高级 | SFTP 面板、SOCKS5/HTTP 代理、本地端口转发、断线自动重连 | ✅ 已完成 |

**M4 说明与取舍**
- **跳板机（ProxyJump）未实现**：需递归 SSH 隧道，复杂度高；以 SOCKS5/HTTP 代理作为替代（配合本机 `ssh -D` 或第三方代理工具可达同样效果）。
- **端口转发并发模型**：ssh2 Channel 无 `try_clone`，双向转发采用 `Arc<Mutex<Channel>>` 双线程——写方向在锁内瞬时完成，读方向持锁等待。SSH 隧道典型请求/响应场景工作正常；对端永久无响应且本地持续写满缓冲的极端场景会阻塞（由 SSH keep-alive 与 TCP 超时兜底）。
- **SFTP**：SSH 会话懒创建 SFTP 句柄，浏览/上传/下载/建目录/删除均通过独立 IPC 命令；上传走系统文件选择器，下载走保存对话框（自动保留远程后缀）。

**后续迭代新增（未在原始里程碑中）**
| 功能 | 说明 |
|---|---|
| 三栏布局 | 左连接列表 / 中标签+终端 / 右文件栏，两侧宽度可拖拽（持久化） |
| 软件内本地命令行 | `portable-pty`（Windows ConPTY）会话，`>_` 按钮在软件内开 cmd/shell 标签，复用终端通道 |
| 自绘标题栏 | `decorations: false` + 前端 TitleBar（拖拽/双击最大化/窗口控制），颜色跟随主题 |
| 界面字号设置 | CSS 变量体系（`--ui-fs-base`）全局缩放 UI 字体与 emoji 图标，终端字号独立 |
| 会话可靠性 | 非阻塞读写 + 锁互斥（keepalive/读写/SFTP 均串行访问 libssh2）；`write_input` 不误调 `flush()`（libssh2_channel_flush_ex 会丢接收缓冲）；TCP 连接超时受 `connect_timeout` 控制 |
| 错误日志增强 | 会话读线程/端口转发错误入日志、日志内容软件内查看（LogViewer） |

**v0.2.0 新增**
| 功能 | 说明 |
|---|---|
| KEX 降级兼容 | 握手 KEX 失败自动降级算法重试（`diffie-hellman-group1-sha1` / `ssh-rsa` / `3des-cbc` 等），兼容老服务器/设备 |
| 标签快捷键 | `Ctrl+Tab` MRU 切换——优先切回上一个激活标签（两标签来回切），无记录回退位置切换，单标签无操作 |
| 标签固定序号 | 序号绑定连接身份（创建顺序），拖拽互换后序号跟随连接不变 |
| 标签拖拽优化 | 拖动中内容零重排、目标标签高亮，松手按真实位置互换；标签最小宽度 130px、溢出隐藏滚动条 + 滚轮横向滚动 |
| 文件栏行为 | 连接/切换标签不再自动打开文件栏，由 📁 按钮手动控制（全局开关） |
| 主题增强 | 主题卡片色块显示主 UI 配色（含边框/分隔色）；新增 `divider` 分隔色变量（标签/列表/栏位分隔线）；导入主题可输入新主题名 |
| 快捷键体系 | Ctrl+Tab、Ctrl+Shift+C/V（复制/粘贴）、Ctrl+F（搜索）、Ctrl+=/-（字号）等 |

**v0.2.1（UI/UX 优化补丁）**
| 项 | 说明 |
|---|---|
| 连接表单布局 | 弹窗加宽至 720px 避免两列挤压；代理字段全宽排列；主机 label 文字+提示同行对齐；checkbox 与文字同行垂直居中（修复被 width:100% 拉伸） |
| 连接列表交互 | 操作按钮 ⚡测试 → ▶打开连接；双击打开提示改为鼠标悬停连接项的标题气泡 |
| 全局控件风格 | 禁用默认右键菜单；滚动条轨道透明（滑块主题色）；number 输入框隐藏系统上下箭头；checkbox/单选/滑块用主题强调色（accent-color） |
| 主题卡片 | 选中高亮改 inset 阴影（修复网格边缘左侧边框裁剪）；删除按钮移到最右 |

---

## 9. 关键取舍说明

- **为什么不用 Node sidecar（ssh2 npm + node-pty）**：需要捆绑 Node 运行时、多一个进程与 IPC 层，体积和复杂度都上升；Rust `ssh2` crate 与 Node `ssh2` 同源（都是 libssh2 生态），功能对等，单二进制更符合"轻量"目标。
- **为什么不用本地 `ssh` 二进制**：跨平台行为不一致（Windows 无内置 ssh 配置差异）、无法做连接管理内聚；自实现协议层可控性最好。
- **为什么不选 Electron**：体积与内存是轻量需求的反面；Tauri 2 的 WebView 渲染 xterm.js 性能足够。
- **为什么终端数据用 base64 而非裸二进制**：Tauri 2 IPC 默认 JSON 序列化，base64 实现最简单可靠；交互式 SSH 数据量小，33% 开销可接受，M3 再评估二进制通道。
