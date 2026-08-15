import { useCallback, useEffect, useRef, useState } from "react";
import { open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";
import { api, type SftpEntry } from "../ipc";
import { useTabs, type SftpState, type Tab } from "../stores/tabs";

interface Props {
  tab: Tab;
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(secs: number): string {
  if (!secs) return "";
  const d = new Date(secs * 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 规范化 SFTP 路径：反斜杠→正斜杠、盘符前加 /、去重斜杠、补前导 /。 */
export function normalizeSftpPath(p: string): string {
  let s = p.trim().replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(s)) s = `/${s}`;
  s = s.replace(/\/{2,}/g, "/");
  return s.startsWith("/") ? s : `/${s}`;
}

/** 取纯文件名（防后端返回完整路径/混合斜杠）。 */
function baseName(name: string): string {
  return name.split(/[\\/]/).pop() ?? name;
}

/** 拼接当前路径与条目名（防反斜杠/重复斜杠）。 */
function joinPath(base: string, name: string): string {
  return normalizeSftpPath(
    base === "/" ? `/${baseName(name)}` : `${base}/${baseName(name)}`,
  );
}

export default function SftpPanel({ tab }: Props) {
  const state = useTabs((s) => s.sftpStates[tab.id]);
  const setSftpState = useTabs((s) => s.setSftpState);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  // 文件栏宽度（可拖拽调整，持久化）
  const [width, setWidth] = useState(() => {
    try {
      return Number(localStorage.getItem("c-ssh:sftp-width")) || 340;
    } catch {
      return 340;
    }
  });
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      // 面板在最右侧：宽度 = 视口宽 - 鼠标 x
      const w = Math.min(560, Math.max(200, window.innerWidth - ev.clientX));
      setWidth(w);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try {
        localStorage.setItem("c-ssh:sftp-width", String(widthRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const path: string | null = state?.path ?? null;
  const entries: SftpEntry[] = state?.entries ?? [];

  const saveState = useCallback(
    (patch: Partial<SftpState>) => {
      const prev = useTabs.getState().sftpStates[tab.id];
      setSftpState(tab.id, {
        ...(prev ?? { path: "/", entries: [], initialized: false }),
        ...patch,
      });
    },
    [tab.id, setSftpState],
  );

  // 刷新指定路径（用户操作触发；切换标签不触发）
  const refresh = useCallback(
    async (p: string) => {
      setLoading(true);
      try {
        const list = await api.sftpList(tab.id, p);
        saveState({ path: p, entries: list, initialized: true });
      } catch (e) {
        alert(`读取目录失败: ${e}`);
      } finally {
        setLoading(false);
      }
    },
    [tab.id, saveState],
  );

  // 首次显示或切到未初始化的连接：解析主目录并列出；已有缓存则直接显示（不重新拉取）
  useEffect(() => {
    if (state?.initialized) return;
    let cancelled = false;
    (async () => {
      try {
        const home = normalizeSftpPath(await api.sftpRealpath(tab.id, "."));
        const list = await api.sftpList(tab.id, home);
        if (!cancelled) {
          saveState({ path: home, entries: list, initialized: true });
        }
      } catch {
        if (!cancelled) {
          saveState({ path: "/", entries: [], initialized: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  const parent = !path || path === "/" ? null : path.replace(/\/[^/]*\/?$/, "") || "/";

  const handleOpen = (entry: SftpEntry) => {
    if (!path || !entry.isDir) return;
    refresh(joinPath(path, entry.name));
  };

  const handleUpload = async () => {
    if (!path) return;
    const local = await dialogOpen({
      title: "选择要上传的文件",
      multiple: true,
    });
    if (!local) return;
    const files = Array.isArray(local) ? local : [local];
    setBusy(true);
    try {
      for (const f of files) {
        const name = f.split(/[\\/]/).pop() ?? "file";
        await api.sftpUpload(tab.id, f, joinPath(path, name));
      }
      await refresh(path);
    } catch (e) {
      alert(`上传失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (entry: SftpEntry) => {
    if (!path) return;
    // 保存对话框：可浏览并选择任意目录 + 输入文件名
    const local = await dialogSave({
      title: "保存到",
      defaultPath: entry.name,
    });
    if (!local || Array.isArray(local)) return;
    // 确保保留远程文件的后缀名（对话框可能未预填文件名导致后缀丢失）
    const dot = entry.name.lastIndexOf(".");
    let target = local;
    if (dot > 0) {
      const ext = entry.name.slice(dot); // 含点，如 ".txt"
      const base = local.split(/[\\/]/).pop() ?? local;
      if (!base.endsWith(ext)) {
        target = `${local}${ext}`;
      }
    }
    setBusy(true);
    try {
      await api.sftpDownload(tab.id, joinPath(path, entry.name), target);
    } catch (e) {
      alert(`下载失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleMkdir = async () => {
    if (!path) return;
    const name = prompt("新建目录名称");
    if (!name) return;
    try {
      await api.sftpMkdir(tab.id, joinPath(path, name));
      await refresh(path);
    } catch (e) {
      alert(`创建目录失败: ${e}`);
    }
  };

  const handleDelete = async (entry: SftpEntry) => {
    if (!path) return;
    if (!confirm(`确定删除「${entry.name}」？`)) return;
    try {
      await api.sftpDelete(tab.id, joinPath(path, entry.name), entry.isDir);
      await refresh(path);
    } catch (e) {
      alert(`删除失败: ${e}`);
    }
  };

  return (
    <div className={`sftp-panel ${dragging ? "resizing" : ""}`} style={{ width }}>
      <div className="sftp-header">
        <span className="sftp-title">SFTP 文件</span>
      </div>
      <div className="sftp-path">
        <button className="icon-btn" title="上级目录" disabled={!parent} onClick={() => parent && refresh(parent)}>↑</button>
        <input
          value={path ?? ""}
          onChange={(e) => saveState({ path: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && path) {
              refresh(normalizeSftpPath(path));
            }
          }}
          placeholder={path ? undefined : "正在解析主目录…"}
        />
      </div>
      <div className="sftp-tools">
        <button className="btn btn-sm" onClick={handleUpload} disabled={busy}>上传</button>
        <button className="btn btn-sm" onClick={handleMkdir}>新建目录</button>
        <button className="btn btn-sm" onClick={() => path && refresh(path)}>刷新</button>
      </div>
      <div className="sftp-list">
        {loading && <div className="sftp-hint">加载中…</div>}
        {!loading && path && entries.length === 0 && <div className="sftp-hint">空目录</div>}
        {!loading &&
          entries.map((e) => (
            <div key={e.name} className="sftp-item" onDoubleClick={() => handleOpen(e)}>
              <span className={`sftp-icon ${e.isDir ? "dir" : "file"}`}>{e.isDir ? "📁" : "📄"}</span>
              <span className="sftp-name" title={e.name}>{e.name}</span>
              <span className="sftp-size">{e.isDir ? "" : formatSize(e.size)}</span>
              <span className="sftp-time">{formatTime(e.mtime)}</span>
              <span className="sftp-actions">
                {!e.isDir && (
                  <button className="icon-btn" title="下载" onClick={() => handleDownload(e)}>⇩</button>
                )}
                <button className="icon-btn" title="删除" onClick={() => handleDelete(e)}>✕</button>
              </span>
            </div>
          ))}
      </div>
      {/* 拖拽调整文件栏宽度 */}
      <div
        className="sftp-resizer"
        onMouseDown={startResize}
        title="拖动调整宽度"
      />
    </div>
  );
}
