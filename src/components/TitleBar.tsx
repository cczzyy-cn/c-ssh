import { getCurrentWindow } from "@tauri-apps/api/window";

/** 自绘窗口标题栏：背景色跟随主题（CSS 变量），支持拖拽 / 双击最大化 / 窗口控制。 */
export default function TitleBar() {
  const win = getCurrentWindow();
  const toggleMax = () => win.toggleMaximize().catch(() => undefined);

  return (
    <div className="titlebar">
      <span className="titlebar-title" data-tauri-drag-region>
        c-ssh
      </span>
      {/* 拖拽区与按钮区分离，避免按钮点击触发拖拽 */}
      <div
        className="titlebar-spacer"
        data-tauri-drag-region
        onDoubleClick={toggleMax}
      />
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          title="最小化"
          onClick={() => win.minimize().catch(() => undefined)}
        >
          ─
        </button>
        <button className="titlebar-btn" title="最大化 / 还原" onClick={toggleMax}>
          ▢
        </button>
        <button
          className="titlebar-btn titlebar-close"
          title="关闭"
          onClick={() => win.close().catch(() => undefined)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
