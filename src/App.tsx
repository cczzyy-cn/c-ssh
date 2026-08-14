import { useEffect } from "react";
import Sidebar from "./components/Sidebar";
import TabBar from "./components/TabBar";
import TerminalPane from "./components/TerminalPane";
import { b64ToBytes, onTermEvent, type TermDataEvent, type TermErrorEvent, type TermExitEvent } from "./ipc";
import { useConnections } from "./stores/connections";
import { useTabs } from "./stores/tabs";

export default function App() {
  const { tabs, activeId } = useTabs();
  const load = useConnections((s) => s.load);

  // 加载连接配置
  useEffect(() => {
    load().catch((e) => console.error("加载连接失败:", e));
  }, [load]);

  // 全局终端事件分发（注册一次）
  useEffect(() => {
    let unlisteners: (() => void)[] = [];
    (async () => {
      unlisteners.push(
        await onTermEvent<TermDataEvent>("term:data", (p) => {
          const term = useTabs.getState().terminals[p.sessionId];
          if (term) term.write(b64ToBytes(p.data));
        }),
      );
      unlisteners.push(
        await onTermEvent<TermExitEvent>("term:exit", (p) => {
          const { tabs: all, setStatus } = useTabs.getState();
          const tab = all.find((t) => t.id === p.sessionId);
          // 错误中断时保留 error 状态展示原因
          if (tab && tab.status !== "error") setStatus(p.sessionId, "closed");
        }),
      );
      unlisteners.push(
        await onTermEvent<TermErrorEvent>("term:error", (p) => {
          useTabs.getState().setStatus(p.sessionId, "error", p.message);
        }),
      );
    })();
    return () => unlisteners.forEach((u) => u());
  }, []);

  const activeTab = tabs.find((t) => t.id === activeId);

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <TabBar />
        <div className="terminal-area">
          {activeTab ? (
            <TerminalPane key={activeTab.id} tab={activeTab} />
          ) : (
            <div className="empty-state">
              <div className="empty-title">c-ssh</div>
              <div className="empty-sub">
                在左侧选择连接双击打开终端，
                <br />
                或点击「演示终端」无需服务器体验。
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
