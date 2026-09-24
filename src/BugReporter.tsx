import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bug, CircleAlert, SendHorizontal, X } from 'lucide-react';
import { sb } from './lib/supabase';

type Props = { module: string };
type Status = 'idle' | 'sending' | 'sent';

const MAX_LENGTH = 4000;

export function BugReporter({ module }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    if (status === 'idle') textareaRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, status]);

  const reset = () => { setStatus('idle'); setSentMessage(''); setError(''); };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = message.trim();
    if (!text || status === 'sending') return;
    setStatus('sending'); setError(''); setSentMessage(text);
    try {
      const { data, error: functionError } = await sb.functions.invoke('send-bug-report', {
        body: { message: text, module, url: window.location.href, user_agent: navigator.userAgent },
      });
      if (functionError) {
        // Edge function errors carry the server message in the response body.
        const body = await (functionError as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(body?.message || 'No se pudo enviar el reporte. Revisa tu conexión e intenta de nuevo.');
      }
      if (!data?.success) throw new Error(data?.message || 'No se pudo enviar el reporte.');
      setMessage('');
      setStatus('sent');
    } catch (sendError) {
      setError((sendError as Error).message);
      setSentMessage('');
      setStatus('idle');
    }
  };

  return (
    <div className={`bug-reporter ${open ? 'open' : ''}`}>
      {open && (
        <section className="bug-panel" role="dialog" aria-label="Reportar un error">
          <header className="bug-panel-header">
            <span className="bug-avatar"><Bug size={18} /></span>
            <div><strong>¿Algo no funciona?</strong><small>Tu reporte le llega directo al equipo</small></div>
            <button className="icon" title="Cerrar" onClick={() => setOpen(false)}><X size={16} /></button>
          </header>
          <div className="bug-thread" aria-live="polite">
            <p className="bug-bubble bot">Hola 👋 Cuéntame qué pasó: qué intentabas hacer y qué viste. Entre más detalle, más rápido lo arreglamos.</p>
            {sentMessage && <p className="bug-bubble me">{sentMessage}</p>}
            {status === 'sending' && <p className="bug-bubble bot bug-typing" aria-label="Enviando"><span /><span /><span /></p>}
            {status === 'sent' && <p className="bug-bubble bot">¡Gracias! Ya recibimos tu reporte y lo vamos a revisar pronto.</p>}
            {error && <p className="bug-bubble error"><CircleAlert size={14} /> {error}</p>}
          </div>
          {status === 'sent' ? (
            <div className="bug-composer done"><button className="secondary" onClick={reset}>Reportar otro error</button></div>
          ) : (
            <form className="bug-composer" onSubmit={submit}>
              <textarea
                ref={textareaRef}
                rows={3}
                value={message}
                maxLength={MAX_LENGTH}
                disabled={status === 'sending'}
                placeholder="Ej. Al guardar mi timesheet del lunes aparece un error…"
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit(); }}
              />
              <button type="submit" title="Enviar reporte" disabled={!message.trim() || status === 'sending'}><SendHorizontal size={16} /></button>
            </form>
          )}
        </section>
      )}
      <button
        className="bug-fab"
        title={open ? 'Cerrar' : 'Reportar un error'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={22} /> : <Bug size={22} />}
      </button>
    </div>
  );
}
