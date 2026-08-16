import { useRef, useState } from "react";
import { openLocalShell, useTabs } from "../stores/tabs";

export default function TabBar() {
  const { tabs, activeId, sftpOpen, setActive, closeTab, setSftpOpen, moveTabToIndex } = useTabs();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const tabElsRef = useRef<Record<string, HTMLDivElement>>({});
  const dragRef = useRef<{ id: string; startX: number; dragging: boolean } | null>(null);
  const activeTab = tabs.find((t) => t.id === activeId);
  // 仅真实连接会话可开关文件面板（无连接/连接中/演示会话禁用）
  const canSftp = !!activeTab?.connId && !activeTab.pending && activeTab.status === "connected";
  const sftpVisible = canSftp && sftpOpen;

  /** 计算拖拽插入位置：鼠标 x 相对各标签中点 */
  const calcDropIndex = (clientX: number): number => {
    const list = useTabs.getState().tabs;
    for (let i = 0; i < list.length; i++) {
      const el = tabElsRef.current[list[i].id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return list.length;
  };

  /** 鼠标拖拽排序标签（插入指示器方案：拖动过程不重排，松手一次移动，避免闪烁） */
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
      setDropIndex(calcDropIndex(ev.clientX));
    };
    const onUp = () => {
      const st = dragRef.current;
      if (st?.dragging && dropIndexRef.current !== null) {
        moveTabToIndex(st.id, dropIndexRef.current);
      }
      dragRef.current = null;
      setDraggingId(null);
      setDropIndex(null);
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 供 onUp 读取最新的 dropIndex
  const dropIndexRef = useRef<number | null>(null);
  dropIndexRef.current = dropIndex;

  // 指示线位置（相对 tabbar-tabs 左边缘）
  let indicatorLeft: number | null = null;
  if (dropIndex !== null && draggingId !== null) {
    const list = tabs;
    if (dropIndex >= list.length) {
      const el = tabElsRef.current[list[list.length - 1]?.id];
      if (el) indicatorLeft = el.getBoundingClientRect().right;
    } else {
      const el = tabElsRef.current[list[dropIndex]?.id];
      if (el) indicatorLeft = el.getBoundingClientRect().left;
    }
  }

  return (
    <div className="tabbar">
      <div className="tabbar-tabs">
        {tabs.map((t) => (
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
        {indicatorLeft !== null && (
          <div className="tab-drop-indicator" style={{ left: indicatorLeft }} />
        )}
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
