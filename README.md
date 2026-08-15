# c-ssh

轻量级跨平台 SSH 客户端：Tauri 2 + React + xterm.js + ssh2（Rust crate）。

## 功能特性

**连接与终端**
- 连接配置管理：分组、搜索、导入/导出（JSON）、连接测试
- 认证：密码 / 私钥 / SSH Agent（凭据存 OS keyring，不落盘）
- 多标签终端：标签保活（切换不丢内容）、自适应窗口、实时同步远端尺寸、断线自动重连
- 终端体验：搜索（Ctrl+Shift+F）、URL 高亮、复制粘贴（Ctrl+Shift+C/V）、字号调节（Ctrl+= / Ctrl+-）
- 连接中状态提示（占位标签 + 进度动画）、连接超时配置（3–60s）

**SFTP 文件栏**
- 软件全局右侧文件栏（连接成功自动打开，可收起）
- 浏览 / 上传 / 下载 / 新建目录 / 删除，每连接缓存目录状态（切换标签不重新拉取）
- 下载自动保留远程文件后缀；删除/清空走系统原生确认对话框

**高级**
- 本地端口转发（SSH 隧道）、SOCKS5/HTTP 代理、Keep-Alive 心跳
- 软件内本地命令行（portable-pty，Windows ConPTY）：`>_` 按钮在软件内打开 cmd/shell 标签
- 演示终端（echo 回显）：无需服务器体验终端链路

**界面**
- 三栏布局：连接列表 / 标签+终端 / 文件栏，两侧宽度可拖拽调整（持久化）
- 主题系统：8 套内置主题（One Dark / Dracula / Nord / Solarized / Gruvbox / 默认亮暗），
  亮 / 暗 / 跟随系统三档，连接级覆盖，窗口标题栏明暗跟随
- 自绘标题栏（拖拽 / 双击最大化 / 窗口控制）
- 界面字号（字体与图标）与终端字号独立调节

**可靠性**
- 全局错误日志：Rust panic、IPC 命令错误、会话错误、前端 JS 错误统一写入
  `data_dir/c-ssh/logs/app.log`（1MB 轮转，不含密码/密钥），设置内可直接查看
- SSH 会话非阻塞模式 + 锁互斥（避免读写/keepalive 并发卡死）

## 环境要求

- Node.js 18+（前端构建）
- Rust 工具链（Tauri 编译，首次需安装 `rustup default stable`）
- Windows 构建额外需要完整 Perl（`winget install StrawberryPerl.StrawberryPerl`），
  供 vendored OpenSSL 源码编译

## 开发

```bash
npm install
npm run tauri dev
```

## 构建

```bash
npm run tauri build
```

产物：Windows（NSIS/MSI，约 2–3 MB）、macOS（dmg）、Linux（AppImage/deb）。

## 目录结构

```
src/            前端（React + TS）
  components/   Sidebar / ConnectionForm / TabBar / TerminalPane / SftpPanel / SettingsPanel / LogViewer / TitleBar
  stores/       zustand：connections / tabs / theme / settings
  themes.ts     内置主题定义
src-tauri/      Rust 后端
  src/ssh.rs    SSH/本地 shell 会话（ssh2 + portable-pty）
  src/store.rs  连接配置 JSON + keyring 凭据
  src/logger.rs 全局错误日志
  src/commands.rs  Tauri 命令（异步 + spawn_blocking）
```

详见 `docs/ssh-client-design.md` 设计方案。
