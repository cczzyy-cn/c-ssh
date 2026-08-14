import { useTabs } from "../stores/tabs";

export default function TabBar() {
  const { tabs, activeId, setActive, closeTab } = useTabs();

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
