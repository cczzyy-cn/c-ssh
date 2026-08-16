import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "../ipc";
import {
  getTheme,
  isUserTheme,
  registerUserThemes,
  type ResolvedTheme,
} from "../themes";

export type ThemeMode = "dark" | "light" | "system";

interface ThemeState {
  mode: ThemeMode;
  themeName: string;
  /** 实际生效的主题（system 模式按系统解析） */
  resolved: ResolvedTheme;
  /** 用户主题是否已加载 */
  userThemesLoaded: boolean;
  setMode: (mode: ThemeMode) => void;
  setThemeName: (name: string) => void;
  loadUserThemes: () => Promise<void>;
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
  if (mode === "dark") {
    // 深色模式：仅使用深色主题（所选主题为浅色时回退默认暗色）
    const t = getTheme(themeName);
    return t.type === "dark" ? t : getTheme("默认暗色");
  }
  // 浅色模式：仅使用浅色主题（所选主题为深色时回退默认亮色）
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
  userThemesLoaded: false,
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
  loadUserThemes: async () => {
    try {
      const defs = await api.listUserThemes();
      registerUserThemes(defs);
      // 若当前主题是用户主题，刷新实际生效主题
      const s = get();
      if (isUserTheme(s.themeName)) {
        const next = resolve(s.mode, s.themeName);
        applyBoth(next);
        set({ resolved: next });
      }
      set({ userThemesLoaded: true });
    } catch {
      set({ userThemesLoaded: true });
    }
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
