import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { type Session } from "@supabase/supabase-js";
import { PendingDays, ReportDetails } from './ReportDetails';
import { EvaluacionesModule } from './evaluaciones/EvaluacionesModule';
import { sb } from './lib/supabase';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ClipboardCheck,
  ChevronDown,
  Clock3,
  Download,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
type Option = { id: string; name: string };
type Entry = { client_id: string; activity_id: string; percentage: number };
const sheetSnapshot = (value: {
  attendance: string;
  mode: string;
  entry: string;
  exit: string;
  permissionEntry: string;
  permissionExit: string;
  rows: Entry[];
}) => JSON.stringify({
  attendance: value.attendance,
  mode: value.mode,
  entry: value.entry,
  exit: value.exit,
  permissionEntry: value.permissionEntry,
  permissionExit: value.permissionExit,
  rows: value.rows.map((row) => ({
    client_id: row.client_id,
    activity_id: row.activity_id,
    percentage: Number(row.percentage) || 0,
  })),
});
const HIDDEN_CLIENTS = new Set(["Tiempo interno", "Cliente de prueba"]);
const day = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}
function LoginSkeleton() {
  return (
    <main className="login">
      <div className="card loading-card" aria-label="Cargando aplicación">
        <Skeleton className="skeleton-logo" />
        <Skeleton className="skeleton-title" />
        <Skeleton className="skeleton-subtitle" />
        <Skeleton className="skeleton-field" />
        <Skeleton className="skeleton-field" />
        <Skeleton className="skeleton-button" />
      </div>
    </main>
  );
}
function SheetSkeleton() {
  return (
    <div className="sheet-skeleton" aria-label="Cargando captura diaria">
      <Skeleton className="skeleton-section-title" />
      <div className="skeleton-grid">
        <Skeleton className="skeleton-field" />
        <Skeleton className="skeleton-field" />
        <Skeleton className="skeleton-field" />
      </div>
      <Skeleton className="skeleton-divider" />
      <Skeleton className="skeleton-section-title short" />
      <Skeleton className="skeleton-row" />
      <Skeleton className="skeleton-button small" />
    </div>
  );
}
function AdminSkeleton() {
  return (
    <div className="admin-skeleton" aria-label="Cargando panel">
      <div className="skeleton-metrics">
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="skeleton-metric" />
        ))}
      </div>
      <div className="skeleton-admin-grid">
        <Skeleton className="skeleton-admin-card" />
        <Skeleton className="skeleton-admin-card" />
      </div>
      <Skeleton className="skeleton-table" />
    </div>
  );
}
type AuthView = "login" | "signup" | "forgot" | "reset";
function AuthScreen({
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
function ChangePassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    setSaving(true);
    const { error: authError } = await sb.auth.updateUser({ password });
    setSaving(false);
    if (authError) setError(authError.message);
    else {
      setPassword("");
      setConfirm("");
      setMessage("Contraseña actualizada.");
    }
  };
  return (
    <form className="account-panel" onSubmit={submit}>
      <strong>Cambiar contraseña</strong>
      <input
        aria-label="Nueva contraseña"
        required
        minLength={6}
        type="password"
        placeholder="Nueva contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        aria-label="Confirmar contraseña"
        required
        minLength={6}
        type="password"
        placeholder="Confirmar contraseña"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
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
      <div>
        <button disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
        <button type="button" className="secondary" onClick={onDone}>
          Cerrar
        </button>
      </div>
    </form>
  );
}
function Picker({
  options,
  value,
  onChange,
  label,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const selected = options.find((o) => o.id === value);
  const filtered = options.filter((o) =>
    o.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div
      className="picker"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          root.current?.querySelector("button")?.focus();
        }
      }}
    >
      <button
        type="button"
        className="picker-trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setQuery("");
        }}
      >
        <span>
          {selected?.name.split(" (")[0] ||
            `Seleccionar ${label.toLowerCase()}`}
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="picker-menu">
          <input
            autoFocus
            aria-label={`Buscar ${label.toLowerCase()}`}
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="picker-options">
            {filtered.map((o) => (
              <button
                type="button"
                key={o.id}
                className={o.id === value ? "selected" : ""}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                  root.current?.querySelector("button")?.focus();
                }}
              >
                <span>
                  <strong>{o.name.split(" (")[0]}</strong>
                  {o.name.includes(" (") && (
                    <small>
                      {o.name
                        .slice(o.name.indexOf(" (") + 2)
                        .replace(/\)$/, "")}
                    </small>
                  )}
                </span>
                {o.id === value && <Check size={16} />}
              </button>
            ))}
            {!filtered.length && <p>Sin resultados</p>}
          </div>
        </div>
      )}
    </div>
  );
}
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
function Workspace({ session }: { session: Session }) {
  const [baseline, setBaseline] = useState<string | null>(null);
  const [employee, setEmployee] = useState<string>(""),
    [admin, setAdmin] = useState(false),
    [clients, setClients] = useState<Option[]>([]),
    [activities, setActivities] = useState<Option[]>([]),
    [date, setDate] = useState(day()),
    [attendance, setAttendance] = useState("worked"),
    [mode, setMode] = useState("office"),
    [entry, setEntry] = useState("09:00"),
    [exit, setExit] = useState("18:00"),
    [permissionEntry, setPermissionEntry] = useState("09:00"),
    [permissionExit, setPermissionExit] = useState("18:00"),
    [rows, setRows] = useState<Entry[]>([]),
    [busy, setBusy] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reports, setReports] = useState(false),
    [activeModule, setActiveModule] = useState<"timesheets" | "evaluaciones">("timesheets"),
    [accountOpen, setAccountOpen] = useState(false);
  const draft = sheetSnapshot({attendance,mode,entry,exit,permissionEntry,permissionExit,rows});
  const dirty = baseline !== null && draft !== baseline;
  const canLeave = () => !dirty || window.confirm('Tienes cambios sin guardar. ¿Quieres continuar sin guardarlos?');
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    (async () => {
      try {
        const results = await Promise.all([
          sb.rpc("my_employee_id"),
          sb
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .maybeSingle(),
          sb.from("clients").select("id,name").eq("active", true).order("name"),
          sb
            .from("activities")
            .select("id,name")
            .eq("active", true)
            .order("name"),
        ]);
        for (const r of results) if (r.error) throw r.error;
        setEmployee(results[0].data || "");
        setAdmin(results[1].data?.role === "admin");
        setClients(
          (results[2].data || []).filter(
            (client) => !HIDDEN_CLIENTS.has(client.name),
          ),
        );
        setActivities(results[3].data || []);
        if (!results[0].data)
          throw Error("Tu cuenta no tiene un colaborador vinculado");
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
      }
    })();
  }, [session.user.id]);
  useEffect(() => {
    if (!employee) return;
    let live = true;
    setBusy(true);
    setBaseline(null);
    setError("");
    setMessage("");
    (async () => {
      try {
        const { data, error } = await sb
          .from("timesheets")
          .select("*,timesheet_entries(client_id,activity_id,percentage)")
          .eq("employee_id", employee)
          .eq("work_date", date)
          .maybeSingle();
        if (error) throw error;
        if (!live) return;
        setAttendance(data?.attendance || "worked");
        setMode(data?.mode || "office");
        setEntry(data?.entry_time?.slice(0, 5) || "09:00");
        setExit(data?.exit_time?.slice(0, 5) || "18:00");
        setPermissionEntry(data?.permission_entry_time?.slice(0, 5) || "09:00");
        setPermissionExit(data?.permission_exit_time?.slice(0, 5) || "18:00");
        setRows(data?.timesheet_entries || []);
        setBaseline(sheetSnapshot({
          attendance: data?.attendance || 'worked',
          mode: data?.mode || 'office',
          entry: data?.entry_time?.slice(0,5) || '09:00',
          exit: data?.exit_time?.slice(0,5) || '18:00',
          permissionEntry: data?.permission_entry_time?.slice(0,5) || '09:00',
          permissionExit: data?.permission_exit_time?.slice(0,5) || '18:00',
          rows: data?.timesheet_entries || [],
        }));
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [employee, date]);
  const total =
    rows.reduce((s, r) => s + Math.round(r.percentage * 100), 0) / 100;
  const scheduleReady =
    mode !== "schedule_permission" ||
    (permissionEntry && permissionExit && permissionExit > permissionEntry);
  const save = async () => {
    if (baseline === null || busy || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { error } = await sb.rpc("save_timesheet", {
        payload: {
          employee_id: employee,
          work_date: date,
          attendance,
          mode,
          entry_time: entry,
          exit_time: exit,
          permission_entry_time:
            mode === "schedule_permission" ? permissionEntry : "",
          permission_exit_time:
            mode === "schedule_permission" ? permissionExit : "",
          entries: attendance === "worked" ? rows : [],
        },
      });
      if (error) throw error;
      if (attendance !== "worked") setRows([]);
      setBaseline(sheetSnapshot({attendance,mode,entry,exit,permissionEntry,permissionExit,rows:attendance === 'worked' ? rows : []}));
      setMessage("Día guardado correctamente");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const update = (i: number, patch: Partial<Entry>) =>
    setRows((prev) => prev.map((r, j) => (i === j ? { ...r, ...patch } : r)));
  return (
    <main className="app">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <img className="cn-header-logo" src="/Logo_CN_2025_Negro.webp" alt="Central MX" />
          <div><strong>Plataforma RH</strong><span>Gestión de personas</span></div>
        </div>
        <p className="sidebar-section-label">Módulos</p>
        <nav className="module-nav" aria-label="Módulos">
          <button
            className={activeModule === "timesheets" ? "active" : ""}
            onClick={() => { if (canLeave()) { setActiveModule("timesheets"); setReports(false); } }}
          >
            <Clock3 size={18} /> <span>Timesheets</span>
          </button>
          <button
            className={activeModule === "evaluaciones" ? "active" : ""}
            onClick={() => { if (canLeave()) { setActiveModule("evaluaciones"); setReports(false); } }}
          >
            <ClipboardCheck size={18} /> <span>Evaluaciones</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user"><div>{admin && <span className="admin-badge">Admin</span>}</div><strong>{session.user.email}</strong></div>
          <div className="sidebar-user-actions">
            <button title="Cuenta" className="sidebar-account" onClick={() => setAccountOpen((open) => !open)}>Cuenta</button>
            <button title="Salir" className="sidebar-logout" onClick={() => { if (canLeave()) sb.auth.signOut(); }}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      {accountOpen && <ChangePassword onDone={() => setAccountOpen(false)} />}
      <section className={`content ${reports ? "admin-content" : activeModule === "evaluaciones" ? "evaluation-content" : ""}`}>
        {activeModule === "evaluaciones" ? (
          <EvaluacionesModule employeeId={employee} isAdmin={admin} />
        ) : reports ? (
          <AdminDashboard onBack={() => setReports(false)} />
        ) : (
          <>
            <div className="title">
              <div>
                <p className="eyebrow">MI HOJA DE TIEMPO</p>
                <h1>Captura diaria</h1>
              </div>
              {admin && (
                <button className="secondary" onClick={() => { if (canLeave()) setReports(true); }}>
                  <LayoutDashboard size={18} /> Panel admin
                </button>
              )}
            </div>
            <div className="panel">
              <label>
                Fecha
                <input
                  type="date"
                  value={date}
                  disabled={saving}
                  onChange={(e) => {
                    if (e.target.value && canLeave()) setDate(e.target.value);
                  }}
                />
              </label>
              {busy ? (
                <SheetSkeleton />
              ) : (
                <>
                  <fieldset disabled={saving}>
                    <legend>¿Trabajaste?</legend>
                    <label className="radio">
                      <input
                        type="radio"
                        checked={attendance === "worked"}
                        onChange={() => setAttendance("worked")}
                      />
                      Sí
                    </label>
                    <label className="radio">
                      <input
                        type="radio"
                        checked={attendance !== "worked"}
                        onChange={() => setAttendance("vacation")}
                      />
                      No
                    </label>
                    {attendance !== "worked" && (
                      <select
                        aria-label="Motivo"
                        value={attendance}
                        onChange={(e) => setAttendance(e.target.value)}
                      >
                        <option value="vacation">Vacaciones</option>
                        <option value="absence">Falta</option>
                      </select>
                    )}
                  </fieldset>
                  {attendance === "worked" ? (
                    <>
                      <label>
                        Modalidad
                        <select
                          value={mode}
                          onChange={(e) => setMode(e.target.value)}
                        >
                          <option value="office">Presencial</option>
                          <option value="home_office">Home Office</option>
                          <option value="schedule_permission">
                            Permiso de horario
                          </option>
                        </select>
                      </label>
                      {mode === "schedule_permission" && (
                        <div className="schedule-block permission-block">
                          <h3>Horario del permiso</h3>
                          <div className="schedule-grid">
                            <label>
                              Desde
                              <input
                                aria-label="Inicio del permiso"
                                type="time"
                                value={permissionEntry}
                                onChange={(e) =>
                                  setPermissionEntry(e.target.value)
                                }
                              />
                            </label>
                            <label>
                              Hasta
                              <input
                                aria-label="Fin del permiso"
                                type="time"
                                value={permissionExit}
                                onChange={(e) =>
                                  setPermissionExit(e.target.value)
                                }
                              />
                            </label>
                          </div>
                        </div>
                      )}
                      <div className="schedule-block">
                        <h3>
                          {mode === "schedule_permission"
                            ? "Horario real trabajado"
                            : "Horario de trabajo"}
                        </h3>
                        <div className="schedule-grid">
                          <label>
                            Entrada
                            <input
                              aria-label="Entrada"
                              type="time"
                              value={entry}
                              onChange={(e) => setEntry(e.target.value)}
                            />
                          </label>
                          <label>
                            Salida
                            <input
                              aria-label="Salida"
                              type="time"
                              value={exit}
                              onChange={(e) => setExit(e.target.value)}
                            />
                          </label>
                        </div>
                      </div>
                      <div className="section-head">
                        <h2>Distribución del tiempo</h2>
                        <span className={total === 100 ? "ok" : "warn"}>
                          {total}% / 100%
                        </span>
                      </div>
                      {total > 100 && (
                        <p className="over-warning" role="alert">
                          Te estás pasando del 100% del tiempo. Reduce los
                          porcentajes antes de guardar.
                        </p>
                      )}
                      <div className="entries">
                        {rows.map((r, i) => (
                          <div className="entry" key={i}>
                            <Picker
                              label={`Cliente ${i + 1}`}
                              options={clients}
                              value={r.client_id}
                              onChange={(v) => update(i, { client_id: v })}
                            />
                            <Picker
                              label={`Actividad ${i + 1}`}
                              options={activities}
                              value={r.activity_id}
                              onChange={(v) => update(i, { activity_id: v })}
                            />
                            <input
                              aria-label={`Porcentaje ${i + 1}`}
                              type="number"
                              min="0.01"
                              max="100"
                              step="0.01"
                              value={r.percentage}
                              onChange={(e) =>
                                update(i, {
                                  percentage: Number(e.target.value),
                                })
                              }
                            />
                            <button
                              className="icon"
                              aria-label={`Eliminar fila ${i + 1}`}
                              onClick={() =>
                                setRows(rows.filter((_, j) => j !== i))
                              }
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        className="add"
                        onClick={() =>
                          setRows([
                            ...rows,
                            {
                              client_id: clients[0]?.id || "",
                              activity_id: activities[0]?.id || "",
                              percentage: 0,
                            },
                          ])
                        }
                      >
                        <Plus size={18} /> Agregar actividad
                      </button>
                    </>
                  ) : (
                    <p className="notice">
                      Las actividades se deshabilitan para vacaciones o falta.
                    </p>
                  )}
                </>
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
              <div className="actions">
                {dirty && <span className="report-note">Cambios sin guardar</span>}
                <button
                  disabled={
                    busy ||
                    saving ||
                    !employee ||
                    baseline === null ||
                    (attendance === "worked" &&
                      (total !== 100 ||
                        rows.some((r) => r.percentage <= 0) ||
                        !scheduleReady))
                  }
                  onClick={save}
                >
                  {saving ? "Guardando…" : "Guardar día"}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

type AdminTab = "summary" | "people" | "clients" | "absences";
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const workedHours = (start?: string, end?: string) => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number),
    [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
};
const csvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
};

function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [selection, setSelection] = useState<{type:'person'|'client';name:string}|null>(null);
  const [revision, setRevision] = useState(0);
  const [from, setFrom] = useState(monthStart()),
    [to, setTo] = useState(day()),
    [tab, setTab] = useState<AdminTab>("summary"),
    [query, setQuery] = useState(""),
    [employees, setEmployees] = useState<any[]>([]),
    [sheets, setSheets] = useState<any[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      setBusy(true);
      setError("");
      try {
        if (from > to)
          throw Error("La fecha inicial debe ser anterior a la fecha final.");
        const employeeRequest = sb
          .from("employees")
          .select("id,full_name,position,status,start_date")
          .eq("status", "Activo")
          .order("full_name");
        const all: any[] = [];
        for (let start = 0; ; start += 500) {
          const { data, error } = await sb
            .from("timesheets")
            .select(
              "id,employee_id,work_date,attendance,mode,entry_time,exit_time,position_snapshot,employee:employees(full_name,position),timesheet_entries(id,percentage,client:clients(id,name),activity:activities(id,name))",
            )
            .gte("work_date", from)
            .lte("work_date", to)
            .order("work_date", { ascending: false })
            .range(start, start + 499);
          if (error) throw error;
          all.push(...(data || []));
          if ((data?.length || 0) < 500) break;
        }
        const employeeResult = await employeeRequest;
        if (employeeResult.error) throw employeeResult.error;
        if (live) {
          setEmployees(employeeResult.data || []);
          setSheets(all);
        }
      } catch (e) {
        if (live) {
          setEmployees([]);
          setSheets([]);
          setError((e as Error).message);
        }
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [from, to, revision]);

  const worked = sheets.filter((s) => s.attendance === "worked"),
    vacations = sheets.filter((s) => s.attendance === "vacation"),
    absences = sheets.filter((s) => s.attendance === "absence");
  const peopleWithCapture = new Set(sheets.map((s) => s.employee_id));
  const coverage = employees.length
    ? Math.round((peopleWithCapture.size / employees.length) * 100)
    : 0;
  const hours = worked.reduce(
    (sum, s) => sum + workedHours(s.entry_time, s.exit_time),
    0,
  );
  const missing = employees.filter(
    (e) => !sheets.some((s) => s.employee_id === e.id && s.work_date === to),
  );
  const personRows = employees
    .map((e) => {
      const own = sheets.filter((s) => s.employee_id === e.id),
        ownWorked = own.filter((s) => s.attendance === "worked");
      return {
        name: e.full_name,
        position: e.position,
        captures: own.length,
        worked: ownWorked.length,
        vacation: own.filter((s) => s.attendance === "vacation").length,
        absence: own.filter((s) => s.attendance === "absence").length,
        hours: ownWorked.reduce(
          (sum, s) => sum + workedHours(s.entry_time, s.exit_time),
          0,
        ),
      };
    })
    .filter((r) =>
      `${r.name} ${r.position}`.toLowerCase().includes(query.toLowerCase()),
    );
  const clientMap = new Map<
    string,
    {
      name: string;
      equivalent: number;
      people: Set<string>;
      activities: Map<string, number>;
    }
  >();
  const activityMap = new Map<string, number>();
  for (const sheet of worked)
    for (const entry of sheet.timesheet_entries || []) {
      const client = entry.client?.name || "Sin cliente",
        activity = entry.activity?.name || "Sin actividad",
        percentage = Number(entry.percentage) || 0;
      const item = clientMap.get(client) || {
        name: client,
        equivalent: 0,
        people: new Set<string>(),
        activities: new Map<string, number>(),
      };
      item.equivalent += percentage / 100;
      item.people.add(sheet.employee_id);
      item.activities.set(
        activity,
        (item.activities.get(activity) || 0) + percentage / 100,
      );
      clientMap.set(client, item);
      activityMap.set(
        activity,
        (activityMap.get(activity) || 0) + percentage / 100,
      );
    }
  const clientRows = [...clientMap.values()]
    .map((c) => ({
      name: c.name,
      people: c.people.size,
      equivalent: c.equivalent,
      top: [...c.activities].sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
    }))
    .filter(
      (r) =>
        !HIDDEN_CLIENTS.has(r.name) &&
        r.name.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => b.equivalent - a.equivalent);
  const activityRows = [...activityMap]
    .map(([name, equivalent]) => ({ name, equivalent }))
    .sort((a, b) => b.equivalent - a.equivalent);
  const absenceRows = sheets
    .filter((s) => s.attendance !== "worked")
    .filter((s) =>
      `${s.employee?.full_name || ""} ${s.employee?.position || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  const tabs: [AdminTab, string][] = [
    ["summary", "Resumen"],
    ["people", "Personas"],
    ["clients", "Clientes"],
    ["absences", "Ausencias"],
  ];
  const exportData = () => {
    let heading: string[] = [],
      data: (string | number)[][] = [];
    if (tab === "people") {
      heading = [
        "Colaborador",
        "Puesto",
        "Capturas",
        "Días trabajados",
        "Vacaciones",
        "Faltas",
        "Horas",
      ];
      data = personRows.map((r) => [
        r.name,
        r.position,
        r.captures,
        r.worked,
        r.vacation,
        r.absence,
        r.hours.toFixed(1),
      ]);
    } else if (tab === "clients") {
      heading = [
        "Cliente",
        "Personas",
        "Días equivalentes",
        "Actividad principal",
      ];
      data = clientRows.map((r) => [
        r.name,
        r.people,
        r.equivalent.toFixed(2),
        r.top,
      ]);
    } else if (tab === "absences") {
      heading = ["Fecha", "Colaborador", "Puesto", "Tipo"];
      data = absenceRows.map((r) => [
        r.work_date,
        r.employee?.full_name || "",
        r.employee?.position || "",
        r.attendance === "vacation" ? "Vacaciones" : "Falta",
      ]);
    } else {
      heading = ["Indicador", "Valor"];
      data = [
        ["Colaboradores activos", employees.length],
        ["Personas con captura", peopleWithCapture.size],
        ["Registros", sheets.length],
        ["Días trabajados", worked.length],
        ["Vacaciones", vacations.length],
        ["Faltas", absences.length],
        ["Horas registradas", hours.toFixed(1)],
      ];
    }
    const blob = new Blob(
        [
          "\ufeff" +
            [heading, ...data]
              .map((r) => r.map(csvCell).join(","))
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `central-rh-${tab}-${from}-${to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-title">
        <div>
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={17} /> Volver a captura
          </button>
          <p className="eyebrow">ADMINISTRACIÓN</p>
          <h1>Panel de seguimiento</h1>
          <p>Consulta el avance del equipo y la distribución del tiempo.</p>
        </div>
        <button
          className="secondary export-button"
          onClick={exportData}
          disabled={busy}
        >
          <Download size={17} /> Exportar CSV
        </button>
      </div>
      <div className="admin-toolbar">
        <div className="date-filter">
          <label>
            Desde
            <input
              type="date"
              value={from}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
          </label>
          <span>—</span>
          <label>
            Hasta
            <input
              type="date"
              value={to}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </label>
        </div>
        {tab !== "summary" && (
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Buscar"
              placeholder="Buscar…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        )}
      </div>
      <nav className="admin-tabs" aria-label="Secciones del panel">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setSelection(null);
              setQuery("");
            }}
          >
            {label}
            {id === "absences" && absenceRows.length > 0 && (
              <span>{absenceRows.length}</span>
            )}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {busy ? (
        <AdminSkeleton />
      ) : (
        <>
          <div className="metrics">
            <Metric
              icon={<Users />}
              label="Colaboradores activos"
              value={employees.length}
            />
            <Metric
              icon={<UserCheck />}
              label="Con captura"
              value={peopleWithCapture.size}
              detail={`${coverage}% del equipo`}
            />
            <Metric
              icon={<CalendarDays />}
              label="Registros del período"
              value={sheets.length}
            />
            <Metric
              icon={<Clock3 />}
              label="Horas registradas"
              value={hours.toFixed(1)}
            />
          </div>
          {tab === "summary" && (
            <div className="summary-grid">
              <section className="admin-card">
                <div className="card-heading">
                  <div>
                    <h2>
                      Avance al{" "}
                      {new Date(`${to}T12:00:00`).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "long",
                      })}
                    </h2>
                    <p>Personas que aún no han capturado en la fecha final.</p>
                  </div>
                  <span className={missing.length ? "count-warn" : "count-ok"}>
                    {missing.length} pendientes
                  </span>
                </div>
                <div className="progress">
                  <span
                    style={{
                      width: `${100 - (employees.length ? (missing.length / employees.length) * 100 : 0)}%`,
                    }}
                  />
                </div>
                {missing.length ? (
                  <details className="pending-details" key={to}>
                    <summary>Ver {missing.length} personas pendientes</summary>
                    <ul>
                      {missing.map((e) => (
                        <li key={e.id}>{e.full_name}</li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <p className="all-done">
                    <Check size={18} /> Todo el equipo activo ha capturado.
                  </p>
                )}
              </section>
              <section className="admin-card">
                <div className="card-heading">
                  <div>
                    <h2>Estado del período</h2>
                    <p>Resumen de asistencia registrada.</p>
                  </div>
                </div>
                <div className="status-list">
                  <div>
                    <span className="status-dot worked" />
                    Trabajados<strong>{worked.length}</strong>
                  </div>
                  <div>
                    <span className="status-dot vacation" />
                    Vacaciones<strong>{vacations.length}</strong>
                  </div>
                  <div>
                    <span className="status-dot absence" />
                    Faltas<strong>{absences.length}</strong>
                  </div>
                </div>
              </section>
              <section className="admin-card">
                <div className="card-heading">
                  <div>
                    <h2>Clientes con más dedicación</h2>
                    <p>Días equivalentes según porcentaje reportado.</p>
                  </div>
                </div>
                <RankList
                  rows={clientRows
                    .slice(0, 5)
                    .map((r) => ({ name: r.name, value: r.equivalent }))}
                />
              </section>
              <section className="admin-card">
                <div className="card-heading">
                  <div>
                    <h2>Dedicación por cliente</h2>
                    <p>Tiempo acumulado por cliente en el período.</p>
                  </div>
                </div>
                <RankList
                  rows={clientRows
                    .slice(0, 5)
                    .map((r) => ({ name: r.name, value: r.equivalent }))}
                />
              </section>
            </div>
          )}
          {tab === "people" && (
            <AdminTable
              headings={[
                "Colaborador",
                "Puesto",
                "Capturas",
                "Trabajados",
                "Vacaciones",
                "Faltas",
                "Horas",
              ]}
              rows={personRows.map((r) => [
                <button className="detail-link" onClick={()=>setSelection({type:'person',name:r.name})}>{r.name}</button>,
                r.position,
                r.captures,
                r.worked,
                r.vacation,
                r.absence,
                r.hours.toFixed(1),
              ])}
              empty="No hay colaboradores que coincidan."
            />
          )}
          {tab === "clients" && (
            <>
              <ActivitySummary rows={clientRows.map(({ name, equivalent }) => ({ name, equivalent }))} />
              <AdminTable
                headings={[
                  "Cliente",
                  "Personas",
                  "Días equivalentes",
                  "Actividad principal",
                ]}
                rows={clientRows.map((r) => [
                  <button className="detail-link" onClick={()=>setSelection({type:'client',name:r.name})}>{r.name}</button>,
                  r.people,
                  r.equivalent.toFixed(2),
                  r.top,
                ])}
                empty="No hay actividad de clientes en este período."
              />
            </>
          )}
          {selection && (tab === 'people' || tab === 'clients') && <ReportDetails key={selection.type+selection.name+from+to} sheets={sheets} selection={selection} onClose={()=>setSelection(null)} db={sb} />}
          {tab === 'people' && <PendingDays employees={employees} sheets={sheets} from={from} to={to} today={day()} db={sb} onRefresh={()=>setRevision(r=>r+1)} />}
          {tab === "absences" && (
            <AdminTable
              headings={["Fecha", "Colaborador", "Puesto", "Tipo"]}
              rows={absenceRows.map((r) => [
                new Date(`${r.work_date}T12:00:00`).toLocaleDateString("es-MX"),
                r.employee?.full_name || "—",
                r.employee?.position || "—",
                <span className={`status-pill ${r.attendance}`}>
                  {r.attendance === "vacation" ? "Vacaciones" : "Falta"}
                </span>,
              ])}
              empty="No hay vacaciones ni faltas en este período."
            />
          )}
        </>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="metric">
      <span className="metric-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}
function RankList({ rows }: { rows: { name: string; value: number }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return rows.length ? (
    <div className="rank-list">
      {rows.map((r) => (
        <div key={r.name}>
          <div>
            <span>{r.name.split(" (")[0]}</span>
            <strong>{r.value.toFixed(2)}</strong>
          </div>
          <div className="rank-bar">
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="empty">Sin información en este período.</p>
  );
}
function ActivitySummary({ rows }: { rows: { name: string; equivalent: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.equivalent, 0);

  return (
    <section className="admin-card activity-summary">
      <div className="card-heading">
        <div>
          <h2>Dedicación por cliente</h2>
          <p>Tiempo acumulado por cliente en el período.</p>
        </div>
      </div>
      {rows.length > 0 && total > 0 ? (
        <div className="activity-summary-list">
          {rows.slice(0, 8).map((row) => {
            const share = row.equivalent / total;
            return (
              <div className="activity-summary-row" key={row.name}>
                <div className="activity-summary-label">
                  <span>{row.name}</span>
                  <strong>{share.toFixed(2)}</strong>
                </div>
                <div
                  className="activity-summary-bar"
                  role="progressbar"
                  aria-label={`${row.name}: ${(share * 100).toFixed(0)}%`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={share * 100}
                >
                  <span style={{ width: `${share * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty">Sin actividades en este período.</p>
      )}
    </section>
  );
}
function AdminTable({
  headings,
  rows,
  empty,
}: {
  headings: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  return (
    <section className="admin-card table-card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {headings.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((value, j) => (
                  <td key={j}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="empty">{empty}</p>}
    </section>
  );
}
