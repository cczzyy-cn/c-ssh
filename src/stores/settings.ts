import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

export interface WindowSize {
  width: number;
  height: number;
}

export const DEFAULT_WINDOW_SIZE: WindowSize = { width: 1100, height: 700 };

interface SettingsState {
  fontSize: number;
  windowSize: WindowSize;
  setFontSize: (n: number) => void;
  setWindowSize: (size: WindowSize) => Promise<void>;
}

const STORAGE_KEY = "c-ssh:settings";

interface PersistedSettings {
  fontSize?: number;
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

const persisted = loadPersisted();

export const useSettings = create<SettingsState>((set, get) => ({
  fontSize: persisted.fontSize ?? 14,
  windowSize: persisted.windowSize ?? DEFAULT_WINDOW_SIZE,
  setFontSize: (n) => {
    const clamped = Math.min(32, Math.max(8, Math.round(n)));
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...get(), fontSize: clamped }),
    );
    set({ fontSize: clamped });
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
