import { useState } from "react";
import { CopyPlus } from "lucide-react";
import { day } from "./utils";

type Props = { disabled: boolean; hint: string; onRepeat: (from: string, to: string) => Promise<string> };

export function RepeatDays({ disabled, hint, onRepeat }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
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
        <p className="section-help">{hint}</p>
      </div>
      <div className="repeat-days-row">
        <label>
          Desde
          <input type="date" max={day()} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" max={day()} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" className="secondary" disabled={disabled || busy || !from || !to} onClick={run}>
          <CopyPlus size={16} /> {busy ? "Guardando…" : "Aplicar a días sin registro"}
        </button>
      </div>
      {result && <p role="status" className="report-note">{result}</p>}
    </div>
  );
}
