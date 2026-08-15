import { useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api } from "../ipc";
import { useConnections } from "../stores/connections";
import { openConnection, openEcho } from "../stores/tabs";
import type { ConnectionConfig } from "../types";
import ConnectionForm from "./ConnectionForm";
import SettingsPanel from "./SettingsPanel";

export default function Sidebar() {
  const { connections, remove, load } = useConnections();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ConnectionConfig | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // 侧边栏宽度（可拖拽调整，持久化）
  const [width, setWidth] = useState(() => {
    try {
      return Number(localStorage.getItem("c-ssh:sidebar-width")) || 260;
    } catch {
      return 260;
    }
  });
  const [dragging, setDragging] = useState(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(480, Math.max(180, ev.clientX));
      setWidth(w);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      try {
        localStorage.setItem("c-ssh:sidebar-width", String(widthRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const widthRef = useRef(width);
  widthRef.current = width;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = connections.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.host.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q),
    );
    const map = new Map<string, ConnectionConfig[]>();
    for (const c of filtered) {
      const key = c.group || "默认";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [connections, query]);

  const handleEdit = (conn: ConnectionConfig) => {
    setEditing(conn);
    setShowForm(true);
  };

  const handleDelete = async (conn: ConnectionConfig) => {
    if (confirm(`确定删除连接「${conn.name}」？`)) {
      await remove(conn.id);
    }
  };

  const handleTest = async (conn: ConnectionConfig) => {
    try {
      await api.testConnection(conn.id);
      alert(`连接「${conn.name}」测试成功`);
    } catch (e) {
      alert(`连接测试失败: ${e}`);
    }
  };

  const handleExport = async () => {
    try {
      const path = await save({
        title: "导出连接配置",
        defaultPath: "c-ssh-connections.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await api.exportConnections(path);
      alert("导出成功（凭据不随文件导出，需在新机器重新输入密码）");
    } catch (e) {
      alert(`导出失败: ${e}`);
    }
  };

  const handleImport = async () => {
    try {
      const path = await open({
        title: "导入连接配置",
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path || Array.isArray(path)) return;
      const count = await api.importConnections(path);
      await load();
      alert(`导入成功：${count} 条连接`);
    } catch (e) {
      alert(`导入失败: ${e}`);
    }
  };

  return (
    <aside className={`sidebar ${dragging ? "resizing" : ""}`} style={{ width }}>
      <div className="sidebar-header">
        <input
          className="search"
          placeholder="搜索连接…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="btn btn-primary btn-sm sidebar-new"
          title="新建连接"
          onClick={() => { setEditing(null); setShowForm(true); }}
        >
          + 新建
        </button>
      </div>

      <div className="conn-list">
        {groups.length === 0 && (
          <div className="empty-hint">
            {connections.length === 0 ? "还没有连接，点「+ 新建」添加" : "无匹配结果"}
          </div>
        )}
        {groups.map(([group, items]) => (
          <div key={group}>
            <div className="group-title">{group}</div>
            {items.map((c) => (
              <div
                key={c.id}
                className="conn-item"
                title={`${c.username}@${c.host}:${c.port}`}
                onDoubleClick={() => openConnection(c)}
              >
                <div className="conn-item-main">
                  <div className="conn-name">{c.name}</div>
                  <div className="conn-sub">
                    {c.username}@{c.host}
                  </div>
                </div>
                <div className="conn-actions">
                  <button className="icon-btn" title="测试连接" onClick={() => handleTest(c)}>
                    ⚡
                  </button>
                  <button className="icon-btn" title="编辑" onClick={() => handleEdit(c)}>
                    ✎
                  </button>
                  <button className="icon-btn" title="删除" onClick={() => handleDelete(c)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button className="btn btn-sm" onClick={() => openEcho().catch((e) => alert(e))}>
          ▶ 演示终端
        </button>
        <button className="btn btn-sm" onClick={() => setShowSettings(true)}>
          ⚙ 设置
        </button>
      </div>
      <div className="sidebar-io">
        <button className="btn btn-sm" onClick={handleImport}>⇩ 导入</button>
        <button className="btn btn-sm" onClick={handleExport}>⇧ 导出</button>
      </div>

      {showForm && (
        <ConnectionForm
          conn={editing ?? undefined}
          onClose={() => setShowForm(false)}
        />
      )}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {/* 拖拽调整侧边栏宽度 */}
      <div
        className="sidebar-resizer"
        onMouseDown={startResize}
        title="拖动调整宽度"
      />
    </aside>
  );
}
