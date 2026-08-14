import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../ipc";

export default function LogViewer({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState("加载中…");
  const [autoScroll, setAutoScroll] = useState(true);
  const bodyRef = useRef<HTMLPreElement>(null);

  const refresh = useCallback(async () => {
    try {
      setContent(await api.readLog());
    } catch (e) {
      setContent(`读取日志失败: ${e}`);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 内容变化后自动滚到底部（最新日志）
  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [content, autoScroll]);

  const handleClear = async () => {
    if (!confirm("确定清空全部错误日志？")) return;
    try {
      await api.clearLog();
      await refresh();
    } catch (e) {
      alert(`清空失败: ${e}`);
    }
  };

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal log-viewer">
        <div className="modal-header">
          <h3>错误日志</h3>
          <div className="log-viewer-actions">
            <label className="auto-scroll">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              自动滚动
            </label>
            <button className="btn btn-sm" onClick={refresh}>⟳ 刷新</button>
            <button className="btn btn-sm" onClick={handleClear}>🗑 清空</button>
            <button
              className="btn btn-sm"
              onClick={() => api.openLogDir().catch((e) => alert(e))}
            >
              📂 打开目录
            </button>
            <button className="icon-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        <pre ref={bodyRef} className="log-viewer-body">
          {content}
        </pre>
      </div>
    </div>
  );
}
