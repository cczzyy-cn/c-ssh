import { useRef, useState } from "react";
import { openLocalShell, useTabs } from "../stores/tabs";

export default function TabBar() {
  const { tabs, activeId, sftpOpen, setActive, closeTab, setSftpOpen, swapTabs } = useTabs();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const tabElsRef = useRef<Record<string, HTMLDivElement>>({});
  const dragRef = useRef<{
    id: string;
    startX: number;
    dragging: boolean;
    lastHit: string | null; // 最后一次命中的目标标签（同步存储，避免渲染延迟）
  } | null>(null);
  const activeTab = tabs.find((t) => t.id === activeId);
  // 仅真实连接会话可开关文件面板（无连接/连接中/演示会话禁用）
  const canSftp = !!activeTab?.connId && !activeTab.pending && activeTab.status === "connected";
  const sftpVisible = canSftp && sftpOpen;

  /** 鼠标拖拽：拖动中标签内容不动，仅高亮目标标签，松手时互换位置 */
  const onTabMouseDown = (id: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // 关闭按钮不触发拖拽
    e.preventDefault();
    dragRef.current = { id, startX: e.clientX, dragging: false, lastHit: null };

    const onMove = (ev: MouseEvent) => {
      const st = dragRef.current;
      if (!st) return;
      if (!st.dragging) {
        if (Math.abs(ev.clientX - st.startX) < 5) return; // 位移阈值
        st.dragging = true;
        setDraggingId(st.id);
        document.body.style.cursor = "grabbing";
      }
      // 只更新目标高亮，不改变标签顺序
      let hit: string | null = null;
      for (const tab of useTabs.getState().tabs) {
        if (tab.id === st.id) continue;
        const el = tabElsRef.current[tab.id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right) {
          hit = tab.id;
          break;
        }
      }
      st.lastHit = hit; // 同步记录目标
      setDropTargetId(hit);
    };
    const onUp = () => {
      const st = dragRef.current;
      // 直接读 dragRef 同步目标，避免 setState 渲染延迟导致互换未执行
      if (st?.dragging && st.lastHit) {
        swapTabs(st.id, st.lastHit); // 释放鼠标后互换位置
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
