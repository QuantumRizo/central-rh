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
  X,
} from "lucide-react";
type Option = { id: string; name: string };
type Entry = { client_id: string; activity_id: string; percentage: number; hours?: number };
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
    hours: Number(row.hours) || 0,
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
        const loadedHours = workedHours(
          data?.entry_time?.slice(0, 5) || "09:00",
          data?.exit_time?.slice(0, 5) || "18:00",
        );
        const loadedRows = (data?.timesheet_entries || []).map((row: Entry) => ({
          ...row,
          hours: Number(((Number(row.percentage) || 0) * loadedHours / 100).toFixed(2)),
        }));
        setRows(loadedRows);
        setBaseline(sheetSnapshot({
          attendance: data?.attendance || 'worked',
          mode: data?.mode || 'office',
          entry: data?.entry_time?.slice(0,5) || '09:00',
          exit: data?.exit_time?.slice(0,5) || '18:00',
          permissionEntry: data?.permission_entry_time?.slice(0,5) || '09:00',
          permissionExit: data?.permission_exit_time?.slice(0,5) || '18:00',
          rows: loadedRows,
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
  const workdayHours = workedHours(entry, exit);
  const totalHours = rows.reduce((sum, row) => sum + (Number(row.hours) || 0), 0);
  const total = workdayHours ? (totalHours / workdayHours) * 100 : 0;
  const hoursAreComplete = Math.abs(totalHours - workdayHours) < 0.01;
  const scheduleReady =
    mode !== "schedule_permission" ||
    (permissionEntry && permissionExit && permissionExit > permissionEntry);
  const save = async () => {
    if (baseline === null || busy || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saveRows = rows.map((row) => ({
        client_id: row.client_id,
        activity_id: row.activity_id,
        percentage: Number(((Number(row.hours) || 0) / workdayHours * 100).toFixed(2)),
      }));
      if (saveRows.length) {
        const previousTotal = saveRows
          .slice(0, -1)
          .reduce((sum, row) => sum + row.percentage, 0);
        saveRows[saveRows.length - 1].percentage = Number((100 - previousTotal).toFixed(2));
      }
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
          entries: attendance === "worked" ? saveRows : [],
        },
      });
      if (error) throw error;
      const savedRows = attendance === "worked"
        ? rows.map((row, index) => ({ ...row, percentage: saveRows[index]?.percentage || 0 }))
        : [];
      setRows(savedRows);
      setBaseline(sheetSnapshot({attendance,mode,entry,exit,permissionEntry,permissionExit,rows:attendance === 'worked' ? savedRows : []}));
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
                        <div>
                          <h2>Distribución del tiempo</h2>
                          <p className="section-help">Captura horas; el sistema calcula el porcentaje automáticamente.</p>
                        </div>
                        <span className={hoursAreComplete ? "ok" : "warn"}>
                          {totalHours.toFixed(2)} h / {workdayHours.toFixed(2)} h · {total.toFixed(1)}%
                        </span>
                      </div>
                      {totalHours > workdayHours && (
                        <p className="over-warning" role="alert">
                          Te estás pasando de la jornada real. Reduce las horas antes de guardar.
                        </p>
                      )}
                      {!hoursAreComplete && totalHours < workdayHours && (
                        <p className="under-warning" role="status">
                          Faltan {(workdayHours - totalHours).toFixed(2)} horas por distribuir.
                        </p>
                      )}
                      {rows.length > 0 && (
                        <div className="entry-labels" aria-hidden="true">
                          <span>Cliente</span>
                          <span>Actividad</span>
                          <span>Horas / % del día</span>
                          <span />
                        </div>
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
                            <div className="hours-field">
                              <input
                                className="hours-input"
                                aria-label={`Horas de actividad ${i + 1}`}
                                type="number"
                                min="0"
                                max={workdayHours}
                                step="0.25"
                                value={r.hours ?? 0}
                                onChange={(e) => {
                                  const hours = Number(e.target.value);
                                  update(i, {
                                    hours,
                                    percentage: workdayHours ? (hours / workdayHours) * 100 : 0,
                                  });
                                }}
                              />
                              <span className="hours-unit">h</span>
                              <div className="hours-conversion" aria-live="polite">
                                <strong>{workdayHours ? ((Number(r.hours) || 0) / workdayHours * 100).toFixed(1) : "0.0"}%</strong>
                                <small>del día</small>
                              </div>
                            </div>
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
                              hours: 0,
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
                      (!hoursAreComplete ||
                        rows.some((r) => (Number(r.hours) || 0) <= 0) ||
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
    [error, setError] = useState(""),
    [selectedClientName, setSelectedClientName] = useState<string | null>(null),
    [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
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
        id: e.id,
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
  const selectedClientDetail = selectedClientName
    ? (() => {
        const client = clientMap.get(selectedClientName);
        if (!client) return null;
        const people = new Map<
          string,
          {
            id: string;
            name: string;
            position: string;
            equivalent: number;
            days: Set<string>;
            activities: Map<string, number>;
          }
        >();
        const activities = new Map<string, number>();
        for (const sheet of worked) {
          for (const entry of sheet.timesheet_entries || []) {
            if (entry.client?.name !== selectedClientName) continue;
            const activity = entry.activity?.name || "Sin actividad";
            const percentage = Number(entry.percentage) || 0;
            const person = people.get(sheet.employee_id) || {
              id: sheet.employee_id,
              name: sheet.employee?.full_name || "Colaborador sin nombre",
              position: sheet.employee?.position || sheet.position_snapshot || "—",
              equivalent: 0,
              days: new Set<string>(),
              activities: new Map<string, number>(),
            };
            person.equivalent += percentage / 100;
            person.days.add(sheet.work_date);
            person.activities.set(
              activity,
              (person.activities.get(activity) || 0) + percentage,
            );
            people.set(sheet.employee_id, person);
            activities.set(activity, (activities.get(activity) || 0) + percentage);
          }
        }
        const activityTotal = [...activities.values()].reduce((sum, value) => sum + value, 0);
        return {
          ...client,
          activities: [...activities]
            .map(([name, percentage]) => ({
              name,
              percentage,
              share: activityTotal ? (percentage / activityTotal) * 100 : 0,
            }))
            .sort((a, b) => b.percentage - a.percentage),
          people: [...people.values()].sort((a, b) => b.equivalent - a.equivalent),
        };
      })()
    : null;
  const selectedPersonDetail = selectedPersonId
    ? (() => {
        const person = employees.find((employee) => employee.id === selectedPersonId);
        if (!person) return null;
        const own = sheets.filter((sheet) => sheet.employee_id === selectedPersonId);
        const ownWorked = own.filter((sheet) => sheet.attendance === "worked");
        const activities = new Map<string, number>();
        for (const sheet of ownWorked)
          for (const entry of sheet.timesheet_entries || []) {
            const activity = entry.activity?.name || "Sin actividad";
            activities.set(activity, (activities.get(activity) || 0) + (Number(entry.percentage) || 0));
          }
        const activityTotal = [...activities.values()].reduce((sum, value) => sum + value, 0);
        const activityNames = [...activities]
          .sort((a, b) => b[1] - a[1])
          .map(([name]) => name);
        return {
          person,
          own,
          ownWorked,
          hours: ownWorked.reduce(
            (sum, sheet) => sum + workedHours(sheet.entry_time, sheet.exit_time),
            0,
          ),
          activities: [...activities]
            .map(([name, percentage]) => ({
              name,
              percentage,
              share: activityTotal ? (percentage / activityTotal) * 100 : 0,
            }))
            .sort((a, b) => b.percentage - a.percentage),
          activityNames,
        };
      })()
    : null;
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
              setSelectedClientName(null);
              setSelectedPersonId(null);
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

function LegacyActivitySummary({
  rows,
  title = "Actividades principales",
  description = "Distribución acumulada en el período.",
}: {
  rows: { name: string; percentage: number; share: number }[];
  title?: string;
  description?: string;
}) {
  return (
    <section className="admin-card activity-summary">
      <div className="card-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {rows.length ? (
        <div className="detail-activity-list">
          {rows.map((row) => (
            <div className="detail-activity" key={row.name}>
              <div className="detail-activity-label">
                <span>{row.name}</span>
                <strong>{row.share.toFixed(0)}%</strong>
              </div>
              <div className="rank-bar">
                <span style={{ width: `${Math.min(row.share, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">Sin actividades en este período.</p>
      )}
    </section>
  );
}

function DetailHeader({
  eyebrow,
  title,
  description,
  backLabel,
  onClose,
}: {
  eyebrow: string;
  title: string;
  description: string;
  backLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="detail-header">
      <div>
        <button className="back-link" onClick={onClose}>
          <ArrowLeft size={17} /> {backLabel}
        </button>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <button className="icon detail-close" aria-label="Cerrar detalle" onClick={onClose}>
        <X size={19} />
      </button>
    </div>
  );
}

function ClientDetail({
  detail,
  from,
  to,
  onClose,
}: {
  detail: any;
  from: string;
  to: string;
  onClose: () => void;
}) {
  return (
    <div className="detail-view">
      <DetailHeader
        eyebrow="DETALLE DEL CLIENTE"
        title={detail.name}
        description={`Personas y actividades registradas del ${from} al ${to}.`}
        backLabel="Volver a clientes"
        onClose={onClose}
      />
      <div className="detail-metrics">
        <Metric icon={<Users />} label="Personas trabajando" value={detail.people.length} />
        <Metric
          icon={<Clock3 />}
          label="Días equivalentes"
          value={detail.equivalent.toFixed(2)}
        />
        <Metric
          icon={<LayoutDashboard />}
          label="Actividades"
          value={detail.activities.length}
        />
      </div>
      <div className="detail-grid">
        <LegacyActivitySummary
          rows={detail.activities}
          title="Actividades principales"
          description="Proporción del tiempo reportado para este cliente."
        />
        <section className="admin-card people-detail-card">
          <div className="card-heading">
            <div>
              <h2>Personas asignadas</h2>
              <p>Qué actividad realiza cada persona y su porcentaje promedio diario.</p>
            </div>
          </div>
          {detail.people.length ? (
            <div className="assigned-people">
              {detail.people.map((person: any) => {
                const personTotal = [...person.activities.values()].reduce(
                  (sum: number, value: number) => sum + value,
                  0,
                );
                return (
                  <div className="assigned-person" key={person.id}>
                    <div className="assigned-person-heading">
                      <div>
                        <strong>{person.name}</strong>
                        <small>{person.position}</small>
                      </div>
                      <span>{person.equivalent.toFixed(2)} días eq.</span>
                    </div>
                    <div className="assigned-activities">
                      {[...person.activities]
                        .sort((a, b) => b[1] - a[1])
                        .map(([name, percentage]) => (
                          <div key={name}>
                            <span>{name}</span>
                            <strong>
                              {(percentage / Math.max(person.days.size, 1)).toFixed(1)}%
                            </strong>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty">Sin personas en este período.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function PersonDetail({
  detail,
  from,
  to,
  onClose,
}: {
  detail: any;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const activityValue = (sheet: any, activityName: string) =>
    (sheet.timesheet_entries || [])
      .filter((entry: any) => (entry.activity?.name || "Sin actividad") === activityName)
      .reduce((sum: number, entry: any) => sum + (Number(entry.percentage) || 0), 0);
  return (
    <div className="detail-view">
      <DetailHeader
        eyebrow="DETALLE DE LA PERSONA"
        title={detail.person.full_name}
        description={`${detail.person.position} · Resumen del ${from} al ${to}.`}
        backLabel="Volver a personas"
        onClose={onClose}
      />
      <div className="detail-metrics person-metrics">
        <Metric icon={<CalendarDays />} label="Capturas" value={detail.own.length} />
        <Metric icon={<Check />} label="Días trabajados" value={detail.ownWorked.length} />
        <Metric icon={<Clock3 />} label="Horas reales" value={detail.hours.toFixed(1)} />
        <Metric
          icon={<UserCheck />}
          label="No trabajados"
          value={detail.own.filter((sheet: any) => sheet.attendance !== "worked").length}
        />
      </div>
      <LegacyActivitySummary
        rows={detail.activities}
        title="Resumen de actividades"
        description="Distribución de las actividades trabajadas por la persona."
      />
      <section className="admin-card table-card person-log-card">
        <div className="card-heading detail-table-heading">
          <div>
            <h2>Tiempo y actividades por día</h2>
            <p>Horas reales registradas y porcentaje capturado en cada actividad.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Fecha",
                  "Estado",
                  "Horario",
                  "Horas reales",
                  ...detail.activityNames,
                ].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.own.map((sheet: any) => (
                <tr key={sheet.id}>
                  <td>
                    {new Date(`${sheet.work_date}T12:00:00`).toLocaleDateString("es-MX")}
                  </td>
                  <td>
                    <span className={`status-pill ${sheet.attendance}`}>
                      {sheet.attendance === "worked"
                        ? "Trabajado"
                        : sheet.attendance === "vacation"
                          ? "Vacaciones"
                          : "Falta"}
                    </span>
                  </td>
                  <td>
                    {sheet.attendance === "worked" && sheet.entry_time && sheet.exit_time
                      ? `${sheet.entry_time.slice(0, 5)} – ${sheet.exit_time.slice(0, 5)}`
                      : "—"}
                  </td>
                  <td>
                    {sheet.attendance === "worked"
                      ? workedHours(sheet.entry_time, sheet.exit_time).toFixed(1)
                      : "—"}
                  </td>
                  {detail.activityNames.map((activityName: string) => {
                    const percentage = activityValue(sheet, activityName);
                    return <td key={activityName}>{percentage ? `${percentage.toFixed(1)}%` : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!detail.own.length && <p className="empty">Sin registros en este período.</p>}
      </section>
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
  onRowClick,
}: {
  headings: string[];
  rows: ReactNode[][];
  empty: string;
  onRowClick?: (index: number) => void;
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
              <tr
                key={i}
                className={onRowClick ? "clickable-row" : ""}
                onClick={() => onRowClick?.(i)}
                onKeyDown={(event) => {
                  if (onRowClick && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onRowClick(i);
                  }
                }}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
              >
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
