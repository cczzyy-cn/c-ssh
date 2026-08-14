use chrono::Local;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

/// 全局错误日志：所有日志写入 data_dir/c-ssh/logs/app.log（超过 1MB 轮转为 app.log.1）。
/// 任何日志均不记录密码/密钥内容。

const MAX_LOG_SIZE: u64 = 1024 * 1024;

static LOG_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn log_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("c-ssh")
        .join("logs")
}

pub fn log_file() -> PathBuf {
    log_dir().join("app.log")
}

/// 初始化日志系统并注册 panic hook（记录未捕获 panic 到日志文件）。
/// 需在 tauri 启动早期调用一次。
pub fn init() {
    fs::create_dir_all(log_dir()).ok();
    // 简单轮转：上次日志超过上限则改名为 app.log.1
    if let Ok(meta) = fs::metadata(log_file()) {
        if meta.len() > MAX_LOG_SIZE {
            let _ = fs::rename(log_file(), log_dir().join("app.log.1"));
        }
    }
    *LOG_FILE.lock().unwrap() = Some(log_file());

    std::panic::set_hook(Box::new(|info| {
        let msg = info.to_string();
        error(&format!("[panic] {msg}"));
        eprintln!("[c-ssh panic] {msg}");
    }));
}

fn write(level: &str, msg: &str) {
    let path = LOG_FILE.lock().unwrap().clone();
    let Some(path) = path else { return };
    let line = format!(
        "[{}] [{}] {}\n",
        Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
        level,
        msg
    );
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(line.as_bytes());
    }
}

pub fn error(msg: &str) {
    write("ERROR", msg);
}

#[allow(dead_code)]
pub fn warn(msg: &str) {
    write("WARN", msg);
}

#[allow(dead_code)]
pub fn info(msg: &str) {
    write("INFO", msg);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn log_writes_to_file_with_level() {
        let tmp = env::temp_dir().join(format!("cssh-log-test-{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        *LOG_FILE.lock().unwrap() = Some(tmp.join("app.log"));

        error("test-error-line");
        warn("test-warn-line");

        let content = fs::read_to_string(tmp.join("app.log")).unwrap();
        assert!(content.contains("test-error-line"), "错误行未写入: {content}");
        assert!(content.contains("test-warn-line"), "警告行未写入: {content}");
        assert!(content.contains("[ERROR]"));
        assert!(content.contains("[WARN]"));

        fs::remove_dir_all(&tmp).ok();
    }
}
