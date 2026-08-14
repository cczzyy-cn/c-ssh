import { create } from "zustand";

interface SettingsState {
  fontSize: number;
  setFontSize: (n: number) => void;
}

const STORAGE_KEY = "c-ssh:settings";

function loadFontSize(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p.fontSize === "number") return p.fontSize;
    }
  } catch {
    /* ignore */
  }
  return 14;
}

const initialFontSize = loadFontSize();

export const useSettings = create<SettingsState>((set, get) => ({
  fontSize: initialFontSize,
  setFontSize: (n) => {
    const clamped = Math.min(32, Math.max(8, Math.round(n)));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), fontSize: clamped }));
    set({ fontSize: clamped });
  },
}));
