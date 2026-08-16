# 主题配色系统增强方案（v2）

> 状态：设计定稿，分期实施（P0–P3）
> 目标：语义化配色、支持自定义主题、GUI 编辑、智能联动

## 1. 现状问题

1. **语义色缺失**：UI 仅 11 个颜色变量，组件存在硬编码色（状态点 `#3fb950`/`#d29922`、关闭按钮 `#e81123`、滚动条等），不随主题变化。
2. **不能自定义**：8 套内置主题写死在前端 TS，用户无法创建/导入主题。
3. **UI 与终端色系割裂**：每套主题的 `ui`（CSS 变量）与 `terminal`（ANSI 16 色）是两套手工数据，不保证协调。
4. **连接级主题不智能**：连接指定深色主题后，跟随系统切浅色不联动。
5. **无编辑/预览**：调色需改代码重编译。

## 2. 目标模型

```
ThemeDef {
  name: string
  type: "dark" | "light"
  palette: Palette          // 基础色板（种子色，用户可编辑的核心）
  ui?: Record<string,string> // 语义 CSS 变量（由 palette 派生，可覆盖）
  terminal: TermColors      // xterm 色板（背景/前景/光标/ANSI 16），可覆盖
}
```

### 2.1 Palette（基础色板）

```ts
interface Palette {
  bg: string; bgAlt: string; bgInput: string;
  fg: string; fgDim: string;
  accent: string; accentFg: string;
  border: string; hover: string; selection: string;
  danger: string;
  success: string; warning: string; info: string; link?: string;
}
```

### 2.2 派生规则（palette → ui）

`deriveUi(palette)` 生成全部语义变量，主题只需定义 palette + 少量覆盖：

```
--color-bg / --color-bg-alt / --color-bg-input / --color-fg / --color-fg-dim
--color-accent / --color-accent-fg / --color-border / --color-hover / --color-selection
--color-danger / --color-success / --color-warning / --color-info / --color-link(=accent)
--color-focus-ring（=accent 半透明）
```

### 2.3 派生规则（palette → terminal）

`deriveTerminal(palette, terminal?)`：
- `background = palette.bg`、`foreground = palette.fg`
- ANSI 16 优先取主题自带色板；未提供时从 palette 派生基础灰阶（black/brightBlack/white 等）

## 3. 分期实施

### P0 语义色 + 派生生成器
- 重构 `themes.ts`：引入 `Palette`、`deriveUi`、`deriveTerminal`
- 新增语义 CSS 变量并替换全部硬编码色（状态点、关闭按钮、链接、焦点环、滚动条）
- 现有主题迁移为 palette 定义（ui 由派生生成，terminal 保留）

### P1 自定义主题
- 主题文件外置：`config_dir/c-ssh/themes/*.json`（内置主题仍打包）
- 后端命令：`list_user_themes` / `save_theme` / `delete_theme`
- 设置面板：内置 + 用户主题分区、导入/导出/删除

### P2 主题编辑器
- 从当前主题克隆 → 实时调色（`<input type=color>` + hex）→ 即时预览（可还原）
- ANSI 16 微调面板；保存为 JSON 用户主题

### P3 智能联动
- 连接级主题在深浅模式切换时联动：连接主题 `type` 与当前解析模式不一致时，回退到对应的默认亮/暗主题（保留连接级强指定能力）

## 4. 兼容性

- 旧主题结构（`ui` + `terminal`）向后兼容：加载时若缺 `palette`，从 `ui` 反向提取生成
- 旧用户配置/连接主题名不受影响
