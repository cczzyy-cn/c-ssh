import { useState } from "react";
import { api } from "../ipc";
import { useConnections } from "../stores/connections";
import { BUILTIN_THEMES } from "../themes";
import { emptyConnection, type AuthType, type ConnectionConfig } from "../types";

interface Props {
  conn?: ConnectionConfig;
  onClose: () => void;
}

export default function ConnectionForm({ conn, onClose }: Props) {
  const isEdit = !!conn;
  const [form, setForm] = useState<ConnectionConfig>(conn ?? emptyConnection());
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const upsert = useConnections((s) => s.upsert);

  const set = <K extends keyof ConnectionConfig>(key: K, value: ConnectionConfig[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setAuth = (patch: Partial<ConnectionConfig["auth"]>) =>
    setForm((f) => ({ ...f, auth: { ...f.auth, ...patch } }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.host.trim()) {
      alert("名称和主机必填");
      return;
    }
    if (form.auth.type === "key" && !form.auth.keyPath?.trim()) {
      alert("请填写私钥路径");
      return;
    }
    setSaving(true);
    try {
      // 密码/口令：新建时填了才存；编辑时留空 = 保持不变（传 null 表示不变）
      const secretToStore = isEdit ? (secret ? secret : null) : secret;
      const saved = await upsert(form, secretToStore);
      if (isEdit) {
        await api.testConnection(saved.id).catch(() => undefined); // 尽力测试，失败不阻塞
      }
      onClose();
    } catch (e) {
      alert(`保存失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const authType = form.auth.type;

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>{isEdit ? "编辑连接" : "新建连接"}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="form-grid">
          <label>
            名称 *
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="例如：生产服务器" />
          </label>
          <label>
            分组
            <input value={form.group} onChange={(e) => set("group", e.target.value)} placeholder="例如：生产环境" />
          </label>
          <label>
            主机 * <span className="hint">IP 或域名</span>
            <input value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="192.168.1.10" />
          </label>
          <label>
            端口
            <input
              type="number"
              value={form.port}
              onChange={(e) => set("port", Number(e.target.value) || 22)}
            />
          </label>
          <label>
            用户名
            <input value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="root" />
          </label>
          <label>
            认证方式
            <select value={authType} onChange={(e) => setAuth({ type: e.target.value as AuthType })}>
              <option value="password">密码</option>
              <option value="key">私钥</option>
              <option value="agent">SSH Agent</option>
            </select>
          </label>

          {authType === "password" && (
            <label className="span-2">
              {isEdit ? "密码（留空表示不修改）" : "密码 *"}
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={isEdit ? "••••••（保持不变）" : "连接密码"}
                autoComplete="off"
              />
            </label>
          )}

          {authType === "key" && (
            <>
              <label className="span-2">
                私钥路径
                <input
                  value={form.auth.keyPath ?? ""}
                  onChange={(e) => setAuth({ keyPath: e.target.value })}
                  placeholder="~/.ssh/id_ed25519"
                />
              </label>
              <label className="span-2">
                密钥口令（留空表示无口令）
                <input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </>
          )}

          {authType === "agent" && (
            <label className="span-2">
              <input
                type="checkbox"
                checked={form.auth.useAgent ?? true}
                onChange={(e) => setAuth({ useAgent: e.target.checked })}
              />
              使用系统 SSH Agent
            </label>
          )}

          <label className="span-2">
            主题（默认跟随全局）
            <select
              value={form.theme ?? ""}
              onChange={(e) => set("theme", e.target.value || undefined)}
            >
              <option value="">跟随全局设置</option>
              {BUILTIN_THEMES.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </label>

          <label className="span-2">
            高级：Keep-Alive 间隔（秒）
            <input
              type="number"
              value={form.options.keepAliveInterval}
              onChange={(e) =>
                set("options", { ...form.options, keepAliveInterval: Number(e.target.value) || 30 })
              }
            />
          </label>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={saving}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
