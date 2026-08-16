import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getTheme, type ResolvedTheme } from "../themes";

export type ThemeMode = "dark" | "light" | "system";

interface ThemeState {
  mode: ThemeMode;
  themeName: string;
  /** 实际生效的主题（system 模式按系统解析） */
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  setThemeName: (name: string) => void;
}

const STORAGE_KEY = "c-ssh:theme";

function loadPersisted(): { mode: ThemeMode; themeName: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { mode: p.mode ?? "system", themeName: p.themeName ?? "One Dark" };
    }
  } catch {
    /* ignore */
  }
  return { mode: "system", themeName: "One Dark" };
}

const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

function resolve(mode: ThemeMode, themeName: string): ResolvedTheme {
  if (mode === "system") {
    return getTheme(systemDark ? "默认暗色" : "默认亮色");
  }
  if (mode === "dark") return getTheme(themeName) ?? getTheme("默认暗色");
  // light 模式：若主题本身是暗色，回退到默认亮色
  const t = getTheme(themeName);
  return t.type === "light" ? t : getTheme("默认亮色");
}

function applyTheme(theme: ResolvedTheme) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.ui)) {
    root.style.setProperty(k, v);
  }
}

/** 窗口标题栏明暗跟随主题（深色主题 → 深色标题栏，浅色 → 浅色）。 */
function applyWindowTheme(theme: ResolvedTheme) {
  getCurrentWindow()
    .setTheme(theme.type === "dark" ? "dark" : "light")
    .catch(() => undefined);
}

function applyBoth(theme: ResolvedTheme) {
  applyTheme(theme);
  applyWindowTheme(theme);
}

const persisted = loadPersisted();
const initialResolved = resolve(persisted.mode, persisted.themeName);
applyBoth(initialResolved);

export const useTheme = create<ThemeState>((set, get) => ({
  mode: persisted.mode,
  themeName: persisted.themeName,
  resolved: initialResolved,
  setMode: (mode) => {
    const next = resolve(mode, get().themeName);
    applyBoth(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, themeName: get().themeName }));
    set({ mode, resolved: next });
  },
  setThemeName: (name) => {
    const next = resolve(get().mode, name);
    applyBoth(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: get().mode, themeName: name }));
    set({ themeName: name, resolved: next });
  },
}));

// 跟随系统亮暗变化
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  const { mode, themeName } = useTheme.getState();
  if (mode === "system") {
    const next = getTheme(e.matches ? "默认暗色" : "默认亮色");
    applyBoth(next);
    useTheme.setState({ resolved: next });
  }
  void themeName;
});
