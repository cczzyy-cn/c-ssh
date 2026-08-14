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
- 已知编译注意点：`ssh2`（libssh2）在 Windows 需 `openssl` vendored 特性，`Cargo.toml` 中 `ssh2 = { version = "0.9", features = ["vendored-openssl"] }` 即可免系统依赖。

---

## 8. 里程碑计划

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| M0 脚手架 | Tauri + React + xterm.js 跑通，本地 `echo` 管道演示 | 前端输入回显到终端，fit/resize 生效 |
| M1 核心 | ssh2 会话、认证三方式、连接配置 CRUD、多标签、resize | 可密码/密钥连上真实服务器并交互 |
| M2 主题 | 内置主题、亮/暗/跟随系统、连接级覆盖、设置面板 | 切换主题 UI 与终端配色即时生效 |
| M3 体验 | 搜索、URL 高亮、快捷键、导入导出、日志 | 日常使用无明显短板 |
| M4 高级 | SFTP、跳板、端口转发、自动重连 | 覆盖常用运维场景 |

---

## 9. 关键取舍说明

- **为什么不用 Node sidecar（ssh2 npm + node-pty）**：需要捆绑 Node 运行时、多一个进程与 IPC 层，体积和复杂度都上升；Rust `ssh2` crate 与 Node `ssh2` 同源（都是 libssh2 生态），功能对等，单二进制更符合"轻量"目标。
- **为什么不用本地 `ssh` 二进制**：跨平台行为不一致（Windows 无内置 ssh 配置差异）、无法做连接管理内聚；自实现协议层可控性最好。
- **为什么不选 Electron**：体积与内存是轻量需求的反面；Tauri 2 的 WebView 渲染 xterm.js 性能足够。
- **为什么终端数据用 base64 而非裸二进制**：Tauri 2 IPC 默认 JSON 序列化，base64 实现最简单可靠；交互式 SSH 数据量小，33% 开销可接受，M3 再评估二进制通道。
