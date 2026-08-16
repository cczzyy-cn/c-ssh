import { useRef, useState } from "react";
import { openLocalShell, useTabs } from "../stores/tabs";

interface DragInfo {
  id: string;
  dx: number;
  dy: number;
  width: number;
  dropIndex: number;
}

export default function TabBar() {
  const { tabs, activeId, sftpOpen, setActive, closeTab, setSftpOpen, moveTabToIndex } = useTabs();
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const tabElsRef = useRef<Record<string, HTMLDivElement>>({});
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    rectLeft: number;
    rectTop: number;
    width: number;
    dragging: boolean;
  } | null>(null);
  const activeTab = tabs.find((t) => t.id === activeId);
  // 仅真实连接会话可开关文件面板（无连接/连接中/演示会话禁用）
  const canSftp = !!activeTab?.connId && !activeTab.pending && activeTab.status === "connected";
  const sftpVisible = canSftp && sftpOpen;

  /** 计算拖拽目标位置（鼠标落在标签 rect 内即命中） */
  const calcDropIndex = (clientX: number): number => {
    const list = useTabs.getState().tabs;
    for (let i = 0; i < list.length; i++) {
      const el = tabElsRef.current[list[i].id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return i;
    }
    return list.length;
  };

  /** 鼠标拖拽：原始标签不动（不闪烁），浮动幽灵标签跟随并实时显示目标序号，松手一次移动 */
  const onTabMouseDown = (id: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // 关闭按钮不触发拖拽
    e.preventDefault();
    const el = tabElsRef.current[id];
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      width: rect.width,
      dragging: false,
    };

    const onMove = (ev: MouseEvent) => {
      const st = dragRef.current;
      if (!st) return;
      if (!st.dragging) {
        if (Math.abs(ev.clientX - st.startX) < 5 && Math.abs(ev.clientY - st.startY) < 5) return;
        st.dragging = true;
        document.body.style.cursor = "grabbing";
      }
      setDragInfo({
        id: st.id,
        dx: ev.clientX - st.rectLeft,
        dy: ev.clientY - st.rectTop,
        width: st.width,
        dropIndex: calcDropIndex(ev.clientX),
      });
    };
    const onUp = () => {
      const st = dragRef.current;
      if (st?.dragging && dragInfoRef.current) {
        moveTabToIndex(st.id, dragInfoRef.current.dropIndex);
      }
      dragRef.current = null;
      setDragInfo(null);
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const dragInfoRef = useRef<DragInfo | null>(null);
  dragInfoRef.current = dragInfo;

  // 幽灵标签内容
  const ghostTab = dragInfo ? tabs.find((t) => t.id === dragInfo.id) : null;

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
              dragInfo && t.id === dragInfo.id ? "dragging" : ""
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
        {ghostTab && dragInfo && (
          <div
            className="tab tab-ghost"
            style={{
              transform: `translate(${dragInfo.dx}px, ${dragInfo.dy}px)`,
              width: dragInfo.width,
            }}
          >
            <span className="tab-index">{dragInfo.dropIndex + 1}</span>
            <span className={`status-dot ${ghostTab.status}`} />
            <span className="tab-title">{ghostTab.title}</span>
          </div>
        )}
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
