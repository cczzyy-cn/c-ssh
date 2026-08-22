/** 基础色板（主题的种子色，用户可编辑的核心） */
import type { ThemeDefJson } from "./ipc";

export interface Palette {
  bg: string;
  bgAlt: string;
  bgInput: string;
  fg: string;
  fgDim: string;
  accent: string;
  accentFg: string;
  border: string;
  hover: string;
  selection: string;
  /** 分隔线色（列表/标签分隔），默认派生自 border */
  divider?: string;
  danger: string;
  success: string;
  warning: string;
  info: string;
  link?: string;
}

export interface ThemeDef {
  name: string;
  type: "dark" | "light";
  palette: Palette;
  /** UI 语义变量覆盖（一般无需，由 palette 派生） */
  ui?: Record<string, string>;
  /** xterm 色板（background/foreground/cursor/ANSI 16） */
  terminal: Record<string, string>;
}

/** palette → UI 语义 CSS 变量 */
export function deriveUi(p: Palette, overrides?: Record<string, string>): Record<string, string> {
  const ui: Record<string, string> = {
    "--color-bg": p.bg,
    "--color-bg-alt": p.bgAlt,
    "--color-bg-input": p.bgInput,
    "--color-fg": p.fg,
    "--color-fg-dim": p.fgDim,
    "--color-accent": p.accent,
    "--color-accent-fg": p.accentFg,
    "--color-border": p.border,
    "--color-divider": p.divider ?? p.border,
    "--color-hover": p.hover,
    "--color-selection": p.selection,
    "--color-danger": p.danger,
    "--color-success": p.success,
    "--color-warning": p.warning,
    "--color-info": p.info,
    "--color-link": p.link ?? p.accent,
  };
  return { ...ui, ...overrides };
}

/** palette → xterm 基础色（背景/前景/光标/选区由 palette 派生，优先于主题自带值）；
 *  ANSI 16 色保留主题自带（或回退默认）。 */
export function deriveTerminal(p: Palette, t?: Record<string, string>): Record<string, string> {
  const custom = t ?? {};
  return {
    ...custom,
    // 基础色跟随 palette：改背景/前景/选区色时终端内容同步变化
    background: p.bg,
    foreground: p.fg,
    cursor: p.fg,
    cursorAccent: p.bg,
    selectionBackground: p.selection,
  };
}

const DARK_PALETTE: Palette = {
  bg: "#1e1f22",
  bgAlt: "#26282c",
  bgInput: "#2c2e33",
  fg: "#d4d4d8",
  fgDim: "#8b8d94",
  accent: "#4f9cf9",
  accentFg: "#ffffff",
  border: "#383a3f",
  divider: "#2e3035",
  hover: "#3a3d43",
  selection: "#3b4a5a",
  danger: "#e5534b",
  success: "#3fb950",
  warning: "#d29922",
  info: "#58a6ff",
};

const LIGHT_PALETTE: Palette = {
  bg: "#f5f5f6",
  bgAlt: "#ebebee",
  bgInput: "#ffffff",
  fg: "#24292f",
  fgDim: "#6e7781",
  accent: "#0969da",
  accentFg: "#ffffff",
  border: "#d0d7de",
  divider: "#e4e7eb",
  hover: "#e4e7eb",
  selection: "#c8e1ff",
  danger: "#cf222e",
  success: "#1a7f37",
  warning: "#9a6700",
  info: "#0969da",
};

export const BUILTIN_THEMES: ThemeDef[] = [
  {
    name: "One Dark",
    type: "dark",
    palette: {
      ...DARK_PALETTE,
      bg: "#282c34",
      bgAlt: "#21252b",
      bgInput: "#2c313a",
      fg: "#abb2bf",
      fgDim: "#7f848e",
      accent: "#61afef",
      border: "#3e4451",
      hover: "#3a4048",
      selection: "#3e4451",
    },
    terminal: {
      black: "#282c34", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
      blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#abb2bf",
      brightBlack: "#5c6370", brightRed: "#e06c75", brightGreen: "#98c379", brightYellow: "#e5c07b",
      brightBlue: "#61afef", brightMagenta: "#c678dd", brightCyan: "#56b6c2", brightWhite: "#ffffff",
    },
  },
  {
    name: "Dracula",
    type: "dark",
    palette: {
      ...DARK_PALETTE,
      bg: "#282a36", bgAlt: "#21222c", bgInput: "#343746",
      fg: "#f8f8f2", fgDim: "#9096ad", accent: "#bd93f9",
      border: "#44475a", hover: "#3f4458", selection: "#44475a",
    },
    terminal: {
      black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
      blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
      brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94", brightYellow: "#ffffa5",
      brightBlue: "#d6acff", brightMagenta: "#ff92df", brightCyan: "#a4ffff", brightWhite: "#ffffff",
    },
  },
  {
    name: "Nord",
    type: "dark",
    palette: {
      ...DARK_PALETTE,
      bg: "#2e3440", bgAlt: "#272c36", bgInput: "#3b4252",
      fg: "#d8dee9", fgDim: "#7b88a1", accent: "#88c0d0",
      border: "#434c5e", hover: "#424c5e", selection: "#434c5e",
    },
    terminal: {
      black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b",
      blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
      brightBlack: "#4c566a", brightRed: "#bf616a", brightGreen: "#a3be8c", brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1", brightMagenta: "#b48ead", brightCyan: "#8fbcbb", brightWhite: "#eceff4",
    },
  },
  {
    name: "Solarized Light",
    type: "light",
    palette: {
      ...LIGHT_PALETTE,
      bg: "#fdf6e3", bgAlt: "#eee8d5", bgInput: "#eee8d5",
      fg: "#586e75", fgDim: "#839496", accent: "#268bd2",
      border: "#d5cfbd", divider: "#e6e0cf", hover: "#e9e3d1", selection: "#dfd9c6",
    },
    terminal: {
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
      brightBlack: "#002b36", brightRed: "#cb4b16", brightGreen: "#859900", brightYellow: "#b58900",
      brightBlue: "#268bd2", brightMagenta: "#d33682", brightCyan: "#2aa198", brightWhite: "#fdf6e3",
    },
  },
  {
    name: "默认暗色",
    type: "dark",
    palette: DARK_PALETTE,
    terminal: {
      black: "#2c2e33", red: "#e5534b", green: "#3fb950", yellow: "#d29922",
      blue: "#58a6ff", magenta: "#bc8cff", cyan: "#39c5cf", white: "#d4d4d8",
      brightBlack: "#6e7681", brightRed: "#ff7b72", brightGreen: "#7ee787", brightYellow: "#e3b341",
      brightBlue: "#79c0ff", brightMagenta: "#d2a8ff", brightCyan: "#56d4dd", brightWhite: "#ffffff",
    },
  },
  {
    name: "默认亮色",
    type: "light",
    palette: LIGHT_PALETTE,
    terminal: {
      black: "#24292f", red: "#cf222e", green: "#116329", yellow: "#4d2d00",
      blue: "#0969da", magenta: "#8250df", cyan: "#1b7c83", white: "#6e7781",
      brightBlack: "#57606a", brightRed: "#a40e26", brightGreen: "#1a7f37", brightYellow: "#633c01",
      brightBlue: "#218bff", brightMagenta: "#a475f9", brightCyan: "#3192aa", brightWhite: "#ffffff",
    },
  },
];

/** 组装后的完整主题（ui 由 palette 派生） */
export type ResolvedTheme = ReturnType<typeof getTheme>;

/** 用户主题注册表（由后端 themes 目录加载） */
let userThemes: ThemeDef[] = [];

/** 注册用户主题（从后端加载的 JSON，兼容旧格式：无 palette 时从 ui 反推）。 */
export function registerUserThemes(defs: ThemeDefJson[]): void {
  userThemes = defs.map(normalizeThemeDef);
}

export function getAllThemeDefs(): ThemeDef[] {
  return [...BUILTIN_THEMES, ...userThemes];
}

export function isUserTheme(name: string): boolean {
  return userThemes.some((t) => t.name === name);
}

/** 兼容旧格式：无 palette 时从 ui 变量反推核心色到 palette。 */
export function normalizeThemeDef(json: ThemeDefJson): ThemeDef {
  const base = json.type === "light" ? LIGHT_PALETTE : DARK_PALETTE;
  const palette: Palette = { ...base };
  if (json.palette) {
    Object.assign(palette, json.palette as Partial<Palette>);
  } else if (json.ui) {
    const m: Record<string, keyof Palette> = {
      "--color-bg": "bg",
      "--color-bg-alt": "bgAlt",
      "--color-bg-input": "bgInput",
      "--color-fg": "fg",
      "--color-fg-dim": "fgDim",
      "--color-accent": "accent",
      "--color-accent-fg": "accentFg",
      "--color-border": "border",
      "--color-divider": "divider",
      "--color-hover": "hover",
      "--color-selection": "selection",
      "--color-danger": "danger",
      "--color-success": "success",
      "--color-warning": "warning",
      "--color-info": "info",
      "--color-link": "link",
    };
    for (const [k, field] of Object.entries(m)) {
      const v = json.ui[k];
      if (v) (palette as unknown as Record<string, string>)[field] = v;
    }
  }
  return {
    name: json.name,
    type: json.type,
    palette,
    ui: json.ui ?? undefined,
    terminal: json.terminal ?? {},
  };
}

/** 组装完整主题：ui 由 palette 派生（含覆盖），terminal 补全基础色 */
export function getTheme(name: string): { name: string; type: "dark" | "light"; palette: Palette; ui: Record<string, string>; terminal: Record<string, string> } {
  const t = [...BUILTIN_THEMES, ...userThemes].find((x) => x.name === name) ?? BUILTIN_THEMES[0];
  return {
    name: t.name,
    type: t.type,
    palette: t.palette,
    ui: deriveUi(t.palette, t.ui),
    terminal: deriveTerminal(t.palette, t.terminal),
  };
}
