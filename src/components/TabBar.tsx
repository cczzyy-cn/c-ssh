import { open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";
import { api } from "../ipc";
import { useConnections } from "../stores/connections";
import { useUi } from "../stores/ui";
import { openLocalShell, useTabs } from "../stores/tabs";

export default function TabBar() {
  const { tabs, activeId, sftpOpen, setActive, closeTab, setSftpOpen } = useTabs();
  const load = useConnections((s) => s.load);
  const activeTab = tabs.find((t) => t.id === activeId);
  // 仅真实连接会话可开关文件面板（无连接/连接中/演示会话禁用）
  const canSftp = !!activeTab?.connId && !activeTab.pending && activeTab.status === "connected";
  const sftpVisible = canSftp && sftpOpen;

  const handleExport = async () => {
    try {
      const path = await dialogSave({
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
      const path = await dialogOpen({
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
    <div className="tabbar">
      <div className="tabbar-tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab ${t.id === activeId ? "active" : ""} ${t.status === "error" ? "error" : ""}`}
            onClick={() => setActive(t.id)}
          >
            <span className={`status-dot ${t.status}`} />
            <span className="tab-title">{t.title}</span>
            <button
              className="icon-btn tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="tabbar-right">
        <button
          className="icon-btn tabbar-action"
          title="新建连接"
          onClick={() => useUi.getState().openNewForm()}
        >
          ➕
        </button>
        <button className="icon-btn tabbar-action" title="导入连接配置" onClick={handleImport}>
          ⇩
        </button>
        <button className="icon-btn tabbar-action" title="导出连接配置" onClick={handleExport}>
          ⇧
        </button>
        <button
          className="icon-btn tabbar-term"
          title="打开本地命令行（软件内）"
          onClick={() => openLocalShell().catch(() => undefined)}
        >
          &gt;_
        </button>
        <button
          className={`icon-btn tabbar-file ${sftpVisible ? "on" : ""}`}
          disabled={!canSftp}
          title={canSftp ? (sftpVisible ? "收起文件栏" : "打开文件栏") : "无可用连接"}
          onClick={() => canSftp && setSftpOpen(!sftpVisible)}
        >
          📁
        </button>
      </div>
    </div>
  );
}
