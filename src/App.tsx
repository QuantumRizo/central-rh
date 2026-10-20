import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthScreen, type AuthView } from "./auth/AuthScreen";
import { LoginSkeleton } from "./components/LoadingSkeletons";
import { Workspace } from "./Workspace";
import { sb } from "./lib/supabase";
import { returnToTool, ssoTarget } from "./sso";

export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [authView, setAuthView] = useState<AuthView>("login");
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setAuthView("reset");
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  // /sso: en cuanto haya sesión, regresa a la herramienta que la pidió con un pase fresco.
  const [sso] = useState(ssoTarget);
  useEffect(() => {
    if (!sso || !session || authView === "reset") return;
    (async () => {
      let { data } = await sb.auth.getSession();
      // Pase con al menos 10 minutos de vida; si no, se renueva antes de entregarlo.
      if (data.session && (data.session.expires_at ?? 0) * 1000 - Date.now() < 10 * 60e3) ({ data } = await sb.auth.refreshSession());
      if (data.session) returnToTool(sso, data.session.access_token);
    })();
  }, [sso, session, authView]);
  if (!ready) return <LoginSkeleton />;
  if (!session || authView === "reset")
    return (
      <AuthScreen view={authView} onView={setAuthView} onSession={setSession} />
    );
  if (sso) return <LoginSkeleton />;
  return <Workspace key={session.user.id} session={session} />;
}
