import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

export interface WindowSize {
  width: number;
  height: number;
}

export const DEFAULT_WINDOW_SIZE: WindowSize = { width: 1600, height: 800 };

interface SettingsState {
  fontSize: number;
  uiFontSize: number;
  windowSize: WindowSize;
  setFontSize: (n: number) => void;
  setUiFontSize: (n: number) => void;
  setWindowSize: (size: WindowSize) => Promise<void>;
}

const STORAGE_KEY = "c-ssh:settings";

interface PersistedSettings {
  fontSize?: number;
  uiFontSize?: number;
  windowSize?: WindowSize;
}

function loadPersisted(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

/** 调整窗口大小（非 Tauri 环境（纯浏览器 dev）静默忽略）。 */
export async function applyWindowSize(size: WindowSize): Promise<void> {
  try {
    await getCurrentWindow().setSize(new LogicalSize(size.width, size.height));
  } catch {
    /* ignore */
  }
}

/** 应用全局界面字号基准（影响全部 UI 字体与 emoji 图标大小）。 */
export function applyUiFontSize(n: number): void {
  document.documentElement.style.setProperty("--ui-fs-base", `${n}px`);
}

const persisted = loadPersisted();

export const useSettings = create<SettingsState>((set, get) => ({
  fontSize: persisted.fontSize ?? 14,
  uiFontSize: persisted.uiFontSize ?? 13,
  windowSize: persisted.windowSize ?? DEFAULT_WINDOW_SIZE,
  setFontSize: (n) => {
    const clamped = Math.min(32, Math.max(8, Math.round(n)));
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...get(), fontSize: clamped }),
    );
    set({ fontSize: clamped });
  },
  setUiFontSize: (n) => {
    const clamped = Math.min(20, Math.max(10, Math.round(n)));
    applyUiFontSize(clamped);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), uiFontSize: clamped }));
    set({ uiFontSize: clamped });
  },
  setWindowSize: async (size) => {
    const clamped = {
      width: Math.min(3840, Math.max(640, Math.round(size.width))),
      height: Math.min(2160, Math.max(400, Math.round(size.height))),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), windowSize: clamped }));
    set({ windowSize: clamped });
    await applyWindowSize(clamped);
  },
}));

// 启动时应用持久化的界面字号
applyUiFontSize(persisted.uiFontSize ?? 13);
