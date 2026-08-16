import { useEffect, useState } from "react";
import { open as dialogOpen, save as dialogSave, confirm as dialogConfirm } from "@tauri-apps/plugin-dialog";
import { getAllThemeDefs, isUserTheme, type ThemeDef } from "../themes";
import { useTheme, type ThemeMode } from "../stores/theme";
import { useSettings, type WindowSize } from "../stores/settings";
import { api } from "../ipc";
import LogViewer from "./LogViewer";

interface Props {
  onClose: () => void;
  /** 打开主题编辑器（新建不传 initial，编辑用户主题传 initial） */
  onOpenThemeEditor: (initial?: ThemeDef) => void;
}

export default function SettingsPanel({ onClose, onOpenThemeEditor }: Props) {
  const { mode, setMode, setThemeName } = useTheme();
  const resolved = useTheme((s) => s.resolved);
  // 外观模式过滤：system 显示全部，dark/light 只显示对应类型的主题
  const visibleThemes = getAllThemeDefs().filter(
    (t) => mode === "system" || t.type === mode,
  );
  const { fontSize, uiFontSize, setFontSize, setUiFontSize, windowSize, setWindowSize } = useSettings();
  const [sizeInput, setSizeInput] = useState<WindowSize>(windowSize);
  const [showLog, setShowLog] = useState(false);
  const [logPath, setLogPath] = useState("");
  // 导入主题改名弹窗：选择文件后输入新主题名
  const [importDraft, setImportDraft] = useState<{ name: string; content: string } | null>(null);

  useEffect(() => {
    api.getLogPath().then(setLogPath).catch(() => undefined);
  }, []);

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-settings modal-fixed-header">
        <div className="modal-header">
          <h3>设置</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
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
            界面字号（字体与图标）
            <div className="font-size-row">
              <button className="btn btn-sm" onClick={() => setUiFontSize(uiFontSize - 1)}>−</button>
              <span className="font-size-value">{uiFontSize} px</span>
              <button className="btn btn-sm" onClick={() => setUiFontSize(uiFontSize + 1)}>+</button>
            </div>
            <span className="hint">作用于侧边栏/标签栏/文件栏/表单等全部界面</span>
          </label>

          <label>
            窗口大小（宽 × 高）
            <div className="proxy-row">
              <input
                type="number"
                value={sizeInput.width}
                onChange={(e) => setSizeInput((s) => ({ ...s, width: Number(e.target.value) || 1100 }))}
              />
              <span className="size-x">×</span>
              <input
                type="number"
                value={sizeInput.height}
                onChange={(e) => setSizeInput((s) => ({ ...s, height: Number(e.target.value) || 700 }))}
              />
            </div>
            <div className="log-actions" style={{ marginTop: 4 }}>
              <button
                className="btn btn-sm"
                onClick={() => setWindowSize(sizeInput).catch((e) => alert(`调整失败: ${e}`))}
              >
                ✓ 应用窗口大小
              </button>
            </div>
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
            <div className="theme-toolbar">
              <div className="group-title" style={{ padding: 0 }}>选择主题</div>
              <div className="theme-toolbar-btns">
                <button
                  className="btn btn-sm"
                  title="从当前主题克隆并编辑"
                  onClick={() => onOpenThemeEditor()}
                >
                  ＋ 新建主题
                </button>
                <button
                  className="btn btn-sm"
                  title="导出当前生效主题为 JSON 文件"
                  onClick={async () => {
                    const path = await dialogSave({
                      title: "导出主题",
                      defaultPath: `${resolved.name}.json`,
                      filters: [{ name: "JSON", extensions: ["json"] }],
                    });
                    if (!path || Array.isArray(path)) return;
                    try {
                      await api.exportTheme(
                        path,
                        JSON.stringify(
                          { name: resolved.name, type: resolved.type, palette: resolved.palette, terminal: resolved.terminal },
                          null,
                          2,
                        ),
                      );
                    } catch (e) {
                      alert(`导出失败: ${e}`);
                    }
                  }}
                >
                  ⇧ 导出主题
                </button>
                <button
                  className="btn btn-sm"
                  title="从 JSON 文件导入主题"
                  onClick={async () => {
                    const path = await dialogOpen({
                      title: "导入主题",
                    multiple: false,
                    filters: [{ name: "JSON", extensions: ["json"] }],
                  });
                  if (!path || Array.isArray(path)) return;
                  try {
                    // 选择文件后先读内容，弹输入框输入新主题名
                    const content = await api.readTextFile(path);
                    let json: any;
                    try {
                      json = JSON.parse(content);
                    } catch {
                      throw "主题 JSON 解析失败";
                    }
                    const defaultName =
                      (typeof json?.name === "string" && json.name) ||
                      path.split(/[\\/]/).pop()?.replace(/\.json$/i, "") ||
                      "新主题";
                    setImportDraft({ name: defaultName, content });
                  } catch (e) {
                    alert(`导入失败: ${e}`);
                  }
                }}
              >
                ⇩ 导入主题
              </button>
              </div>
            </div>
            <div className="theme-grid">
              {visibleThemes.map((t) => (
                <div
                  key={t.name}
                  className={`theme-card ${t.name === resolved.name ? "selected" : ""} ${t.type}`}
                  onClick={() => setThemeName(t.name)}
                >
                  <div className="theme-swatches" title="主 UI 配色（边框/分隔/悬停/选中等）">
                    <span style={{ background: t.palette.bg }} title="背景" />
                    <span style={{ background: t.palette.bgAlt }} title="次级背景" />
                    <span style={{ background: t.palette.fg }} title="前景" />
                    <span style={{ background: t.palette.accent }} title="强调色" />
                    <span style={{ background: t.palette.border }} title="边框色" />
                    <span style={{ background: t.palette.divider ?? t.palette.border }} title="分隔色" />
                    <span style={{ background: t.palette.hover }} title="悬停色" />
                    <span style={{ background: t.palette.selection }} title="选中色" />
                  </div>
                  <div className="theme-name">{t.name}</div>
                  {isUserTheme(t.name) && (
                    <>
                      <button
                        className="icon-btn theme-delete"
                        title="编辑此主题"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenThemeEditor(t);
                        }}
                      >
                        ✎
                      </button>
                      <button
                        className="icon-btn theme-delete theme-delete-del"
                        title="删除此主题"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!(await dialogConfirm(`确定删除主题「${t.name}」？`, { title: "删除确认", kind: "warning" }))) return;
                          try {
                            await api.deleteUserTheme(t.name);
                            await useTheme.getState().loadUserThemes();
                          } catch (err) {
                            alert(`删除失败: ${err}`);
                          }
                        }}
                      >
                        ✕
                      </button>
                    </>
                  )}
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
            </div>
          </div>
        </div>
        </div>{/* modal-body 结束 */}

        {showLog && <LogViewer onClose={() => setShowLog(false)} />}

        {/* 导入主题：输入新主题名 */}
        {importDraft && (
          <div className="modal-mask" onClick={() => setImportDraft(null)}>
            <div className="modal import-theme-modal" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 12px" }}>导入主题</h3>
              <label style={{ display: "block", marginBottom: 6, color: "var(--color-fg-dim)" }}>
                输入新主题名
              </label>
              <input
                className="form-input"
                value={importDraft.name}
                autoFocus
                onChange={(e) => setImportDraft({ ...importDraft, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const name = importDraft.name.trim();
                    if (!name) return;
                    try {
                      const json = JSON.parse(importDraft.content);
                      json.name = name;
                      api
                        .saveUserTheme(JSON.stringify(json))
                        .then(async () => {
                          await useTheme.getState().loadUserThemes();
                          setImportDraft(null);
                        })
                        .catch((err) => alert(`导入失败: ${err}`));
                    } catch {
                      alert("主题 JSON 解析失败");
                    }
                  }
                }}
              />
              <div className="modal-actions" style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => setImportDraft(null)}>
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const name = importDraft.name.trim();
                    if (!name) return;
                    try {
                      const json = JSON.parse(importDraft.content);
                      json.name = name;
                      api
                        .saveUserTheme(JSON.stringify(json))
                        .then(async () => {
                          await useTheme.getState().loadUserThemes();
                          setImportDraft(null);
                        })
                        .catch((err) => alert(`导入失败: ${err}`));
                    } catch {
                      alert("主题 JSON 解析失败");
                    }
                  }}
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
