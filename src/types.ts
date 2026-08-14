export type AuthType = "password" | "key" | "agent";

export interface AuthConfig {
  type: AuthType;
  keyPath?: string;
  useAgent?: boolean;
}

export interface ProxyConfig {
  type: "socks5" | "http";
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface PortForward {
  name: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export interface Options {
  keepAliveInterval: number;
  compression: boolean;
  connectTimeout: number;
  autoReconnect: boolean;
  proxy?: ProxyConfig;
  portForwards: PortForward[];
}

export interface TermOptions {
  fontSize: number;
  fontFamily: string;
  cursorStyle: "block" | "underline" | "bar";
  scrollback: number;
}

export interface ConnectionConfig {
  id: string;
  name: string;
  group: string;
  host: string;
  port: number;
  username: string;
  auth: AuthConfig;
  options: Options;
  terminal: TermOptions;
  theme?: string;
}

export function emptyConnection(): ConnectionConfig {
  return {
    id: "",
    name: "",
    group: "默认",
    host: "",
    port: 22,
    username: "",
    auth: { type: "password", keyPath: "", useAgent: true },
    options: { keepAliveInterval: 30, compression: false, connectTimeout: 10, autoReconnect: false, proxy: undefined, portForwards: [] },
    terminal: {
      fontSize: 14,
      fontFamily: "Cascadia Mono, Consolas, monospace",
      cursorStyle: "block",
      scrollback: 5000,
    },
    theme: undefined,
  };
}
