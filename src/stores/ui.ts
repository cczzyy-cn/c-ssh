import { create } from "zustand";
import type { ConnectionConfig } from "../types";

/** 全局 UI 状态：连接表单从侧边栏/标签栏两处打开 */
interface UiState {
  showForm: boolean;
  editingConn: ConnectionConfig | null;
  openNewForm: () => void;
  openEditForm: (conn: ConnectionConfig) => void;
  closeForm: () => void;
}

export const useUi = create<UiState>((set) => ({
  showForm: false,
  editingConn: null,
  openNewForm: () => set({ showForm: true, editingConn: null }),
  openEditForm: (conn) => set({ showForm: true, editingConn: conn }),
  closeForm: () => set({ showForm: false, editingConn: null }),
}));
