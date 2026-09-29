import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthScreen, type AuthView } from "./auth/AuthScreen";
import { LoginSkeleton } from "./components/LoadingSkeletons";
import { Workspace } from "./Workspace";
import { sb } from "./lib/supabase";

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
  if (!ready) return <LoginSkeleton />;
  if (!session || authView === "reset")
    return (
      <AuthScreen view={authView} onView={setAuthView} onSession={setSession} />
    );
  return <Workspace key={session.user.id} session={session} />;
}
