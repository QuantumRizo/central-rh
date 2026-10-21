// Email clients need inline values; these match the palette in src/styles/tokens.css.
const colors = {
  background: '#f5f7fa', surface: '#ffffff', sidebar: '#11233a', primary: '#0b5eb7',
  primarySoft: '#eaf2fb', border: '#e2e8f0', text: '#1e293b', secondary: '#475569', muted: '#64748b',
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

export function renderReminderEmail(fullName: string, appUrl: string, periods: { current: boolean; previous: boolean }) {
  const firstName = fullName.trim().split(/\s+/)[0] || 'Hola';
  const labels = [periods.previous && 'La semana anterior', periods.current && 'Esta semana'].filter(Boolean) as string[];
  const periodRows = labels.map((label) => `<tr><td style="padding:0 0 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr><td style="padding:12px 16px;background:${colors.primarySoft};border-left:3px solid ${colors.primary};border-radius:8px;color:${colors.text};font:500 14px/20px Arial,sans-serif">${label}</td></tr></table></td></tr>`).join('');
  const timesheetsUrl = `${appUrl.replace(/\/$/, '')}/timesheets`;
  const link = escapeHtml(timesheetsUrl);
  const subject = 'Revisa tus horas en Central RH';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:${colors.background};font-family:Arial,sans-serif;color:${colors.text}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.background};border-collapse:collapse"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;border-collapse:separate;background:${colors.surface};border:1px solid ${colors.border};border-radius:12px;overflow:hidden"><tr><td style="padding:20px 28px;background:${colors.sidebar};color:#ffffff;font:600 14px/20px Arial,sans-serif;letter-spacing:.04em">CENTRAL RH <span style="font-weight:400;opacity:.8">/ TIME SHEETS</span></td></tr><tr><td style="padding:32px 28px 28px"><p style="margin:0 0 8px;color:${colors.primary};font:600 12px/18px Arial,sans-serif;letter-spacing:.08em">RECORDATORIO SEMANAL</p><h1 style="margin:0 0 20px;color:${colors.text};font:600 26px/32px Arial,sans-serif">Revisa tus horas</h1><p style="margin:0 0 16px;color:${colors.text};font:400 15px/24px Arial,sans-serif">Hola ${escapeHtml(firstName)},</p><p style="margin:0 0 18px;color:${colors.secondary};font:400 15px/24px Arial,sans-serif">Tus registros de Time Sheets necesitan una revisión en:</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${periodRows}</table><p style="margin:12px 0 24px;color:${colors.secondary};font:400 15px/24px Arial,sans-serif">Entra a Central RH para revisar y completar tus horas o registrar la ausencia que corresponda.</p><table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr><td bgcolor="${colors.primary}" style="border-radius:8px"><a href="${link}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font:600 14px/20px Arial,sans-serif">Abrir Time Sheets</a></td></tr></table><p style="margin:24px 0 0;color:${colors.muted};font:400 12px/19px Arial,sans-serif">Si acabas de registrar tus horas, puedes ignorar este mensaje.</p></td></tr><tr><td style="padding:16px 28px;border-top:1px solid ${colors.border};color:${colors.muted};font:400 12px/18px Arial,sans-serif">Central RH · Recordatorio automático</td></tr></table></td></tr></table></body></html>`;
  const text = `Hola ${firstName},\n\nRevisa tus horas en Central RH para: ${labels.join(' y ').toLowerCase()}. Entra para completar tus registros o registrar la ausencia que corresponda.\n\nAbrir Time Sheets: ${timesheetsUrl}\n\nSi acabas de registrar tus horas, puedes ignorar este mensaje.`;
  return { subject, html, text };
}
