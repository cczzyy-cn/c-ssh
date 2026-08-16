use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const KEYRING_SERVICE: &str = "com.cssh.app";

fn default_port() -> u16 {
    22
}
fn default_true() -> bool {
    true
}
fn default_keepalive() -> u64 {
    30
}
fn default_timeout() -> u64 {
    10
}
fn default_font_size() -> u16 {
    14
}
fn default_font_family() -> String {
    "Cascadia Mono, Consolas, monospace".into()
}
fn default_cursor_style() -> String {
    "block".into()
}
fn default_scrollback() -> u32 {
    5000
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    #[serde(rename = "type")]
    pub auth_type: String,
    #[serde(default)]
    pub key_path: Option<String>,
    #[serde(default = "default_true")]
    pub use_agent: bool,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            auth_type: "password".into(),
            key_path: None,
            use_agent: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    #[serde(rename = "type")]
    pub proxy_type: String, // socks5 | http
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForward {
    pub name: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    #[serde(default = "default_keepalive")]
    pub keep_alive_interval: u64,
    #[serde(default)]
    pub compression: bool,
    #[serde(default = "default_timeout")]
    pub connect_timeout: u64,
    #[serde(default)]
    pub auto_reconnect: bool,
    #[serde(default)]
    pub proxy: Option<ProxyConfig>,
    #[serde(default)]
    pub port_forwards: Vec<PortForward>,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            keep_alive_interval: default_keepalive(),
            compression: false,
            connect_timeout: default_timeout(),
            auto_reconnect: false,
            proxy: None,
            port_forwards: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermOptions {
    #[serde(default = "default_font_size")]
    pub font_size: u16,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_cursor_style")]
    pub cursor_style: String,
    #[serde(default = "default_scrollback")]
    pub scrollback: u32,
}

impl Default for TermOptions {
    fn default() -> Self {
        Self {
            font_size: default_font_size(),
            font_family: default_font_family(),
            cursor_style: default_cursor_style(),
            scrollback: default_scrollback(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub group: String,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub auth: AuthConfig,
    #[serde(default)]
    pub options: Options,
    #[serde(default)]
    pub terminal: TermOptions,
    #[serde(default)]
    pub theme: Option<String>,
}

/// 配置存储：连接配置存 JSON 文件，密码/口令存 OS keyring，用户主题存 themes 目录。
pub struct Store {
    config_path: PathBuf,
    themes_dir: PathBuf,
}

impl Store {
    pub fn new() -> Self {
        let dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("c-ssh");
        fs::create_dir_all(&dir).ok();
        let themes_dir = dir.join("themes");
        fs::create_dir_all(&themes_dir).ok();
        Self {
            config_path: dir.join("connections.json"),
            themes_dir,
        }
    }

    /// 用户主题目录（`config_dir/c-ssh/themes/`）。
    pub fn themes_dir(&self) -> &PathBuf {
        &self.themes_dir
    }

    /// 列出全部用户主题（解析每个 *.json 为 ThemeDef）。
    pub fn list_user_themes(&self) -> Vec<serde_json::Value> {
        let mut out = Vec::new();
        if let Ok(entries) = fs::read_dir(&self.themes_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                if let Ok(s) = fs::read_to_string(&path) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                        out.push(v);
                    }
                }
            }
        }
        out
    }

    /// 保存用户主题（文件名取自 JSON 的 name 字段）。
    pub fn save_user_theme(&self, content: &str) -> Result<String, String> {
        let v: serde_json::Value =
            serde_json::from_str(content).map_err(|e| format!("主题 JSON 解析失败: {e}"))?;
        let name = v
            .get("name")
            .and_then(|n| n.as_str())
            .ok_or("主题缺少 name 字段")?
            .to_string();
        let path = self.themes_dir.join(format!("{name}.json"));
        fs::write(&path, content).map_err(|e| format!("写入主题失败: {e}"))?;
        Ok(name)
    }

    /// 删除用户主题。
    pub fn delete_user_theme(&self, name: &str) -> Result<(), String> {
        let path = self.themes_dir.join(format!("{name}.json"));
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("删除主题失败: {e}"))?;
        }
        Ok(())
    }

    pub fn load_connections(&self) -> Vec<ConnectionConfig> {
        match fs::read_to_string(&self.config_path) {
            Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    }

    pub fn save_connections(&self, conns: &[ConnectionConfig]) -> Result<(), String> {
        let json = serde_json::to_string_pretty(conns).map_err(|e| e.to_string())?;
        fs::write(&self.config_path, json).map_err(|e| e.to_string())
    }

    /// 按 id 新增或更新连接，返回落盘后的配置（含生成的新 id）。
    pub fn upsert_connection(&self, mut conn: ConnectionConfig) -> Result<ConnectionConfig, String> {
        if conn.id.is_empty() {
            conn.id = uuid::Uuid::new_v4().to_string();
        }
        let mut all = self.load_connections();
        if let Some(i) = all.iter().position(|c| c.id == conn.id) {
            all[i] = conn.clone();
        } else {
            all.push(conn.clone());
        }
        self.save_connections(&all)?;
        Ok(conn)
    }

    pub fn get_connection(&self, id: &str) -> Option<ConnectionConfig> {
        self.load_connections()
            .into_iter()
            .find(|c| c.id == id)
    }

    pub fn delete_connection(&self, id: &str) -> Result<(), String> {
        let mut all = self.load_connections();
        all.retain(|c| c.id != id);
        self.save_connections(&all)
    }

    // ---- 凭据（OS keyring），键为连接 id ----

    pub fn load_secret(&self, conn_id: &str) -> Result<String, String> {
        Entry::new(KEYRING_SERVICE, conn_id)
            .map_err(|e| format!("keyring 初始化失败: {e}"))?
            .get_password()
            .map_err(|e| format!("读取凭据失败: {e}"))
    }

    pub fn set_secret(&self, conn_id: &str, secret: &str) -> Result<(), String> {
        Entry::new(KEYRING_SERVICE, conn_id)
            .map_err(|e| format!("keyring 初始化失败: {e}"))?
            .set_password(secret)
            .map_err(|e| format!("保存凭据失败: {e}"))
    }

    pub fn delete_secret(&self, conn_id: &str) {
        if let Ok(entry) = Entry::new(KEYRING_SERVICE, conn_id) {
            entry.delete_credential().ok();
        }
    }
}
