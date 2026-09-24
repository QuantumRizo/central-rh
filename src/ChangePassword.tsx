import { useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { sb } from './lib/supabase';

export function ChangePassword({ session, onBack }: { session: Session; onBack: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setMessage('');
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setSaving(true);
    const { error: authError } = await sb.auth.updateUser({ password });
    if (authError) setError(authError.message);
    else { setPassword(''); setConfirm(''); setMessage('Contraseña actualizada correctamente.'); }
    setSaving(false);
  };

  return <div className="profile-page password-page">
    <div className="page-header"><div><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17} /> Volver a mi perfil</button><p className="eyebrow">CUENTA Y ACCESO</p><h1>Cambiar contraseña</h1><p>Actualiza la contraseña de tu cuenta para mantener tu acceso seguro.</p></div></div>
    <section className="profile-card password-card"><div className="profile-card-title"><KeyRound size={19} /><h2>Seguridad de la cuenta</h2></div><p className="profile-account-email">Cuenta vinculada a <strong>{session.user.email}</strong>.</p><form className="password-form" onSubmit={(event) => void submit(event)}><label>Nueva contraseña<input required minLength={6} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 6 caracteres" /></label><label>Confirmar contraseña<input required minLength={6} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Repite tu contraseña" /></label>{error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}<div className="password-actions"><button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Actualizar contraseña'}</button><button type="button" className="secondary" onClick={onBack}>Cancelar</button></div></form></section>
  </div>;
}
