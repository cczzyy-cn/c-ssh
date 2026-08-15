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

export default function App() {
  const { tabs, activeId, sftpOpen } = useTabs();
  const load = useConnections((s) => s.load);

  // 加载连接配置
  useEffect(() => {
    load().catch((e) => console.error("加载连接失败:", e));
  }, [load]);

  // 恢复持久化的窗口大小
  useEffect(() => {
    applyWindowSize(useSettings.getState().windowSize);
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
              {activeTab?.connId &&
                activeTab.status === "connected" &&
                sftpOpen && <SftpPanel tab={activeTab} />}
            </>
          )}
        </div>
        </main>
      </div>
    </div>
  );
}
