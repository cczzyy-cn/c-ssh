import { create } from "zustand";
import { Terminal } from "@xterm/xterm";
import { api, type SftpEntry } from "../ipc";
import type { ConnectionConfig } from "../types";

export type TabStatus = "connecting" | "connected" | "closed" | "error";

export interface Tab {
  /** 会话 id（sessionId）；pending 连接时为临时占位 id */
  id: string;
  connId?: string;
  title: string;
  status: TabStatus;
  error?: string;
  /** 连接级主题覆盖（xterm theme） */
  theme?: string;
  /** 断线自动重连 */
  autoReconnect?: boolean;
  /** 正在建立连接（尚无真实 sessionId） */
  pending?: boolean;
}

/** 单个连接的文件栏状态缓存（切换标签不重新拉取） */
export interface SftpState {
  path: string;
  entries: SftpEntry[];
  initialized: boolean;
}

/** 每个 session 未消费的终端数据缓冲上限（条数），防止内存膨胀 */
const PENDING_DATA_MAX = 64;

interface TabsState {
  tabs: Tab[];
  activeId: string | null;
  /** sessionId -> xterm Terminal 实例（供全局 term:data 分发） */
  terminals: Record<string, Terminal>;
  /** sessionId -> 终端未注册前到达的数据缓冲（注册后回放） */
  pendingData: Record<string, Uint8Array[]>;
  /** 右侧文件栏全局开关（软件全局，不随标签） */
  sftpOpen: boolean;
  /** sessionId -> 文件栏状态缓存 */
  sftpStates: Record<string, SftpState>;
  addTab: (tab: Tab) => void;
  closeTab: (id: string) => Promise<void>;
  setActive: (id: string) => void;
  setStatus: (id: string, status: TabStatus, error?: string) => void;
  /** 拖拽调整标签顺序 */
  moveTab: (fromId: string, toId: string) => void;
  /** 按目标下标移动标签（拖拽插入，0..tabs.length） */
  moveTabToIndex: (fromId: string, toIndex: number) => void;
  /** 两个标签互换位置 */
  swapTabs: (aId: string, bId: string) => void;
  registerTerminal: (id: string, term: Terminal) => void;
  unregisterTerminal: (id: string) => void;
  bufferData: (id: string, bytes: Uint8Array) => void;
  setSftpOpen: (open: boolean) => void;
  setSftpState: (id: string, state: SftpState) => void;
}

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  terminals: {},
  pendingData: {},
  sftpOpen: false,
  sftpStates: {},
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
      const pendingData = { ...s.pendingData };
      delete pendingData[id];
      const sftpStates = { ...s.sftpStates };
      delete sftpStates[id];
      return {
        tabs,
        terminals,
        pendingData,
        sftpStates,
        activeId: s.activeId === id ? (tabs.length ? tabs[tabs.length - 1].id : null) : s.activeId,
      };
    });
  },
  setActive: (id) => set({ activeId: id }),
  setStatus: (id, status, error) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, status, error } : t)),
    })),
  moveTab: (fromId, toId) =>
    set((s) => {
      if (fromId === toId) return s;
      const from = s.tabs.findIndex((t) => t.id === fromId);
      const to = s.tabs.findIndex((t) => t.id === toId);
      if (from < 0 || to < 0) return s;
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      return { tabs };
    }),
  moveTabToIndex: (fromId, toIndex) =>
    set((s) => {
      const from = s.tabs.findIndex((t) => t.id === fromId);
      if (from < 0) return s;
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(from, 1);
      let target = toIndex;
      if (from < toIndex) target -= 1; // 移除自身后下标前移
      target = Math.max(0, Math.min(tabs.length, target));
      tabs.splice(target, 0, moved);
      return { tabs };
    }),
  swapTabs: (aId, bId) =>
    set((s) => {
      const a = s.tabs.findIndex((t) => t.id === aId);
      const b = s.tabs.findIndex((t) => t.id === bId);
      if (a < 0 || b < 0 || a === b) return s;
      const tabs = [...s.tabs];
      [tabs[a], tabs[b]] = [tabs[b], tabs[a]];
      return { tabs };
    }),
  registerTerminal: (id, term) =>
    set((s) => {
      // 注册时回放缓冲数据（连接建立后 shell banner 早于终端挂载到达的情况）
      const pending = s.pendingData[id];
      const pendingData = { ...s.pendingData };
      delete pendingData[id];
      if (pending) {
        for (const chunk of pending) term.write(chunk);
      }
      return { terminals: { ...s.terminals, [id]: term }, pendingData };
    }),
  unregisterTerminal: (id) =>
    set((s) => {
      const terminals = { ...s.terminals };
      delete terminals[id];
      return { terminals };
    }),
  bufferData: (id, bytes) =>
    set((s) => {
      const list = s.pendingData[id] ?? [];
      if (list.length >= PENDING_DATA_MAX) list.shift();
      return { pendingData: { ...s.pendingData, [id]: [...list, bytes] } };
    }),
  setSftpOpen: (open) => set({ sftpOpen: open }),
  setSftpState: (id, state) =>
    set((s) => ({ sftpStates: { ...s.sftpStates, [id]: state } })),
}));

/** 打开连接：先建 pending 占位 tab（立即反馈"正在连接"），成功后替换为真实会话。 */
export async function openConnection(conn: ConnectionConfig): Promise<void> {
  const { addTab } = useTabs.getState();
  const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  addTab({
    id: pendingId,
    connId: conn.id,
    title: conn.name,
    status: "connecting",
    pending: true,
  });
  let sid: string;
  try {
    sid = await api.openSession(conn.id);
  } catch (e) {
    await useTabs.getState().closeTab(pendingId);
    alert(`连接失败: ${e}`);
    return;
  }
  useTabs.setState((s) => {
    const cur = s.tabs.find((t) => t.id === pendingId);
    if (!cur) return s;
    return {
      tabs: s.tabs.map((t) =>
        t.id === pendingId
          ? {
              ...t,
              id: sid,
              status: "connected" as TabStatus,
              pending: false,
              theme: conn.theme,
              autoReconnect: conn.options.autoReconnect,
            }
          : t,
      ),
      activeId: s.activeId === pendingId ? sid : s.activeId,
      // 连接成功后默认显示右侧文件栏（全局开关）
      sftpOpen: true,
    };
  });
}

export async function openEcho(): Promise<void> {
  const { addTab, setStatus } = useTabs.getState();
  const sid = await api.openEchoSession();
  addTab({ id: sid, title: "演示终端 (echo)", status: "connected" });
  setStatus(sid, "connected");
}

/** 打开软件内本地命令行（portable-pty 会话，无 connId 故不支持 SFTP）。 */
export async function openLocalShell(): Promise<void> {
  const { addTab } = useTabs.getState();
  const pendingId = `local-${Date.now()}`;
  addTab({
    id: pendingId,
    title: "本地命令行",
    status: "connecting",
    pending: true,
  });
  let sid: string;
  try {
    sid = await api.openLocalShell();
  } catch (e) {
    await useTabs.getState().closeTab(pendingId);
    alert(`打开本地命令行失败: ${e}`);
    return;
  }
  useTabs.setState((s) => {
    const cur = s.tabs.find((t) => t.id === pendingId);
    if (!cur) return s;
    return {
      tabs: s.tabs.map((t) =>
        t.id === pendingId
          ? { ...t, id: sid, status: "connected" as TabStatus, pending: false }
          : t,
      ),
      activeId: s.activeId === pendingId ? sid : s.activeId,
    };
  });
}

/** 断线自动重连：延迟后重开会话并替换 tab.id；失败则递增间隔重试。 */
export function scheduleReconnect(sessionId: string, delayMs = 3000): void {
  setTimeout(async () => {
    const { tabs, setStatus } = useTabs.getState();
    const tab = tabs.find((t) => t.id === sessionId);
    if (!tab || !tab.connId) return;
    setStatus(sessionId, "connecting");
    try {
      const sid = await api.openSession(tab.connId);
      useTabs.setState((s) => {
        const cur = s.tabs.find((t) => t.id === sessionId);
        if (!cur) return s;
        // 旧会话的未消费缓冲与文件栏状态迁移到新会话
        const pendingData = { ...s.pendingData };
        if (pendingData[sessionId]) {
          pendingData[sid] = pendingData[sessionId];
        }
        delete pendingData[sessionId];
        const sftpStates = { ...s.sftpStates };
        if (sftpStates[sessionId]) {
          sftpStates[sid] = sftpStates[sessionId];
        }
        delete sftpStates[sessionId];
        return {
          tabs: s.tabs.map((t) =>
            t.id === sessionId ? { ...t, id: sid, status: "connected" as TabStatus, error: undefined } : t,
          ),
          activeId: s.activeId === sessionId ? sid : s.activeId,
          pendingData,
          sftpStates,
        };
      });
    } catch (e) {
      setStatus(sessionId, "error", `重连失败: ${e}`);
      scheduleReconnect(sessionId, 5000);
    }
  }, delayMs);
}

