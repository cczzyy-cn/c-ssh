import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  deriveTerminal,
  deriveUi,
  type Palette,
  type ThemeDef,
} from "../themes";
import { api } from "../ipc";
import { useTheme } from "../stores/theme";
import { useTabs } from "../stores/tabs";

interface Props {
  onClose: () => void;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="color-field">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="color-label">{label}</span>
      <input
        className="color-hex"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </label>
  );
}

const PALETTE_FIELDS: { key: keyof Palette; label: string }[] = [
  { key: "bg", label: "背景" },
  { key: "bgAlt", label: "面板" },
  { key: "bgInput", label: "输入框" },
  { key: "fg", label: "前景" },
  { key: "fgDim", label: "次要文字" },
  { key: "accent", label: "强调色" },
  { key: "accentFg", label: "强调文字" },
  { key: "border", label: "边框" },
  { key: "hover", label: "悬停" },
  { key: "selection", label: "选中" },
  { key: "danger", label: "危险" },
  { key: "success", label: "成功" },
  { key: "warning", label: "警告" },
  { key: "info", label: "信息" },
  { key: "link", label: "链接" },
];

const ANSI_FIELDS: { key: string; label: string }[] = [
  { key: "black", label: "black" },
  { key: "red", label: "red" },
  { key: "green", label: "green" },
  { key: "yellow", label: "yellow" },
  { key: "blue", label: "blue" },
  { key: "magenta", label: "magenta" },
  { key: "cyan", label: "cyan" },
  { key: "white", label: "white" },
  { key: "brightBlack", label: "brightBlack" },
  { key: "brightRed", label: "brightRed" },
  { key: "brightGreen", label: "brightGreen" },
  { key: "brightYellow", label: "brightYellow" },
  { key: "brightBlue", label: "brightBlue" },
  { key: "brightMagenta", label: "brightMagenta" },
  { key: "brightCyan", label: "brightCyan" },
  { key: "brightWhite", label: "brightWhite" },
];

export default function ThemeEditor({ onClose }: Props) {
  const resolved = useTheme((s) => s.resolved);
  const [name, setName] = useState(`${resolved.name} 副本`);
  const [palette, setPalette] = useState<Palette>({ ...resolved.palette });
  const [terminal, setTerminal] = useState<Record<string, string>>({
    ...resolved.terminal,
  });
  const prevRef = useRef(resolved);

  // 实时预览：任何色值变化立即应用到 UI 与已打开的终端
  useEffect(() => {
    const tmp: ThemeDef = {
      name,
      type: resolved.type,
      palette,
      terminal,
    };
    const ui = deriveUi(tmp.palette);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(ui)) root.style.setProperty(k, v);
    const termTheme = deriveTerminal(tmp.palette, tmp.terminal);
    for (const term of Object.values(useTabs.getState().terminals)) {
      term.options.theme = termTheme;
      try {
        term.refresh(0, term.rows - 1);
      } catch {
        /* ignore */
      }
    }
    getCurrentWindow()
      .setTheme(resolved.type === "dark" ? "dark" : "light")
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, terminal]);

  const handleSave = async () => {
    const n = name.trim();
    if (!n) {
      alert("请输入主题名称");
      return;
    }
    try {
      await api.saveUserTheme(
        JSON.stringify({ name: n, type: resolved.type, palette, terminal }),
      );
      await useTheme.getState().loadUserThemes();
      useTheme.getState().setThemeName(n);
      onClose();
    } catch (e) {
      alert(`保存失败: ${e}`);
    }
  };

  const handleCancel = () => {
    // 还原编辑前的主题
    const prev = prevRef.current;
    const ui = deriveUi(prev.palette);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(ui)) root.style.setProperty(k, v);
    for (const term of Object.values(useTabs.getState().terminals)) {
      term.options.theme = prev.terminal;
      try {
        term.refresh(0, term.rows - 1);
      } catch {
        /* ignore */
      }
    }
    onClose();
  };

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && handleCancel()}>
      <div className="modal theme-editor">
        <div className="modal-header">
          <h3>主题编辑器</h3>
          <button className="icon-btn" onClick={handleCancel}>✕</button>
        </div>

        <label className="theme-name-input">
          主题名称
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="group-title">基础色板</div>
        <div className="color-grid">
          {PALETTE_FIELDS.map((f) => (
            <ColorField
              key={f.key}
              label={f.label}
              value={String(palette[f.key] ?? "")}
              onChange={(v) => setPalette((p) => ({ ...p, [f.key]: v }))}
            />
          ))}
        </div>

        <div className="group-title">终端 ANSI 色板</div>
        <div className="color-grid">
          {ANSI_FIELDS.map((f) => (
            <ColorField
              key={f.key}
              label={f.label}
              value={terminal[f.key] ?? ""}
              onChange={(v) => setTerminal((t) => ({ ...t, [f.key]: v }))}
            />
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={handleCancel}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>保存主题</button>
        </div>
      </div>
    </div>
  );
}
