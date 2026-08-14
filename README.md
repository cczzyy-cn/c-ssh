# c-ssh

轻量级跨平台 SSH 客户端：Tauri 2 + React + xterm.js + ssh2（Rust crate）。

- 连接配置管理：分组、搜索、密码/私钥/SSH Agent 认证（凭据存 OS keyring，不落盘）
- 多标签终端：自适应窗口、实时同步远端尺寸
- 主题系统：内置 8 套主题（One Dark / Dracula / Nord / Solarized / Gruvbox / 默认亮暗），
  亮 / 暗 / 跟随系统三档，支持连接级覆盖
- 演示终端：无需服务器即可体验终端链路（echo 回显）

## 环境要求

- Node.js 18+（前端构建）
- Rust 工具链（Tauri 编译，首次需安装 `rustup default stable`）

## 开发

```bash
npm install
npm run tauri dev
```

## 构建

```bash
npm run tauri build
```

产物：Windows（NSIS/MSI）、macOS（dmg）、Linux（AppImage/deb）。

## 目录结构

```
src/            前端（React + TS）
  components/   Sidebar / ConnectionForm / TabBar / TerminalPane / SettingsPanel
  stores/       zustand：connections / tabs / theme
  themes.ts     内置主题定义
src-tauri/      Rust 后端
  src/ssh.rs    SSH 会话（ssh2 crate：PTY + shell + 字节流双向转发）
  src/store.rs  连接配置 JSON + keyring 凭据
  src/commands.rs  Tauri 命令
```

详见 `docs/ssh-client-design.md` 设计方案。
