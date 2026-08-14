export type AuthType = "password" | "key" | "agent";

export interface AuthConfig {
  type: AuthType;
  keyPath?: string;
  useAgent?: boolean;
}

export interface Options {
  keepAliveInterval: number;
  compression: boolean;
  connectTimeout: number;
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
    options: { keepAliveInterval: 30, compression: false, connectTimeout: 10 },
    terminal: {
      fontSize: 14,
      fontFamily: "Cascadia Mono, Consolas, monospace",
      cursorStyle: "block",
      scrollback: 5000,
    },
    theme: undefined,
  };
}
