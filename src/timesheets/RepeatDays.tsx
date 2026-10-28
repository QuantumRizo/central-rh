import { useState } from "react";
import { CopyPlus } from "lucide-react";
import { day } from "./utils";

type Props = {
  sourceDate: string;
  disabled: boolean;
  hint: string;
  onRangeReadyChange: (ready: boolean) => void;
  onRepeat: (from: string, to: string) => Promise<string>;
};

export function RepeatDays({ sourceDate, disabled, hint, onRangeReadyChange, onRepeat }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const rangeReady = Boolean(from && to && from <= to);
  const sourceLabel = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${sourceDate}T12:00:00`));
  const updateFrom = (value: string) => {
    setFrom(value);
    setResult("");
    onRangeReadyChange(Boolean(value && to && value <= to));
  };
  const updateTo = (value: string) => {
    setTo(value);
    setResult("");
    onRangeReadyChange(Boolean(from && value && from <= value));
  };
  const run = async () => {
    setBusy(true);
    setResult("");
    try {
      setResult(await onRepeat(from, to));
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="repeat-days">
      <div>
        <h3>Repetir este día</h3>
        <p className="repeat-days-source">Día que se copiará: <strong>{sourceLabel}</strong></p>
        <p className="section-help">{hint}</p>
      </div>
      <div className="repeat-days-row">
        <label>
          Desde
          <input type="date" max={day()} value={from} onChange={(e) => updateFrom(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" max={day()} value={to} min={from || undefined} onChange={(e) => updateTo(e.target.value)} />
        </label>
      </div>
      {from && to && !rangeReady && <p className="report-note" role="alert">La fecha “Hasta” debe ser igual o posterior a “Desde”.</p>}
      {rangeReady && (
        <div className="repeat-days-apply">
          <p className="section-help">Este paso copia el día guardado a los días hábiles sin registro del rango. “Guardar solo este día” no aplica la repetición.</p>
          <button type="button" disabled={disabled || busy} onClick={run}>
            <CopyPlus size={16} /> {busy ? "Aplicando…" : "Aplicar este día a los días sin registro"}
          </button>
        </div>
      )}
      {result && <p role="status" className="report-note">{result}</p>}
    </div>
  );
}
