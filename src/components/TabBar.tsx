import { useRef, useState } from "react";
import { openLocalShell, useTabs } from "../stores/tabs";

export default function TabBar() {
  const { tabs, activeId, sftpOpen, setActive, closeTab, setSftpOpen, swapTabs } = useTabs();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const tabElsRef = useRef<Record<string, HTMLDivElement>>({});
  const dragRef = useRef<{ id: string; startX: number; dragging: boolean } | null>(null);
  const activeTab = tabs.find((t) => t.id === activeId);
  // 仅真实连接会话可开关文件面板（无连接/连接中/演示会话禁用）
  const canSftp = !!activeTab?.connId && !activeTab.pending && activeTab.status === "connected";
  const sftpVisible = canSftp && sftpOpen;

  /** 鼠标拖拽排序标签：实时互换（序号跟随），WebView2 兼容 */
  const onTabMouseDown = (id: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // 关闭按钮不触发拖拽
    e.preventDefault();
    dragRef.current = { id, startX: e.clientX, dragging: false };

    const onMove = (ev: MouseEvent) => {
      const st = dragRef.current;
      if (!st) return;
      if (!st.dragging) {
        if (Math.abs(ev.clientX - st.startX) < 5) return; // 位移阈值
        st.dragging = true;
        setDraggingId(st.id);
        document.body.style.cursor = "grabbing";
      }
      // 实时互换：鼠标落在某个标签内（含关闭按钮/内边距）即与之交换，序号实时跟随
      for (const tab of useTabs.getState().tabs) {
        const el = tabElsRef.current[tab.id];
        if (!el || tab.id === st.id) continue;
        const r = el.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right) {
          swapTabs(st.id, tab.id);
          st.id = tab.id; // 拖拽的标签跟随到新位置
          break;
        }
      }
    };
    const onUp = () => {
      dragRef.current = null;
      setDraggingId(null);
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="tabbar">
      <div className="tabbar-tabs">
        {tabs.map((t, i) => (
          <div
            key={t.id}
            ref={(el) => {
              if (el) tabElsRef.current[t.id] = el;
            }}
            className={`tab ${t.id === activeId ? "active" : ""} ${t.status === "error" ? "error" : ""} ${
              t.id === draggingId ? "dragging" : ""
            }`}
            onClick={() => setActive(t.id)}
            onMouseDown={(e) => onTabMouseDown(t.id, e)}
          >
            <span className="tab-index">{i + 1}</span>
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
          title="终端"
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
