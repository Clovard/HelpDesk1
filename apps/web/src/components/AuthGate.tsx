import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { authApi, clearAuthSession, getAuthToken } from "../api";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!getAuthToken());
  const [authenticated, setAuthenticated] = useState(Boolean(getAuthToken()));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!getAuthToken()) return;
    void authApi.me().then(() => { setAuthenticated(true); setReady(true); }).catch(() => { clearAuthSession(); setAuthenticated(false); setReady(true); });
  }, []);
  useEffect(() => {
    const expire = () => { setAuthenticated(false); setReady(true); };
    window.addEventListener("helpdesk-auth-expired", expire);
    return () => window.removeEventListener("helpdesk-auth-expired", expire);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try { await authApi.login(String(form.get("username") || ""), String(form.get("password") || "")); setAuthenticated(true); setReady(true); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Не удалось войти."); }
    finally { setBusy(false); }
  }

  if (!ready) return <main className="auth-screen"><div className="auth-card">Проверяем вход…</div></main>;
  if (authenticated && getAuthToken()) return <>{children}</>;
  return <main className="auth-screen"><form className="auth-card" onSubmit={submit}>
    <p className="eyebrow">УГЛИ IT · ЦЕНТР ПОДДЕРЖКИ</p>
    <h1>Вход в HelpDesk</h1>
    <p className="auth-intro">Введите логин и пароль сотрудника.</p>
    <label className="form-field full"><span>Логин</span><input name="username" autoComplete="username" autoFocus required /></label>
    <label className="form-field full"><span>Пароль</span><input name="password" type="password" autoComplete="current-password" required /></label>
    {error && <p className="auth-error">{error}</p>}
    <button className="button primary auth-submit" disabled={busy}>{busy ? "Входим…" : "Войти"}</button>
  </form></main>;
}
