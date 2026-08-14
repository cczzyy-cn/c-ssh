import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ConnectionConfig } from "./types";

export const api = {
  listConnections: () => invoke<ConnectionConfig[]>("list_connections"),
  saveConnection: (conn: ConnectionConfig) =>
    invoke<ConnectionConfig>("save_connection", { conn }),
  deleteConnection: (id: string) =>
    invoke<void>("delete_connection", { id }),
  exportConnections: (path: string) =>
    invoke<void>("export_connections", { path }),
  importConnections: (path: string) =>
    invoke<number>("import_connections", { path }),
  setSecret: (id: string, secret: string | null) =>
    invoke<void>("set_secret", { id, secret }),
  testConnection: (id: string) => invoke<void>("test_connection", { id }),
  openSession: (connId: string) => invoke<string>("open_session", { connId }),
  openEchoSession: () => invoke<string>("open_echo_session"),
  writeInput: (sessionId: string, data: string) =>
    invoke<void>("write_input", { sessionId, data }),
  resize: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("resize", { sessionId, cols, rows }),
  closeSession: (sessionId: string) =>
    invoke<void>("close_session", { sessionId }),
  sftpList: (sessionId: string, path: string) =>
    invoke<SftpEntry[]>("sftp_list", { sessionId, path }),
  sftpDownload: (sessionId: string, remotePath: string, localPath: string) =>
    invoke<void>("sftp_download", { sessionId, remotePath, localPath }),
  sftpUpload: (sessionId: string, localPath: string, remotePath: string) =>
    invoke<void>("sftp_upload", { sessionId, localPath, remotePath }),
  sftpMkdir: (sessionId: string, path: string) =>
    invoke<void>("sftp_mkdir", { sessionId, path }),
  sftpDelete: (sessionId: string, path: string, isDir: boolean) =>
    invoke<void>("sftp_delete", { sessionId, path, isDir }),
  logFrontendError: (source: string, message: string, stack?: string) =>
    invoke<void>("log_frontend_error", { source, message, stack }),
  getLogPath: () => invoke<string>("get_log_path"),
  readLog: (limit?: number) => invoke<string>("read_log", { limit }),
  clearLog: () => invoke<void>("clear_log"),
  openLogDir: () => invoke<void>("open_log_dir"),
};

export interface SftpEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtime: number;
}

export interface TermDataEvent {
  sessionId: string;
  data: string; // base64
}
export interface TermExitEvent {
  sessionId: string;
  code: number;
}
export interface TermErrorEvent {
  sessionId: string;
  message: string;
}

export async function onTermEvent<T>(
  event: string,
  cb: (payload: T) => void,
): Promise<UnlistenFn> {
  return listen<T>(event, (e) => cb(e.payload));
}

// ---- 字节 <-> base64 工具（xterm 输入输出是 UTF-8 字节流，不能直接用 btoa/atob） ----

export function strToB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
