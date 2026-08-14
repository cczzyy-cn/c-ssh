import { useEffect, useState } from "react";
import { BUILTIN_THEMES } from "../themes";
import { useTheme, type ThemeMode } from "../stores/theme";
import { useSettings } from "../stores/settings";
import { api } from "../ipc";
import LogViewer from "./LogViewer";

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { mode, themeName, setMode, setThemeName } = useTheme();
  const { fontSize, setFontSize } = useSettings();
  const [logPath, setLogPath] = useState("");
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    api.getLogPath().then(setLogPath).catch(() => undefined);
  }, []);

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-narrow">
        <div className="modal-header">
          <h3>设置</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="form-grid">
          <label>
            终端字号
            <div className="font-size-row">
              <button className="btn btn-sm" onClick={() => setFontSize(fontSize - 1)}>−</button>
              <span className="font-size-value">{fontSize} px</span>
              <button className="btn btn-sm" onClick={() => setFontSize(fontSize + 1)}>+</button>
            </div>
            <span className="hint">也可在终端内按 Ctrl+= / Ctrl+- 调整</span>
          </label>

          <label>
            外观模式
            <select value={mode} onChange={(e) => setMode(e.target.value as ThemeMode)}>
              <option value="system">跟随系统</option>
              <option value="dark">深色</option>
              <option value="light">浅色</option>
            </select>
          </label>

          <div className="span-2">
            <div className="group-title">选择主题</div>
            <div className="theme-grid">
              {BUILTIN_THEMES.map((t) => (
                <div
                  key={t.name}
                  className={`theme-card ${t.name === themeName ? "selected" : ""} ${t.type}`}
                  onClick={() => setThemeName(t.name)}
                >
                  <div className="theme-swatches">
                    <span style={{ background: t.terminal.background }} />
                    <span style={{ background: t.terminal.red }} />
                    <span style={{ background: t.terminal.green }} />
                    <span style={{ background: t.terminal.yellow }} />
                    <span style={{ background: t.terminal.blue }} />
                    <span style={{ background: t.terminal.magenta }} />
                    <span style={{ background: t.terminal.cyan }} />
                  </div>
                  <div className="theme-name">{t.name}</div>
                </div>
              ))}
            </div>
            <p className="hint">
              {mode === "system" ? "当前按系统亮暗自动选择" : mode === "dark" ? "深色模式：仅使用深色主题" : "浅色模式：仅使用浅色主题"}
            </p>
          </div>

          <div className="span-2">
            <div className="group-title">错误日志</div>
            <p className="hint log-path" title={logPath}>
              日志文件：{logPath || "获取中…"}
            </p>
            <div className="log-actions">
              <button className="btn btn-sm" onClick={() => setShowLog(true)}>
                👁 查看错误日志
              </button>
              <button className="btn btn-sm" onClick={() => api.openLogDir().catch((e) => alert(e))}>
                📂 打开日志目录
              </button>
            </div>
          </div>
        </div>

        {showLog && <LogViewer onClose={() => setShowLog(false)} />}
      </div>
    </div>
  );
}
