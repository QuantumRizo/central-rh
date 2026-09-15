import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] ?? character));

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return json({ success: false, message: 'Unauthorized' }, 401);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ success: false, message: 'Unauthorized' }, 401);

    const { data: role } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (role?.role !== 'admin') return json({ success: false, message: 'Admin access required' }, 403);

    const { cycle_id: cycleId } = await request.json();
    if (!cycleId) return json({ success: false, message: 'Missing cycle_id' }, 400);

    const [{ data: cycle }, { data: assignments }, { data: questions }] = await Promise.all([
      adminClient.from('evaluation_cycles').select('*').eq('id', cycleId).single(),
      adminClient.from('evaluation_assignments').select('*').eq('cycle_id', cycleId),
      adminClient.from('evaluation_questions').select('id'),
    ]);
    if (!cycle) return json({ success: false, message: 'Cycle not found' }, 404);
    if (cycle.status !== 'active') return json({ success: false, message: 'Only active cycles can send reminders' }, 400);

    const evaluatorIds = [...new Set((assignments ?? []).map((assignment) => assignment.evaluator_id))];
    if (!evaluatorIds.length) return json({ success: false, message: 'No assignments found for this cycle' }, 400);
    const evaluatedId = cycle.evaluated_employee_id;
    if (!evaluatedId) return json({ success: false, message: 'The cycle has no evaluated employee' }, 400);

    const [{ data: evaluated }, { data: evaluators }, { data: responses }, { data: comments }] = await Promise.all([
      adminClient.from('employees').select('id,full_name,email').eq('id', evaluatedId).single(),
      adminClient.from('employees').select('id,full_name,email').in('id', evaluatorIds),
      adminClient.from('evaluation_responses').select('question_id,evaluator_id,evaluated_id').eq('cycle_id', cycleId).eq('evaluated_id', evaluatedId),
      adminClient.from('evaluation_comments').select('evaluator_id,strengths,opportunities').eq('cycle_id', cycleId).eq('evaluated_id', evaluatedId),
    ]);
    if (!evaluated) return json({ success: false, message: 'Evaluated employee not found' }, 404);

    const questionCount = questions?.length ?? 0;
    const pending = (evaluators ?? []).filter((evaluator) => {
      const answered = new Set((responses ?? [])
        .filter((response) => response.evaluator_id === evaluator.id)
        .map((response) => response.question_id));
      const comment = (comments ?? []).find((item) => item.evaluator_id === evaluator.id);
      return answered.size < questionCount || !comment?.strengths?.trim() || !comment?.opportunities?.trim();
    });

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ success: false, message: 'Email service not configured' }, 500);
    const from = Deno.env.get('RESEND_FROM_EMAIL');
    if (!from) return json({ success: false, message: 'RESEND_FROM_EMAIL is not configured' }, 500);
    const appUrl = Deno.env.get('APP_URL') ?? 'http://127.0.0.1:5175/';
    const deadline = cycle.end_date
      ? new Date(cycle.end_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'pronto';
    let successCount = 0;
    let skippedCount = 0;

    for (const evaluator of pending) {
      if (!evaluator.email) {
        skippedCount++;
        continue;
      }
      const self = evaluator.id === evaluatedId;
      const evaluatorName = escapeHtml(evaluator.full_name).split(' ')[0];
      const evaluatedName = escapeHtml(evaluated.full_name);
      const subject = self
        ? `Autoevaluación pendiente: ${cycle.name}`
        : `Evaluación pendiente: ${evaluated.full_name}`;
      const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#24364b"><h2 style="color:#1b6ca8">Evaluación de desempeño</h2><p>Hola <strong>${evaluatorName}</strong>,</p><p>Tienes pendiente ${self ? 'tu autoevaluación' : `la evaluación de ${evaluatedName}`} del ciclo <strong>${escapeHtml(cycle.name)}</strong>.</p><p>Te pedimos completarla antes del <strong>${escapeHtml(deadline)}</strong>.</p><p><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#1b6ca8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Ir a Plataforma RH</a></p></div>`;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: evaluator.email, subject, html }),
      });
      if (response.ok) successCount++;
      else skippedCount++;
    }

    return json({
      success: true,
      successCount,
      skippedCount,
      pendingCount: pending.length,
      message: successCount ? `Se enviaron ${successCount} aviso${successCount === 1 ? '' : 's'}.` : 'No había evaluaciones pendientes con correo disponible.',
    });
  } catch (error) {
    console.error(error);
    return json({ success: false, message: 'Internal error' }, 500);
  }
});
