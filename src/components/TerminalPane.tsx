import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { api, strToB64 } from "../ipc";
import { useTabs, type Tab } from "../stores/tabs";
import { useTheme } from "../stores/theme";
import { useSettings } from "../stores/settings";
import { getTheme } from "../themes";

export default function TerminalPane({ tab }: { tab: Tab }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resolved = useTheme((s) => s.resolved);
  const fontSize = useSettings((s) => s.fontSize);
  const setFontSize = useSettings((s) => s.setFontSize);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");

  const themeName = tab.theme || resolved.name;
  const terminalTheme = getTheme(themeName).terminal;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const term = new Terminal({
      fontSize,
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      cursorBlink: true,
      scrollback: 5000,
      theme: terminalTheme,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon());
    term.open(el);
    fit.fit();
    term.focus(); // 连接成功后自动聚焦输入

    useTabs.getState().registerTerminal(tab.id, term);

    // 快捷键：Ctrl+Shift+C 复制 / Ctrl+Shift+V 粘贴 / Ctrl+Shift+F 搜索 / Ctrl+= 与 Ctrl+- 字号
    term.attachCustomKeyEventHandler((e) => {
      if (!(e.ctrlKey || e.metaKey)) return true;
      const key = e.key.toLowerCase();
      if (e.shiftKey && key === "c") {
        const sel = term.getSelection();
        if (sel) navigator.clipboard.writeText(sel).catch(() => undefined);
        term.clearSelection();
        return false;
      }
      if (e.shiftKey && key === "v") {
        navigator.clipboard
          .readText()
          .then((t) => api.writeInput(tab.id, strToB64(t)).catch(() => undefined))
          .catch(() => undefined);
        return false;
      }
      if (e.shiftKey && key === "f") {
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return false;
      }
      if (key === "=" || key === "+") {
        setFontSize(fontSizeRef.current + 1);
        return false;
      }
      if (key === "-") {
        setFontSize(fontSizeRef.current - 1);
        return false;
      }
      return true;
    });

    const dataSub = term.onData((d) => {
      api.writeInput(tab.id, strToB64(d)).catch(() => undefined);
    });
    // fit.fit() 内部触发 term.resize，从而驱动该回调通知后端同步窗口尺寸
    const resizeSub = term.onResize(({ cols, rows }) => {
      api.resize(tab.id, cols, rows).catch(() => undefined);
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      dataSub.dispose();
      resizeSub.dispose();
      useTabs.getState().unregisterTerminal(tab.id);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  // 字号变化
  useEffect(() => {
    const term = useTabs.getState().terminals[tab.id];
    if (term) term.options.fontSize = fontSize;
  }, [tab.id, fontSize]);

  // 主题变化时更新 xterm 配色
  useEffect(() => {
    const term = useTabs.getState().terminals[tab.id];
    if (term) {
      term.options.theme = terminalTheme;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, themeName]);

  // 保持最新字号供快捷键闭包使用
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

  const doSearch = useCallback(
    (dir: 1 | -1) => {
      const term = useTabs.getState().terminals[tab.id];
      if (!term || !query) return;
      const addon = term as unknown as { findNext: (q: string) => boolean; findPrevious: (q: string) => boolean };
      if (dir === 1) addon.findNext(query);
      else addon.findPrevious(query);
    },
    [tab.id, query],
  );

  return (
    <div className="terminal-pane">
      {showSearch && (
        <div className="search-bar">
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") doSearch(e.shiftKey ? -1 : 1);
              if (e.key === "Escape") setShowSearch(false);
            }}
            placeholder="搜索（Enter 下一个，Shift+Enter 上一个）"
          />
          <button className="icon-btn" title="上一个" onClick={() => doSearch(-1)}>▲</button>
          <button className="icon-btn" title="下一个" onClick={() => doSearch(1)}>▼</button>
          <button className="icon-btn" title="关闭" onClick={() => setShowSearch(false)}>✕</button>
        </div>
      )}
      <div ref={containerRef} className="terminal-container" />
      {(tab.status === "closed" || tab.status === "error") && (
        <div className="terminal-overlay">
          <div className="overlay-text">
            {tab.status === "error" ? `连接中断: ${tab.error ?? "未知错误"}` : "会话已结束"}
          </div>
          <button className="btn" onClick={() => useTabs.getState().closeTab(tab.id)}>
            关闭标签
          </button>
        </div>
      )}
    </div>
  );
}
