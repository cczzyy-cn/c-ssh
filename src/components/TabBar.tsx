import { useRef, useState } from "react";
import { openLocalShell, useTabs } from "../stores/tabs";

export default function TabBar() {
  const { tabs, activeId, sftpOpen, setActive, closeTab, setSftpOpen, swapTabs } = useTabs();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const tabElsRef = useRef<Record<string, HTMLDivElement>>({});
  const dragRef = useRef<{ id: string; startX: number; dragging: boolean } | null>(null);
  const activeTab = tabs.find((t) => t.id === activeId);
  // 仅真实连接会话可开关文件面板（无连接/连接中/演示会话禁用）
  const canSftp = !!activeTab?.connId && !activeTab.pending && activeTab.status === "connected";
  const sftpVisible = canSftp && sftpOpen;

  /** 查询鼠标 x 所在的标签（排除自身），未命中返回 null */
  const findTarget = (clientX: number, selfId: string): string | null => {
    for (const tab of useTabs.getState().tabs) {
      if (tab.id === selfId) continue;
      const el = tabElsRef.current[tab.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return tab.id;
    }
    return null;
  };

  /** 鼠标拖拽：拖动中标签内容不动，仅高亮目标标签，松手时按松手位置互换 */
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
      setDropTargetId(findTarget(ev.clientX, st.id));
    };
    const onUp = (ev: MouseEvent) => {
      const st = dragRef.current;
      if (st?.dragging) {
        // 用松手位置重新计算目标（最后 onMove 的位置可能滞后于松手位置）
        const target = findTarget(ev.clientX, st.id);
        if (target) swapTabs(st.id, target);
      }
      dragRef.current = null;
      setDraggingId(null);
      setDropTargetId(null);
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
            } ${t.id === dropTargetId ? "drop-target" : ""}`}
            onClick={() => setActive(t.id)}
            onMouseDown={(e) => onTabMouseDown(t.id, e)}
          >
            <span className="tab-index">{t.order ?? i + 1}</span>
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
