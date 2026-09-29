import { useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { sb } from "../lib/supabase";

import { Skeleton } from "../components/LoadingSkeletons";

export type AuthView = "login" | "signup" | "forgot" | "reset";
export function AuthScreen({
  view,
  onView,
  onSession,
}: {
  view: AuthView;
  onView: (view: AuthView) => void;
  onSession: (session: Session | null) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if ((view === "signup" || view === "reset") && password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    try {
      if (view === "signup") {
        const { data: alreadyRegistered, error: checkError } = await sb.rpc(
          "email_is_registered",
          { p_email: email.trim() },
        );
        if (checkError) throw checkError;
        if (alreadyRegistered) {
          throw Error(
            "Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.",
          );
        }
        const { data, error: authError } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (authError) throw authError;
        if (!data.user?.identities?.length) {
          throw Error(
            "Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.",
          );
        }
        if (data.session) onSession(data.session);
        else setMessage("Revisa tu correo para confirmar la cuenta y entrar.");
      } else if (view === "forgot") {
        const { error: authError } = await sb.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: window.location.origin,
          },
        );
        if (authError) throw authError;
        setMessage("Te enviamos un enlace para restablecer tu contraseña.");
      } else if (view === "reset") {
        const { error: authError } = await sb.auth.updateUser({ password });
        if (authError) throw authError;
        await sb.auth.signOut();
        onView("login");
        setMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
      } else {
        const { data, error: authError } = await sb.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
        onSession(data.session);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const title =
    view === "signup"
      ? "Crear cuenta"
      : view === "forgot"
        ? "Recuperar contraseña"
        : view === "reset"
          ? "Nueva contraseña"
          : "Timesheets";
  return (
    <main className="login">
      <form className="card auth-card" onSubmit={submit}>
        <img
          className="cn-login-logo"
          src="/Logo_CN_2025_Negro.webp"
          alt="Central MX"
        />
        <div className="brand">Plataforma RH</div>
        {view !== "login" && <h1>{title}</h1>}
        {view !== "login" && (
          <p>
            {view === "signup"
              ? "Crea tu acceso para capturar actividades."
              : view === "forgot"
                ? "Te enviaremos un enlace por correo."
                : "Elige una contraseña nueva para tu cuenta."}
          </p>
        )}
        {view === "signup" && (
          <label>
            Nombre completo
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        {view !== "reset" && (
          <label>
            Correo
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {view !== "forgot" && (
          <label>
            Contraseña
            <input
              required
              minLength={6}
              autoComplete={
                view === "signup" ? "new-password" : "current-password"
              }
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {(view === "signup" || view === "reset") && (
          <label>
            Confirmar contraseña
            <input
              required
              minLength={6}
              autoComplete="new-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="success">
            {message}
          </p>
        )}
        <button disabled={saving}>
          {saving ? (
            <Skeleton className="button-skeleton" />
          ) : view === "login" ? (
            "Entrar"
          ) : view === "signup" ? (
            "Crear cuenta"
          ) : view === "forgot" ? (
            "Enviar enlace"
          ) : (
            "Actualizar contraseña"
          )}
        </button>
        <div className="auth-links">
          {view === "login" && (
            <>
              <button type="button" onClick={() => onView("signup")}>
                Crear cuenta
              </button>
              <button type="button" onClick={() => onView("forgot")}>
                Olvidé mi contraseña
              </button>
            </>
          )}
          {view !== "login" && view !== "reset" && (
            <button type="button" onClick={() => onView("login")}>
              Volver a iniciar sesión
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
