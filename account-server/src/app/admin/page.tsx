"use client";

import { FormEvent, useEffect, useState } from "react";

type UserRow = {
  id: string;
  name: string;
  display_name: string;
  status: number;
  is_admin: boolean;
  device_count: number;
};

async function responseJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentUserName, setCurrentUserName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => setToken(localStorage.getItem("rustdesk_admin_token") ?? ""), []);

  async function loadUsers(accessToken = token) {
    if (!accessToken) return;
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [data, currentUser] = await Promise.all([
        responseJson(await fetch("/api/admin/users", { headers })),
        responseJson(await fetch("/api/currentUser", { method: "POST", headers })),
      ]);
      setUsers(data.data);
      setCurrentUserName(currentUser.name);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载失败");
    }
  }

  useEffect(() => { void loadUsers(); }, [token]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await responseJson(await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password"), type: "account" }),
      }));
      if (!data.user?.is_admin) {
        await fetch("/api/logout", { method: "POST", headers: { Authorization: `Bearer ${data.access_token}` } });
        throw new Error("该账号不是管理员");
      }
      localStorage.setItem("rustdesk_admin_token", data.access_token);
      setToken(data.access_token);
      setMessage("登录成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setLoading(true);
    setMessage("");
    const form = new FormData(formElement);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!token && bootstrapToken) headers["X-Admin-Token"] = bootstrapToken;
    try {
      await responseJson(await fetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify({
          username: form.get("newUsername"),
          password: form.get("newPassword"),
          display_name: form.get("displayName"),
          email: form.get("email"),
          is_admin: form.get("isAdmin") === "on",
        }),
      }));
      formElement.reset();
      setMessage(token ? "账号创建成功" : "首个管理员已创建，请登录");
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }

  async function updateUser(id: string, body: Record<string, unknown>, success: string) {
    setLoading(true);
    setMessage("");
    try {
      await responseJson(await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }));
      setMessage(success);
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed");
    } finally {
      setLoading(false);
    }
  }

  function resetPassword(user: UserRow) {
    const password = window.prompt(`为 @${user.name} 设置新密码（至少 10 位）`);
    if (password) void updateUser(user.id, { password }, "密码已重置，旧会话已撤销");
  }

  async function logout() {
    try {
      await fetch("/api/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch {}
    localStorage.removeItem("rustdesk_admin_token");
    setToken("");
    setUsers([]);
    setCurrentUserName("");
  }

  if (!token) {
    return (
      <main className="auth-shell">
        <section className="auth-intro">
          <div className="brand"><span className="brand-mark">R</span><span>RustDesk</span></div>
          <div className="intro-copy">
            <span className="eyebrow">SELF-HOSTED CONSOLE</span>
            <h1>简单、安全地管理<br />你的远程设备</h1>
            <p>统一管理团队账号、登录权限与设备绑定，所有数据都保留在你的服务器中。</p>
          </div>
          <div className="security-note"><span className="pulse-dot" />服务已通过 HTTPS 安全连接</div>
        </section>

        <section className="auth-panel">
          <div className="auth-card">
            <div className="mobile-brand"><span className="brand-mark">R</span><span>RustDesk</span></div>
            <span className="section-kicker">管理控制台</span>
            <h2>欢迎回来</h2>
            <p className="section-description">使用管理员账号登录以继续</p>
            <form className="form auth-form" onSubmit={login}>
              <label>用户名<input name="username" autoComplete="username" placeholder="请输入管理员用户名" required /></label>
              <label>密码<input name="password" type="password" autoComplete="current-password" placeholder="请输入密码" required /></label>
              <button className="primary wide" disabled={loading}>{loading ? "正在登录…" : "登录控制台"}</button>
            </form>

            <details className="bootstrap">
              <summary>首次部署？创建初始管理员</summary>
              <form className="form bootstrap-form" onSubmit={createUser}>
                <p>使用服务器环境文件中的一次性令牌完成初始化。</p>
                <label>初始化令牌<input type="password" autoComplete="off" placeholder="ACCOUNT_BOOTSTRAP_TOKEN" value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value)} /></label>
                <div className="field-row">
                  <label>管理员用户名<input name="newUsername" minLength={3} autoComplete="off" placeholder="至少 3 位" required /></label>
                  <label>显示名称<input name="displayName" autoComplete="off" placeholder="选填" /></label>
                </div>
                <label>管理员密码<input name="newPassword" type="password" minLength={10} autoComplete="new-password" placeholder="至少 10 位" required /></label>
                <label>邮箱<input name="email" type="email" autoComplete="email" placeholder="选填" /></label>
                <input name="isAdmin" type="hidden" value="on" />
                <button className="primary wide" disabled={loading || !bootstrapToken}>创建管理员</button>
              </form>
            </details>
            {message && <div className="notice" role="alert">{message}</div>}
          </div>
        </section>
      </main>
    );
  }

  const activeUsers = users.filter((user) => user.status === 1).length;
  const deviceCount = users.reduce((total, user) => total + user.device_count, 0);

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">R</span><span>RustDesk</span></div>
        <nav className="nav-list" aria-label="控制台导航">
          <div className="nav-item active"><span className="nav-icon">◎</span>账号管理</div>
          <div className="nav-item disabled"><span className="nav-icon">◇</span>设备管理<span className="soon">即将推出</span></div>
          <div className="nav-item disabled"><span className="nav-icon">⌁</span>审计日志<span className="soon">即将推出</span></div>
        </nav>
        <div className="server-card">
          <div><span className="pulse-dot" />服务器运行正常</div>
          <span>Self-hosted · HTTPS</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div><span className="page-kicker">控制台</span><h1>账号管理</h1></div>
          <div className="account-menu">
            <span className="avatar">{currentUserName.slice(0, 1).toUpperCase() || "A"}</span>
            <div><strong>{currentUserName || "管理员"}</strong><span>管理员</span></div>
            <button className="text-button" onClick={() => void logout()}>退出</button>
          </div>
        </header>

        <div className="content">
          {message && <div className="notice dashboard-notice" role="alert"><span>✓</span>{message}</div>}

          <section className="stats" aria-label="账号统计">
            <article className="stat-card"><span className="stat-icon blue">人</span><div><span>账号总数</span><strong>{users.length}</strong></div></article>
            <article className="stat-card"><span className="stat-icon green">✓</span><div><span>正常账号</span><strong>{activeUsers}</strong></div></article>
            <article className="stat-card"><span className="stat-icon violet">端</span><div><span>已绑定设备</span><strong>{deviceCount}</strong></div></article>
          </section>

          <div className="dashboard-grid">
            <section className="panel users-panel">
              <div className="panel-header">
                <div><h2>团队账号</h2><p>管理账号状态、角色和登录密码</p></div>
                <button className="icon-button" aria-label="刷新账号列表" title="刷新" disabled={loading} onClick={() => void loadUsers()}>↻</button>
              </div>
              {users.length === 0 ? (
                <div className="empty-state"><span>人</span><h3>还没有账号</h3><p>从右侧表单创建第一个团队账号。</p></div>
              ) : (
                <div className="table-wrap">
                  <table className="users">
                    <thead><tr><th>账号</th><th>角色</th><th>状态</th><th>设备</th><th><span className="sr-only">操作</span></th></tr></thead>
                    <tbody>{users.map((user) => (
                      <tr key={user.id}>
                        <td><div className="user-cell"><span className="user-avatar">{(user.display_name || user.name).slice(0, 1).toUpperCase()}</span><div><strong>{user.display_name || user.name}</strong><span>@{user.name}</span></div></div></td>
                        <td><span className={`role-badge ${user.is_admin ? "admin" : "member"}`}>{user.is_admin ? "管理员" : "成员"}</span></td>
                        <td><span className={`status ${user.status === 1 ? "online" : "suspended"}`}><i />{user.status === 1 ? "正常" : "已停用"}</span></td>
                        <td><span className="device-count">{user.device_count}</span></td>
                        <td><div className="actions">
                          <button
                            className={user.status === 1 ? "action-button danger" : "action-button success"}
                            disabled={loading || user.name === currentUserName}
                            title={user.name === currentUserName ? "不能停用当前登录账号" : undefined}
                            onClick={() => void updateUser(
                              user.id,
                              { status: user.status === 1 ? 0 : 1 },
                              user.status === 1 ? "账号已停用" : "账号已启用",
                            )}
                          >{user.status === 1 ? "停用" : "启用"}</button>
                          <button className="action-button" disabled={loading} onClick={() => resetPassword(user)}>重置密码</button>
                        </div></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel create-panel">
              <div className="panel-header"><div><h2>创建新账号</h2><p>邀请成员使用你的专属服务</p></div></div>
              <form className="form" onSubmit={createUser}>
                <label>用户名<input name="newUsername" minLength={3} autoComplete="off" placeholder="例如 zhangsan" required /></label>
                <label>初始密码<input name="newPassword" type="password" minLength={10} autoComplete="new-password" placeholder="至少 10 位" required /></label>
                <label>显示名称<input name="displayName" autoComplete="off" placeholder="选填" /></label>
                <label>邮箱<input name="email" type="email" autoComplete="off" placeholder="name@example.com（选填）" /></label>
                <label className="switch-row">
                  <span><strong>管理员权限</strong><small>可管理所有账号和设备</small></span>
                  <input name="isAdmin" type="checkbox" />
                </label>
                <button className="primary wide" disabled={loading}>{loading ? "处理中…" : "创建账号"}</button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
