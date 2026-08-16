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
  /** 编辑已有主题时传入；否则从当前主题克隆新建 */
  initial?: { name: string; type: "dark" | "light"; palette: Palette; terminal: Record<string, string> };
}

function ColorField({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
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
      <span className="color-info">
        <span className="color-label">{label}</span>
        {desc && <span className="color-desc">{desc}</span>}
      </span>
      <input
        className="color-hex"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </label>
  );
}

const PALETTE_FIELDS: { key: keyof Palette; label: string; desc: string }[] = [
  { key: "bg", label: "背景", desc: "窗口 / 终端内容背景" },
  { key: "bgAlt", label: "面板", desc: "侧边栏 / 标签栏 / 文件栏" },
  { key: "bgInput", label: "输入框", desc: "搜索框 / 表单输入" },
  { key: "fg", label: "前景", desc: "正文 / 标题文字" },
  { key: "fgDim", label: "次要文字", desc: "连接副行 / 提示 / 图标" },
  { key: "accent", label: "强调色", desc: "主按钮 / 链接 / 焦点 / 选中" },
  { key: "accentFg", label: "强调文字", desc: "主按钮上的文字" },
  { key: "border", label: "边框", desc: "边框 / 分隔线 / 滚动条" },
  { key: "hover", label: "悬停", desc: "列表项 / 按钮悬停背景" },
  { key: "selection", label: "选中", desc: "文本选区 / 终端选区" },
  { key: "danger", label: "危险", desc: "错误 / 删除 / 关闭悬停" },
  { key: "success", label: "成功", desc: "在线状态点 / 成功提示" },
  { key: "warning", label: "警告", desc: "连接中状态点 / 警告" },
  { key: "info", label: "信息", desc: "信息提示" },
  { key: "link", label: "链接", desc: "链接文字（默认=强调色）" },
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

export default function ThemeEditor({ onClose, initial }: Props) {
  const resolved = useTheme((s) => s.resolved);
  const [name, setName] = useState(initial?.name ?? `${resolved.name} 副本`);
  const [palette, setPalette] = useState<Palette>({
    ...(initial?.palette ?? resolved.palette),
  });
  const [terminal, setTerminal] = useState<Record<string, string>>({
    ...(initial?.terminal ?? resolved.terminal),
  });
  const prevRef = useRef(resolved);
  const themeType = initial?.type ?? resolved.type;

  // 窗口拖动
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const onHeaderDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // 关闭按钮不触发拖动
    e.preventDefault();
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setOffset({
        x: dragRef.current.ox + ev.clientX - dragRef.current.sx,
        y: dragRef.current.oy + ev.clientY - dragRef.current.sy,
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 实时预览：任何色值变化立即应用到 UI 与已打开的终端
  useEffect(() => {
    const tmp: ThemeDef = {
      name,
      type: themeType,
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
      .setTheme(themeType === "dark" ? "dark" : "light")
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
        JSON.stringify({ name: n, type: themeType, palette, terminal }),
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
    <div className="modal-mask modal-mask-plain">
      <div
        className="modal theme-editor modal-fixed-header"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div className="modal-header theme-editor-header" onMouseDown={onHeaderDown}>
          <h3>{initial ? `编辑主题：${initial.name}` : "新建主题"}</h3>
          <button className="icon-btn" onClick={handleCancel}>✕</button>
        </div>

        <div className="modal-body">
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
                desc={f.desc}
                value={String(palette[f.key] ?? "")}
                onChange={(v) => setPalette((p) => ({ ...p, [f.key]: v }))}
              />
            ))}
          </div>

          <div className="group-title">终端 ANSI 色板（终端文字颜色）</div>
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
        </div>

        <div className="modal-footer theme-editor-footer">
          <button className="btn" onClick={handleCancel}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>保存主题</button>
        </div>
      </div>
    </div>
  );
}
