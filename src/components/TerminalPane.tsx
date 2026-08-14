import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api, strToB64 } from "../ipc";
import { useTabs, type Tab } from "../stores/tabs";
import { useTheme } from "../stores/theme";
import { getTheme } from "../themes";

export default function TerminalPane({ tab }: { tab: Tab }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const resolved = useTheme((s) => s.resolved);

  const themeName = tab.theme || resolved.name;
  const terminalTheme = getTheme(themeName).terminal;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const term = new Terminal({
      fontSize: 14,
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      cursorBlink: true,
      scrollback: 5000,
      theme: terminalTheme,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    useTabs.getState().registerTerminal(tab.id, term);

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

  // 主题变化时更新 xterm 配色
  useEffect(() => {
    const term = useTabs.getState().terminals[tab.id];
    if (term) {
      term.options.theme = terminalTheme;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, themeName]);

  return (
    <div className="terminal-pane">
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
