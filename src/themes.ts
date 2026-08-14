export interface ThemeDef {
  name: string;
  type: "dark" | "light";
  /** UI 层 CSS 变量 */
  ui: Record<string, string>;
  /** xterm.js theme 配置 */
  terminal: Record<string, string>;
}

const DARK_UI = {
  "--color-bg": "#1e1f22",
  "--color-bg-alt": "#26282c",
  "--color-bg-input": "#2c2e33",
  "--color-fg": "#d4d4d8",
  "--color-fg-dim": "#8b8d94",
  "--color-accent": "#4f9cf9",
  "--color-accent-fg": "#ffffff",
  "--color-border": "#383a3f",
  "--color-hover": "#2c2e33",
  "--color-selection": "#3b4a5a",
  "--color-danger": "#e5534b",
};

const LIGHT_UI = {
  "--color-bg": "#f5f5f6",
  "--color-bg-alt": "#ebebee",
  "--color-bg-input": "#ffffff",
  "--color-fg": "#24292f",
  "--color-fg-dim": "#6e7781",
  "--color-accent": "#0969da",
  "--color-accent-fg": "#ffffff",
  "--color-border": "#d0d7de",
  "--color-hover": "#e4e7eb",
  "--color-selection": "#c8e1ff",
  "--color-danger": "#cf222e",
};

export const BUILTIN_THEMES: ThemeDef[] = [
  {
    name: "One Dark",
    type: "dark",
    ui: { ...DARK_UI, "--color-bg": "#282c34", "--color-bg-alt": "#21252b", "--color-bg-input": "#2c313a", "--color-fg": "#abb2bf", "--color-fg-dim": "#7f848e", "--color-accent": "#61afef", "--color-border": "#3e4451", "--color-hover": "#2c313a", "--color-selection": "#3e4451" },
    terminal: {
      background: "#282c34",
      foreground: "#abb2bf",
      cursor: "#528bff",
      cursorAccent: "#282c34",
      selectionBackground: "#3e4451",
      black: "#282c34", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
      blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#abb2bf",
      brightBlack: "#5c6370", brightRed: "#e06c75", brightGreen: "#98c379", brightYellow: "#e5c07b",
      brightBlue: "#61afef", brightMagenta: "#c678dd", brightCyan: "#56b6c2", brightWhite: "#ffffff",
    },
  },
  {
    name: "Dracula",
    type: "dark",
    ui: { ...DARK_UI, "--color-bg": "#282a36", "--color-bg-alt": "#21222c", "--color-bg-input": "#343746", "--color-fg": "#f8f8f2", "--color-fg-dim": "#9096ad", "--color-accent": "#bd93f9", "--color-border": "#44475a", "--color-hover": "#343746", "--color-selection": "#44475a" },
    terminal: {
      background: "#282a36", foreground: "#f8f8f2", cursor: "#f8f8f2", cursorAccent: "#282a36", selectionBackground: "#44475a",
      black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c",
      blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2",
      brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94", brightYellow: "#ffffa5",
      brightBlue: "#d6acff", brightMagenta: "#ff92df", brightCyan: "#a4ffff", brightWhite: "#ffffff",
    },
  },
  {
    name: "Nord",
    type: "dark",
    ui: { ...DARK_UI, "--color-bg": "#2e3440", "--color-bg-alt": "#272c36", "--color-bg-input": "#3b4252", "--color-fg": "#d8dee9", "--color-fg-dim": "#7b88a1", "--color-accent": "#88c0d0", "--color-border": "#434c5e", "--color-hover": "#3b4252", "--color-selection": "#434c5e" },
    terminal: {
      background: "#2e3440", foreground: "#d8dee9", cursor: "#d8dee9", cursorAccent: "#2e3440", selectionBackground: "#434c5e",
      black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b",
      blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0",
      brightBlack: "#4c566a", brightRed: "#bf616a", brightGreen: "#a3be8c", brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1", brightMagenta: "#b48ead", brightCyan: "#8fbcbb", brightWhite: "#eceff4",
    },
  },
  {
    name: "Solarized Dark",
    type: "dark",
    ui: { ...DARK_UI, "--color-bg": "#002b36", "--color-bg-alt": "#073642", "--color-bg-input": "#073642", "--color-fg": "#839496", "--color-fg-dim": "#586e75", "--color-accent": "#268bd2", "--color-border": "#073642", "--color-hover": "#073642", "--color-selection": "#073642" },
    terminal: {
      background: "#002b36", foreground: "#839496", cursor: "#839496", cursorAccent: "#002b36", selectionBackground: "#073642",
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
      brightBlack: "#586e75", brightRed: "#cb4b16", brightGreen: "#859900", brightYellow: "#b58900",
      brightBlue: "#268bd2", brightMagenta: "#d33682", brightCyan: "#2aa198", brightWhite: "#fdf6e3",
    },
  },
  {
    name: "Solarized Light",
    type: "light",
    ui: { ...LIGHT_UI, "--color-bg": "#fdf6e3", "--color-bg-alt": "#eee8d5", "--color-bg-input": "#eee8d5", "--color-fg": "#586e75", "--color-fg-dim": "#839496", "--color-accent": "#268bd2", "--color-border": "#eee8d5", "--color-hover": "#eee8d5", "--color-selection": "#eee8d5" },
    terminal: {
      background: "#fdf6e3", foreground: "#586e75", cursor: "#586e75", cursorAccent: "#fdf6e3", selectionBackground: "#eee8d5",
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900",
      blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5",
      brightBlack: "#002b36", brightRed: "#cb4b16", brightGreen: "#859900", brightYellow: "#b58900",
      brightBlue: "#268bd2", brightMagenta: "#d33682", brightCyan: "#2aa198", brightWhite: "#fdf6e3",
    },
  },
  {
    name: "Gruvbox Dark",
    type: "dark",
    ui: { ...DARK_UI, "--color-bg": "#282828", "--color-bg-alt": "#1d2021", "--color-bg-input": "#3c3836", "--color-fg": "#ebdbb2", "--color-fg-dim": "#928374", "--color-accent": "#fabd2f", "--color-border": "#3c3836", "--color-hover": "#3c3836", "--color-selection": "#3c3836" },
    terminal: {
      background: "#282828", foreground: "#ebdbb2", cursor: "#ebdbb2", cursorAccent: "#282828", selectionBackground: "#3c3836",
      black: "#282828", red: "#cc241d", green: "#98971a", yellow: "#d79921",
      blue: "#458588", magenta: "#b16286", cyan: "#689d6a", white: "#a89984",
      brightBlack: "#928374", brightRed: "#fb4934", brightGreen: "#b8bb26", brightYellow: "#fabd2f",
      brightBlue: "#83a598", brightMagenta: "#d3869b", brightCyan: "#8ec07c", brightWhite: "#ebdbb2",
    },
  },
  {
    name: "默认暗色",
    type: "dark",
    ui: DARK_UI,
    terminal: {
      background: "#1e1f22", foreground: "#d4d4d8", cursor: "#d4d4d8", cursorAccent: "#1e1f22", selectionBackground: "#3b4a5a",
      black: "#2c2e33", red: "#e5534b", green: "#3fb950", yellow: "#d29922",
      blue: "#58a6ff", magenta: "#bc8cff", cyan: "#39c5cf", white: "#d4d4d8",
      brightBlack: "#6e7681", brightRed: "#ff7b72", brightGreen: "#7ee787", brightYellow: "#e3b341",
      brightBlue: "#79c0ff", brightMagenta: "#d2a8ff", brightCyan: "#56d4dd", brightWhite: "#ffffff",
    },
  },
  {
    name: "默认亮色",
    type: "light",
    ui: LIGHT_UI,
    terminal: {
      background: "#f5f5f6", foreground: "#24292f", cursor: "#24292f", cursorAccent: "#f5f5f6", selectionBackground: "#c8e1ff",
      black: "#24292f", red: "#cf222e", green: "#116329", yellow: "#4d2d00",
      blue: "#0969da", magenta: "#8250df", cyan: "#1b7c83", white: "#6e7781",
      brightBlack: "#57606a", brightRed: "#a40e26", brightGreen: "#1a7f37", brightYellow: "#633c01",
      brightBlue: "#218bff", brightMagenta: "#a475f9", brightCyan: "#3192aa", brightWhite: "#ffffff",
    },
  },
];

export function getTheme(name: string): ThemeDef {
  return BUILTIN_THEMES.find((t) => t.name === name) ?? BUILTIN_THEMES[0];
}
