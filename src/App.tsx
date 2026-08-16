import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import SftpPanel from "./components/SftpPanel";
import TabBar from "./components/TabBar";
import TerminalPane from "./components/TerminalPane";
import TitleBar from "./components/TitleBar";
import { b64ToBytes, onTermEvent, type TermDataEvent, type TermErrorEvent, type TermExitEvent } from "./ipc";
import { useConnections } from "./stores/connections";
import { applyWindowSize, useSettings } from "./stores/settings";
import { scheduleReconnect, useTabs } from "./stores/tabs";
import { useTheme } from "./stores/theme";

export default function App() {
  const { tabs, activeId, sftpOpen } = useTabs();
  const load = useConnections((s) => s.load);

  // 加载连接配置
  useEffect(() => {
    load().catch((e) => console.error("加载连接失败:", e));
  }, [load]);

  // 加载用户自定义主题
  useEffect(() => {
    useTheme.getState().loadUserThemes();
  }, []);

  // 恢复持久化的窗口大小
  useEffect(() => {
    applyWindowSize(useSettings.getState().windowSize);
  }, []);

  // Ctrl+Tab：切换连接标签（有上一个切上一个，否则切下一个，单标签无操作）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || (e.key !== "Tab" && e.code !== "Tab")) return;
      e.preventDefault();
      e.stopPropagation();
      const { tabs, activeId, setActive } = useTabs.getState();
      if (tabs.length < 2) return; // 没有下一个，无操作
      const idx = tabs.findIndex((t) => t.id === activeId);
      if (idx > 0) {
        setActive(tabs[idx - 1].id); // 有上一个：切回上一个
      } else {
        setActive(tabs[1].id); // 没有上一个：切换下一个
      }
    };
    // capture 阶段最先捕获，避免被 WebView2/焦点/终端控件拦截
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  // 全局终端事件分发（注册一次）
  useEffect(() => {
    let unlisteners: (() => void)[] = [];
    (async () => {
      unlisteners.push(
        await onTermEvent<TermDataEvent>("term:data", (p) => {
          const bytes = b64ToBytes(p.data);
          const { terminals, pendingData, bufferData } = useTabs.getState();
          const term = terminals[p.sessionId];
          if (term) {
            term.write(bytes);
          } else {
            // 终端尚未挂载（连接刚建立），缓冲数据待注册后回放
            void pendingData;
            bufferData(p.sessionId, bytes);
          }
        }),
      );
      unlisteners.push(
        await onTermEvent<TermExitEvent>("term:exit", (p) => {
          const { tabs: all, setStatus } = useTabs.getState();
          const tab = all.find((t) => t.id === p.sessionId);
          if (!tab) return;
          // 错误中断时保留 error 状态展示原因
          if (tab.status !== "error") setStatus(p.sessionId, "closed");
          if (tab.autoReconnect) scheduleReconnect(p.sessionId);
        }),
      );
      unlisteners.push(
        await onTermEvent<TermErrorEvent>("term:error", (p) => {
          const { tabs: all, setStatus } = useTabs.getState();
          const tab = all.find((t) => t.id === p.sessionId);
          if (!tab) return;
          setStatus(p.sessionId, "error", p.message);
          if (tab.autoReconnect) scheduleReconnect(p.sessionId);
        }),
      );
    })();
    return () => unlisteners.forEach((u) => u());
  }, []);

  const activeTab = tabs.find((t) => t.id === activeId);

  return (
    <div className="app-root">
      <TitleBar />
      <div className="app">
        <Sidebar />
        <main className="main">
          <div className="content-row">
            {/* 中栏：连接标签 + 终端内容 */}
            <div className="center-col">
              <TabBar />
              <div className="terminal-area">
                {tabs.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-title">c-ssh</div>
                    <div className="empty-sub">
                      在左侧选择连接双击打开终端，
                      <br />
                      或点击「演示终端」无需服务器体验。
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 所有 tab 的终端实例保活：切换标签不销毁，内容保留 */}
                    {tabs.map((t) => (
                      <div
                        key={t.id}
                        className="terminal-col"
                        style={{ display: t.id === activeId ? undefined : "none" }}
                      >
                        <TerminalPane tab={t} active={t.id === activeId} />
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
            {/* 右栏：文件栏（独立，宽度可拖拽） */}
            {activeTab?.connId && activeTab.status === "connected" && sftpOpen && (
              <SftpPanel tab={activeTab} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
