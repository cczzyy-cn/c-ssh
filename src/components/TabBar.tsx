import { useTabs } from "../stores/tabs";

export default function TabBar() {
  const { tabs, activeId, sftpOpen, setActive, closeTab, setSftpOpen } = useTabs();
  const activeTab = tabs.find((t) => t.id === activeId);
  // 仅真实连接会话可开关文件面板（无连接/连接中/演示会话禁用）
  const canSftp = !!activeTab?.connId && !activeTab.pending && activeTab.status === "connected";
  const sftpVisible = canSftp && !!sftpOpen[activeId ?? ""];

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
          className="btn btn-sm"
          disabled={!canSftp}
          title={canSftp ? "显示/收起右侧文件栏" : "无可用连接"}
          onClick={() => canSftp && activeId && setSftpOpen(activeId, !sftpVisible)}
        >
          {sftpVisible ? "隐藏文件 ▸" : "📁 文件"}
        </button>
      </div>
    </div>
  );
}
