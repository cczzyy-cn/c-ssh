import { create } from "zustand";
import { Terminal } from "@xterm/xterm";
import { api } from "../ipc";
import type { ConnectionConfig } from "../types";

export type TabStatus = "connecting" | "connected" | "closed" | "error";

export interface Tab {
  /** 会话 id（sessionId） */
  id: string;
  connId?: string;
  title: string;
  status: TabStatus;
  error?: string;
  /** 连接级主题覆盖（xterm theme） */
  theme?: string;
}

interface TabsState {
  tabs: Tab[];
  activeId: string | null;
  /** sessionId -> xterm Terminal 实例（供全局 term:data 分发） */
  terminals: Record<string, Terminal>;
  addTab: (tab: Tab) => void;
  closeTab: (id: string) => Promise<void>;
  setActive: (id: string) => void;
  setStatus: (id: string, status: TabStatus, error?: string) => void;
  registerTerminal: (id: string, term: Terminal) => void;
  unregisterTerminal: (id: string) => void;
}

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  terminals: {},
  addTab: (tab) =>
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id })),
  closeTab: async (id) => {
    const { terminals } = get();
    const term = terminals[id];
    if (term) {
      term.dispose();
    }
    await api.closeSession(id).catch(() => undefined);
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const terminals = { ...s.terminals };
      delete terminals[id];
      return {
        tabs,
        terminals,
        activeId: s.activeId === id ? (tabs.length ? tabs[tabs.length - 1].id : null) : s.activeId,
      };
    });
  },
  setActive: (id) => set({ activeId: id }),
  setStatus: (id, status, error) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, status, error } : t)),
    })),
  registerTerminal: (id, term) =>
    set((s) => ({ terminals: { ...s.terminals, [id]: term } })),
  unregisterTerminal: (id) =>
    set((s) => {
      const terminals = { ...s.terminals };
      delete terminals[id];
      return { terminals };
    }),
}));

export async function openConnection(conn: ConnectionConfig): Promise<void> {
  const { addTab, setStatus } = useTabs.getState();
  let sid: string;
  try {
    sid = await api.openSession(conn.id);
  } catch (e) {
    alert(`连接失败: ${e}`);
    return;
  }
  addTab({ id: sid, connId: conn.id, title: conn.name, status: "connecting", theme: conn.theme });
  setStatus(sid, "connected");
}

export async function openEcho(): Promise<void> {
  const { addTab, setStatus } = useTabs.getState();
  const sid = await api.openEchoSession();
  addTab({ id: sid, title: "演示终端 (echo)", status: "connected" });
  setStatus(sid, "connected");
}
