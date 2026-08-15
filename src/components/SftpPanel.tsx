import { useCallback, useEffect, useState } from "react";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { api, type SftpEntry } from "../ipc";
import { useTabs, type Tab } from "../stores/tabs";

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
  // null = 正在解析主目录；解析成功前不发起列表请求
  const [path, setPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeSftp = useTabs((s) => s.setSftpOpen);

  // 打开面板：先解析用户主目录（realpath "."），失败回退到 "/"
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const home = await api.sftpRealpath(tab.id, ".");
        if (!cancelled) setPath(normalizeSftpPath(home));
      } catch {
        if (!cancelled) setPath("/");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab.id]);

  const refresh = useCallback(
    async (p: string) => {
      setLoading(true);
      try {
        const list = await api.sftpList(tab.id, p);
        setEntries(list);
      } catch (e) {
        alert(`读取目录失败: ${e}`);
      } finally {
        setLoading(false);
      }
    },
    [tab.id],
  );

  useEffect(() => {
    if (path) refresh(path);
  }, [path, refresh]);

  const parent = !path || path === "/" ? null : path.replace(/\/[^/]*\/?$/, "") || "/";

  const handleOpen = (entry: SftpEntry) => {
    if (!path) return;
    if (entry.isDir) setPath(joinPath(path, entry.name));
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
        const remote = joinPath(path, name);
        await api.sftpUpload(tab.id, f, remote);
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
    const local = await dialogOpen({
      title: "保存到",
      defaultPath: entry.name,
    });
    if (!local || Array.isArray(local)) return;
    setBusy(true);
    try {
      const remote = joinPath(path, entry.name);
      await api.sftpDownload(tab.id, remote, local);
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
    const remote = joinPath(path, name);
    try {
      await api.sftpMkdir(tab.id, remote);
      await refresh(path);
    } catch (e) {
      alert(`创建目录失败: ${e}`);
    }
  };

  const handleDelete = async (entry: SftpEntry) => {
    if (!path) return;
    if (!confirm(`确定删除「${entry.name}」？`)) return;
    try {
      const remote = joinPath(path, entry.name);
      await api.sftpDelete(tab.id, remote, entry.isDir);
      await refresh(path);
    } catch (e) {
      alert(`删除失败: ${e}`);
    }
  };

  return (
    <div className="sftp-panel">
      <div className="sftp-header">
        <span className="sftp-title">SFTP 文件</span>
        <button className="btn btn-sm" onClick={() => closeSftp(tab.id, false)}>
          收起 ▸
        </button>
      </div>
      <div className="sftp-path">
        <button className="icon-btn" title="上级目录" disabled={!parent} onClick={() => parent && setPath(parent)}>↑</button>
        <input
          value={path ?? ""}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && path) {
              const n = normalizeSftpPath(path);
              setPath(n);
              refresh(n);
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
        {!loading && entries.length === 0 && <div className="sftp-hint">空目录</div>}
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
    </div>
  );
}
