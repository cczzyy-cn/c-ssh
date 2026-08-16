import { useRef } from "react";
import { openLocalShell, useTabs } from "../stores/tabs";

export default function TabBar() {
  const { tabs, activeId, sftpOpen, setActive, closeTab, setSftpOpen, moveTab } = useTabs();
  const dragIdRef = useRef<string | null>(null);
  const activeTab = tabs.find((t) => t.id === activeId);
  // 仅真实连接会话可开关文件面板（无连接/连接中/演示会话禁用）
  const canSftp = !!activeTab?.connId && !activeTab.pending && activeTab.status === "connected";
  const sftpVisible = canSftp && sftpOpen;

  return (
    <div className="tabbar">
      <div
        className="tabbar-tabs"
        onDragOver={(e) => {
          // 允许在标签区空白处放置（拖到末尾），避免出现禁止图标
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const fromId = e.dataTransfer.getData("text/plain") || dragIdRef.current;
          dragIdRef.current = null;
          if (fromId && tabs.length) moveTab(fromId, tabs[tabs.length - 1].id);
        }}
      >
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab ${t.id === activeId ? "active" : ""} ${t.status === "error" ? "error" : ""}`}
            onClick={() => setActive(t.id)}
            draggable
            onDragStart={(e) => {
              dragIdRef.current = t.id;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", t.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const fromId = e.dataTransfer.getData("text/plain") || dragIdRef.current;
              dragIdRef.current = null;
              if (fromId && fromId !== t.id) moveTab(fromId, t.id);
            }}
            onDragEnd={() => {
              dragIdRef.current = null;
            }}
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
