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

export default function SftpPanel({ tab }: Props) {
  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeSftp = useTabs((s) => s.setSftpOpen);

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
    refresh(path);
  }, [path, refresh]);

  const parent = path === "/" ? null : path.replace(/\/[^/]*\/?$/, "") || "/";

  const handleOpen = (entry: SftpEntry) => {
    if (entry.isDir) setPath(path === "/" ? `/${entry.name}` : `${path}/${entry.name}`);
  };

  const handleUpload = async () => {
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
        const remote = path === "/" ? `/${name}` : `${path}/${name}`;
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
    const local = await dialogOpen({
      title: "保存到",
      defaultPath: entry.name,
    });
    if (!local || Array.isArray(local)) return;
    setBusy(true);
    try {
      const remote = path === "/" ? `/${entry.name}` : `${path}/${entry.name}`;
      await api.sftpDownload(tab.id, remote, local);
    } catch (e) {
      alert(`下载失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleMkdir = async () => {
    const name = prompt("新建目录名称");
    if (!name) return;
    const remote = path === "/" ? `/${name}` : `${path}/${name}`;
    try {
      await api.sftpMkdir(tab.id, remote);
      await refresh(path);
    } catch (e) {
      alert(`创建目录失败: ${e}`);
    }
  };

  const handleDelete = async (entry: SftpEntry) => {
    if (!confirm(`确定删除「${entry.name}」？`)) return;
    try {
      const remote = path === "/" ? `/${entry.name}` : `${path}/${entry.name}`;
      await api.sftpDelete(tab.id, remote, entry.isDir);
      await refresh(path);
    } catch (e) {
      alert(`删除失败: ${e}`);
    }
  };

  return (
    <div className="sftp-panel">
      <div className="sftp-header">
        <span className="sftp-title">SFTP</span>
        <button className="icon-btn" title="关闭" onClick={() => closeSftp(tab.id, false)}>✕</button>
      </div>
      <div className="sftp-path">
        <button className="icon-btn" title="上级目录" disabled={!parent} onClick={() => parent && setPath(parent)}>↑</button>
        <input value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === "Enter" && refresh(path)} />
      </div>
      <div className="sftp-tools">
        <button className="btn btn-sm" onClick={handleUpload} disabled={busy}>↑ 上传</button>
        <button className="btn btn-sm" onClick={handleMkdir}>＋ 目录</button>
        <button className="btn btn-sm" onClick={() => refresh(path)}>⟳</button>
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
