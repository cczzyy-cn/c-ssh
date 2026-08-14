import { create } from "zustand";
import { api } from "../ipc";
import type { ConnectionConfig } from "../types";

interface ConnectionsState {
  connections: ConnectionConfig[];
  loading: boolean;
  load: () => Promise<void>;
  upsert: (conn: ConnectionConfig, secret: string | null) => Promise<ConnectionConfig>;
  remove: (id: string) => Promise<void>;
}

export const useConnections = create<ConnectionsState>((set, get) => ({
  connections: [],
  loading: false,
  load: async () => {
    set({ loading: true });
    try {
      const connections = await api.listConnections();
      set({ connections });
    } finally {
      set({ loading: false });
    }
  },
  upsert: async (conn, secret) => {
    const saved = await api.saveConnection(conn);
    // 密码/口令单独走 keyring，不进入连接配置
    if (secret !== null) {
      await api.setSecret(saved.id, secret || null);
    }
    await get().load();
    return saved;
  },
  remove: async (id) => {
    await api.deleteConnection(id);
    await get().load();
  },
}));
