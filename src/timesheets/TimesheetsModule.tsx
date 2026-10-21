import { Copy, Info, LayoutDashboard, Plus, Trash2 } from "lucide-react";
import { SheetSkeleton } from "../components/LoadingSkeletons";
import { Picker, type Option } from "../components/Picker";
import { AiTimesheetGenerator } from "./AiTimesheetGenerator";
import { TimesheetCalendar } from "./TimesheetCalendar";
import { RepeatDays } from "./RepeatDays";
import { ABSENCE_OPTIONS, attendanceLabel } from "./attendance";
import { day } from "./utils";
import type { useTimesheetDraft } from "./useTimesheetDraft";

type Props = { employee: string; admin: boolean; canViewTimesheetReports: boolean; onReports: () => void; clients: Option[]; activities: Option[]; draft: ReturnType<typeof useTimesheetDraft> };

export function TimesheetsModule({ employee, admin, canViewTimesheetReports, onReports, clients, activities, draft }: Props) {
  const { baseline, savedSheetDate, date, setDate, attendance, setAttendance, mode, setMode, entry, setEntry, exit, setExit, permissionEntry, setPermissionEntry, permissionExit, setPermissionExit, rows, setRows, busy, setBusy, saving, error, setError, message, aiCompletionMessage, setAiCompletionMessage, importRevision, setImportRevision, sheetRevision, deleting, dirty, canLeave, workdayHours, totalHours, total, hoursAreComplete, scheduleReady, isWeekend, weekendDayName, deleteSheet, save, update, copying, copyPreviousDay, repeatDay } = draft;
  return (
    <>
            <div className="page-header">
              <div>
                <p className="eyebrow">MI HOJA DE TIEMPO</p>
                <h1>Captura diaria</h1>
              </div>
              {canViewTimesheetReports && (
                <button className="secondary" onClick={() => { if (canLeave()) onReports(); }}>
                  <LayoutDashboard size={18} /> Panel admin
                </button>
              )}
            </div>
            <TimesheetCalendar
              employeeId={employee}
              selectedDate={date}
              refreshKey={sheetRevision + importRevision}
              onPick={(value) => {
                if (value !== date && !canLeave()) return;
                setDate(value);
                document.getElementById("timesheet-capture")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
            <AiTimesheetGenerator
              isAdmin={admin}
              activities={activities}
              onImported={(completionMessage) => {
                setImportRevision((value) => value + 1);
                setAiCompletionMessage(completionMessage);
              }}
            />
            {aiCompletionMessage && <p role="status" className="success ai-completion-message">{aiCompletionMessage}</p>}
            <div className="panel" id="timesheet-capture">
              <div className="date-header-row">
                <label className="date-input-label">
                  Fecha
                  <input
                    type="date"
                    max={day()}
                    value={date}
                    disabled={saving || deleting}
                    onChange={(e) => {
                      if (e.target.value && canLeave()) setDate(e.target.value);
                    }}
                  />
                </label>
                <button type="button" className="secondary" disabled={busy || saving || deleting || copying} onClick={copyPreviousDay}>
                  <Copy size={16} /> {copying ? "Copiando…" : "Copiar día anterior"}
                </button>
                <div className={`weekend-hint ${isWeekend ? "is-active" : ""}`} role="note">
                  <Info size={15} />
                  <span>Los fines de semana no requieren registro, salvo que hayas laborado.</span>
                </div>
              </div>
              {isWeekend && savedSheetDate === date && !busy && (
                <div className="weekend-record-warning" role="status">
                  <span>Existe un registro capturado este {weekendDayName}. Si no laboraste, puedes eliminarlo:</span>
                  <button
                    className="weekend-delete-btn"
                    disabled={deleting || saving}
                    onClick={deleteSheet}
                  >
                    {deleting ? 'Eliminando...' : 'Eliminar registro de este día'}
                  </button>
                </div>
              )}
              {busy ? (
                <SheetSkeleton />
              ) : (
                <>
                  <fieldset disabled={saving || deleting}>
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
                        {ABSENCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
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
                      {rows.some((r) => !r.client_id || !r.activity_id) && (
                        <p className="under-warning" role="status">
                          Elige cliente y actividad en todas las filas para poder guardar.
                        </p>
                      )}
                      <button
                        className="add"
                        onClick={() =>
                          setRows([
                            ...rows,
                            {
                              client_id: "",
                              activity_id: "",
                              hours: 0,
                              percentage: 0,
                            },
                          ])
                        }
                      >
                        <Plus size={18} /> Agregar actividad
                      </button>
                      <RepeatDays
                        disabled={dirty || savedSheetDate !== date || saving || deleting}
                        hint={dirty || savedSheetDate !== date ? "Guarda este día primero; después puedes copiarlo a otros días del periodo." : "Copia este reparto a los días hábiles del periodo que aún no tengan registro. Los días ya capturados no se modifican."}
                        onRepeat={repeatDay}
                      />
                    </>
                  ) : (
                    <p className="notice">
                      No se registran actividades en días no trabajados.
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
                    deleting ||
                    !employee ||
                    baseline === null ||
                    (attendance === "worked" &&
                      (!hoursAreComplete ||
                        rows.some((r) => (Number(r.hours) || 0) <= 0 || !r.client_id || !r.activity_id) ||
                        !scheduleReady))
                  }
                  onClick={save}
                >
                  {saving ? "Guardando…" : "Guardar día"}
                </button>
              </div>
            </div>
    </>
  );
}
