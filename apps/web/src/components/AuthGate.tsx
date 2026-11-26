import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { authApi, type StaffUser } from "../api";

type LoginUser = { username: string; display_name: string };

export default function AuthGate({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [users, setUsers] = useState<LoginUser[]>([]);
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("andrey");
  const [password, setPassword] = useState("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [passwords, setPasswords] = useState({ andrey: "", artem: "", pentagon: "" });
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState("andrey");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    let active = true;
    const logout = async () => {
      await authApi.logout();
      if (active) setUser(null);
    };
    const expired = () => {
      authApi.clearSession();
      if (active) setUser(null);
    };
    const openPassword = () => {
      setPasswordTarget(authApi.currentUser()?.username || "andrey");
      setPasswordError("");
      setPasswordDialog(true);
    };
    window.addEventListener("helpdesk:logout-requested", logout);
    window.addEventListener("helpdesk:session-expired", expired);
    window.addEventListener("helpdesk:open-password", openPassword);
    void (async () => {
      try {
        const status = await authApi.status();
        if (!active) return;
        setInitialized(status.initialized);
        setUsers(status.users);
        if (status.initialized && sessionStorage.getItem("ugli-helpdesk-session")) {
          try {
            const current = await authApi.me();
            if (active) setUser(current.user);
          } catch {
            authApi.clearSession();
          }
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Не удалось подключиться к API.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      window.removeEventListener("helpdesk:logout-requested", logout);
      window.removeEventListener("helpdesk:session-expired", expired);
      window.removeEventListener("helpdesk:open-password", openPassword);
    };
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await authApi.login(username, password);
      authApi.saveSession(session.token, session.user);
      setUser(session.user);
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти.");
    } finally {
      setBusy(false);
    }
  }

  async function setup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await authApi.bootstrap(bootstrapSecret, passwords);
      setInitialized(true);
      const session = await authApi.login("andrey", passwords.andrey);
      authApi.saveSession(session.token, session.user);
      setUser(session.user);
      setBootstrapSecret("");
      setPasswords({ andrey: "", artem: "", pentagon: "" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось завершить настройку.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("Пароли не совпадают.");
      return;
    }
    setPasswordBusy(true);
    setPasswordError("");
    try {
      if (user?.access_role === "Admin") {
        await authApi.resetPassword(passwordTarget, newPassword);
        if (passwordTarget === user.username) {
          await authApi.logout();
          setUser(null);
        }
      } else {
        await authApi.changePassword(currentPassword, newPassword);
        authApi.clearSession();
        setUser(null);
      }
      setPasswordDialog(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (reason) {
      setPasswordError(reason instanceof Error ? reason.message : "Не удалось изменить пароль.");
    } finally {
      setPasswordBusy(false);
    }
  }

  if (loading || user) {
    return user ? <>{children}{passwordDialog && <div className="auth-dialog-backdrop"><section className="auth-card auth-dialog">
      <button className="auth-dialog-close" onClick={() => setPasswordDialog(false)}>×</button>
      <h2>Управление паролем</h2>
      <form onSubmit={updatePassword} className="auth-form">
        {user.access_role === "Admin" && <label>Учётная запись<select value={passwordTarget} onChange={(event) => setPasswordTarget(event.target.value)}>{users.map((item) => <option key={item.username} value={item.username}>{item.display_name}</option>)}</select></label>}
        {user.access_role !== "Admin" && <label>Текущий пароль<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>}
        <label>Новый пароль<input type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required /></label>
        <label>Повторите новый пароль<input type="password" minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label>
        {passwordError && <div role="alert" className="auth-error">{passwordError}</div>}
        <button className="button primary" disabled={passwordBusy}>{passwordBusy ? "Сохраняем…" : "Сохранить пароль"}</button>
      </form>
    </section></div>}</> : <div className="auth-loading">Подключаем HelpDesk…</div>;
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <span className="eyebrow">Угли IT · Центр поддержки</span>
        <h1>{initialized ? "Вход в HelpDesk" : "Первичная настройка доступа"}</h1>
        <p>{initialized ? "Выберите свою учетную запись и введите пароль." : "Задайте пароли для трёх технических специалистов. Это выполняется один раз после применения миграции."}</p>
        {!initialized && initialized !== null ? (
          <form onSubmit={setup} className="auth-form">
            <label>Ключ первичной настройки<input type="password" value={bootstrapSecret} onChange={(event) => setBootstrapSecret(event.target.value)} autoComplete="off" required /></label>
            <label>Андрей · администратор<input type="password" minLength={12} value={passwords.andrey} onChange={(event) => setPasswords({ ...passwords, andrey: event.target.value })} autoComplete="new-password" required /></label>
            <label>Артём · технический специалист L2<input type="password" minLength={12} value={passwords.artem} onChange={(event) => setPasswords({ ...passwords, artem: event.target.value })} autoComplete="new-password" required /></label>
            <label>Пентагон · технический специалист L3<input type="password" minLength={12} value={passwords.pentagon} onChange={(event) => setPasswords({ ...passwords, pentagon: event.target.value })} autoComplete="new-password" required /></label>
            {error && <div role="alert" className="auth-error">{error}</div>}
            <button className="button primary" disabled={busy}>{busy ? "Настраиваем…" : "Создать учётные записи"}</button>
          </form>
        ) : initialized ? (
          <form onSubmit={signIn} className="auth-form">
            <label>Пользователь<select value={username} onChange={(event) => setUsername(event.target.value)}>{users.map((item) => <option key={item.username} value={item.username}>{item.display_name}</option>)}</select></label>
            <label>Пароль<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
            {error && <div role="alert" className="auth-error">{error}</div>}
            <button className="button primary" disabled={busy}>{busy ? "Входим…" : "Войти"}</button>
          </form>
        ) : (
          <div role="alert" className="auth-error">{error || "Проверяем подключение к API…"}</div>
        )}
      </section>
    </main>
  );
}
