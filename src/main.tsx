import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { api } from "./ipc";
import "./global.css";

// 全局错误捕获：window.onerror / unhandledrejection → 后端日志文件
function installGlobalErrorLog() {
  window.addEventListener("error", (e) => {
    api
      .logFrontendError("window.onerror", e.message, e.error?.stack)
      .catch(() => undefined);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const msg =
      e.reason instanceof Error
        ? `${e.reason.message}\n${e.reason.stack ?? ""}`
        : String(e.reason);
    api.logFrontendError("unhandledrejection", msg).catch(() => undefined);
  });
}
installGlobalErrorLog();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
