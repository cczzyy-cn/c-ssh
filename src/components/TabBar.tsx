import { useTabs } from "../stores/tabs";

export default function TabBar() {
  const { tabs, activeId, sftpOpen, setActive, closeTab, setSftpOpen } = useTabs();

  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <div
          key={t.id}
          className={`tab ${t.id === activeId ? "active" : ""} ${t.status === "error" ? "error" : ""}`}
          onClick={() => setActive(t.id)}
        >
          <span className={`status-dot ${t.status}`} />
          <span className="tab-title">{t.title}</span>
          {t.connId && (
            <button
              className={`icon-btn tab-sftp ${sftpOpen[t.id] ? "on" : ""}`}
              title="SFTP 文件面板"
              onClick={(e) => {
                e.stopPropagation();
                setSftpOpen(t.id, !sftpOpen[t.id]);
              }}
            >
              ⇄
            </button>
          )}
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
  );
}
