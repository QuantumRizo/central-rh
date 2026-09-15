import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';

const APPLY = process.argv.includes('--apply');
const CREATE_MISSING = process.argv.includes('--create-missing');
const sourceUrl = process.env.EVAL_SUPABASE_URL;
const sourceKey = process.env.EVAL_SUPABASE_SERVICE_ROLE_KEY;
const targetUrl = process.env.SUPABASE_URL;
const targetKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!sourceUrl || !sourceKey || !targetUrl || !targetKey) {
  throw new Error(
    'Define EVAL_SUPABASE_URL, EVAL_SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.',
  );
}

const source = createClient(sourceUrl, sourceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const target = createClient(targetUrl, targetKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sourceTables = {
  employees: 'employees',
  cycles: 'evaluation_cycles',
  questions: 'questions',
  responses: 'responses',
  assignments: 'evaluation_assignments',
  comments: 'evaluation_comments',
  reports: 'final_reports',
};

const targetTables = {
  cycles: 'evaluation_cycles',
  questions: 'evaluation_questions',
  responses: 'evaluation_responses',
  assignments: 'evaluation_assignments',
  comments: 'evaluation_comments',
  reports: 'evaluation_final_reports',
};

const employeeAliases = JSON.parse(
  await readFile(new URL('./evaluacion-employee-map.json', import.meta.url), 'utf8'),
);

const idOf = (row, label) => {
  const id = row.id ?? row.$id;
  if (!id) throw new Error(`Registro de ${label} sin id.`);
  return String(id);
};

const normalized = (value) => String(value ?? '').trim().toLocaleLowerCase('es-MX');

async function fetchAll(client, table) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

async function upsertInBatches(table, rows) {
  if (!APPLY || rows.length === 0) return;
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const { error } = await target
      .from(table)
      .upsert(batch, { onConflict: 'legacy_id' });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function insertInBatches(table, rows) {
  if (!APPLY || rows.length === 0) return;
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const { error } = await target.from(table).insert(batch);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

function buildUniqueIndex(rows, field) {
  const index = new Map();
  for (const row of rows) {
    const key = normalized(row[field]);
    if (!key) continue;
    const matches = index.get(key) ?? [];
    matches.push(row);
    index.set(key, matches);
  }
  return index;
}

function resolveEmployee(sourceEmployee, byEmail, byName) {
  const aliasName = employeeAliases[normalized(sourceEmployee.email)];
  const emailMatches = byEmail.get(normalized(sourceEmployee.email)) ?? [];
  const aliasMatches = aliasName ? byName.get(normalized(aliasName)) ?? [] : [];
  const nameMatches = byName.get(normalized(sourceEmployee.name ?? sourceEmployee.full_name)) ?? [];
  const candidates = aliasMatches.length ? aliasMatches : emailMatches.length ? emailMatches : nameMatches;
  if (candidates.length !== 1) {
    return {
      sourceId: idOf(sourceEmployee, 'employees'),
      name: sourceEmployee.name ?? sourceEmployee.full_name ?? '',
      email: sourceEmployee.email ?? '',
      reason: candidates.length ? 'coincidencia ambigua' : 'sin coincidencia',
      candidateIds: candidates.map((candidate) => candidate.id),
      aliasName: aliasName ?? null,
    };
  }
  return candidates[0];
}

function requireEmployee(employeeMap, sourceId, context) {
  const targetId = employeeMap.get(String(sourceId));
  if (!targetId) throw new Error(`Empleado sin equivalencia para ${context}: ${sourceId}`);
  return targetId;
}

function requireMapped(map, sourceId, context) {
  const targetId = map.get(String(sourceId));
  if (!targetId) throw new Error(`ID sin equivalencia para ${context}: ${sourceId}`);
  return targetId;
}

function dedupeRows(rows, keyOf) {
  return [...new Map(rows.map((row) => [keyOf(row), row])).values()];
}

async function importRows(table, rows) {
  await upsertInBatches(targetTables[table], rows);
  const imported = APPLY
    ? await fetchAll(target, targetTables[table])
    : rows.map((row) => ({ id: `dry-run-${row.legacy_id}`, legacy_id: row.legacy_id }));
  return new Map(imported.filter((row) => row.legacy_id).map((row) => [String(row.legacy_id), row.id]));
}

const [sourceEmployees, sourceCycles, sourceQuestions, sourceResponses, sourceAssignments, sourceComments, sourceReports, targetEmployees] = await Promise.all([
  fetchAll(source, sourceTables.employees),
  fetchAll(source, sourceTables.cycles),
  fetchAll(source, sourceTables.questions),
  fetchAll(source, sourceTables.responses),
  fetchAll(source, sourceTables.assignments),
  fetchAll(source, sourceTables.comments),
  fetchAll(source, sourceTables.reports),
  fetchAll(target, 'employees'),
]);

const byEmail = buildUniqueIndex(targetEmployees, 'email');
const byName = buildUniqueIndex(targetEmployees, 'full_name');
const employeeMap = new Map();
const unresolvedEmployees = [];
for (const sourceEmployee of sourceEmployees) {
  const match = resolveEmployee(sourceEmployee, byEmail, byName);
  if (match.reason) unresolvedEmployees.push(match);
  else employeeMap.set(idOf(sourceEmployee, 'employees'), match.id);
}

const printSummary = () => {
  console.log(`Modo: ${APPLY ? 'APLICAR' : 'SIMULACIÓN (sin escrituras)'}`);
  console.log(`Empleados fuente: ${sourceEmployees.length}; equivalencias: ${employeeMap.size}; pendientes: ${unresolvedEmployees.length}`);
  console.log(`Ciclos: ${sourceCycles.length}; preguntas: ${sourceQuestions.length}; respuestas: ${sourceResponses.length}`);
  console.log(`Asignaciones: ${sourceAssignments.length}; comentarios: ${sourceComments.length}; reportes: ${sourceReports.length}`);
  if (unresolvedEmployees.length) {
    console.log('\nEmpleados que requieren revisión manual:');
    for (const employee of unresolvedEmployees) {
      console.log(`- ${employee.name} <${employee.email}>: ${employee.reason}${employee.candidateIds.length ? ` (${employee.candidateIds.join(', ')})` : ''}`);
    }
  }
};

printSummary();
if (unresolvedEmployees.length && CREATE_MISSING) {
  const missingRows = unresolvedEmployees
    .filter((employee) => employee.reason === 'sin coincidencia')
    .map((employee) => ({
      full_name: employee.name || employee.email,
      position: 'Histórico pendiente de asignar',
      status: 'Baja',
      email: employee.email || null,
    }));
  await insertInBatches('employees', missingRows);
  const refreshedEmployees = await fetchAll(target, 'employees');
  const refreshedByEmail = buildUniqueIndex(refreshedEmployees, 'email');
  const refreshedByName = buildUniqueIndex(refreshedEmployees, 'full_name');
  for (const sourceEmployee of sourceEmployees) {
    if (employeeMap.has(idOf(sourceEmployee, 'employees'))) continue;
    const match = resolveEmployee(sourceEmployee, refreshedByEmail, refreshedByName);
    if (!match.reason) employeeMap.set(idOf(sourceEmployee, 'employees'), match.id);
  }
  const stillUnresolved = sourceEmployees.filter((employee) => !employeeMap.has(idOf(employee, 'employees')));
  if (stillUnresolved.length) throw new Error('Persisten empleados sin equivalencia después de --create-missing.');
}

if (unresolvedEmployees.length && !CREATE_MISSING) {
  console.log('\nSe excluirán del histórico los empleados sin equivalencia y todos sus registros dependientes.');
}

const cycleRows = sourceCycles.filter((row) => !row.evaluated_employee_id || employeeMap.has(String(row.evaluated_employee_id))).map((row) => ({
  legacy_id: idOf(row, 'evaluation_cycles'),
  name: row.name,
  description: row.description ?? null,
  status: row.status ?? 'draft',
  start_date: row.start_date ?? null,
  end_date: row.end_date ?? null,
  evaluated_employee_id: row.evaluated_employee_id
    ? requireEmployee(employeeMap, row.evaluated_employee_id, `ciclo ${idOf(row, 'evaluation_cycles')}`)
    : null,
}));
const cycleMap = await importRows('cycles', cycleRows);

const questionRows = sourceQuestions.map((row) => ({
  legacy_id: idOf(row, 'questions'),
  question_text: row.text,
  category: row.category,
  max_score: row.max_score ?? 1,
  question_order: row.order ?? null,
  is_inverted: row.is_inverted ?? false,
}));
const questionMap = await importRows('questions', questionRows);

const cycleSourceIds = new Set(cycleRows.map((row) => row.legacy_id));
const assignmentRows = dedupeRows(sourceAssignments.filter((row) =>
  cycleSourceIds.has(String(row.cycle_id)) &&
  employeeMap.has(String(row.evaluated_id)) &&
  employeeMap.has(String(row.evaluator_id)),
).map((row) => ({
  legacy_id: idOf(row, 'evaluation_assignments'),
  cycle_id: requireMapped(cycleMap, row.cycle_id, 'asignación.cycle_id'),
  evaluated_id: requireEmployee(employeeMap, row.evaluated_id, 'asignación.evaluated_id'),
  evaluator_id: requireEmployee(employeeMap, row.evaluator_id, 'asignación.evaluator_id'),
})), (row) => `${row.cycle_id}:${row.evaluated_id}:${row.evaluator_id}`);
await importRows('assignments', assignmentRows);

const responseRows = dedupeRows(sourceResponses.filter((row) =>
  cycleSourceIds.has(String(row.cycle_id)) &&
  employeeMap.has(String(row.evaluated_id)) &&
  employeeMap.has(String(row.evaluator_id)),
).map((row) => ({
  legacy_id: idOf(row, 'responses'),
  cycle_id: requireMapped(cycleMap, row.cycle_id, 'respuesta.cycle_id'),
  question_id: requireMapped(questionMap, row.question_id, 'respuesta.question_id'),
  evaluator_id: requireEmployee(employeeMap, row.evaluator_id, 'respuesta.evaluator_id'),
  evaluated_id: requireEmployee(employeeMap, row.evaluated_id, 'respuesta.evaluated_id'),
  score: row.score,
  evaluation_type: row.evaluation_type,
})), (row) => `${row.cycle_id}:${row.question_id}:${row.evaluator_id}:${row.evaluated_id}`);
await importRows('responses', responseRows);

const commentRows = dedupeRows(sourceComments.filter((row) =>
  cycleSourceIds.has(String(row.cycle_id)) &&
  employeeMap.has(String(row.evaluated_id)) &&
  employeeMap.has(String(row.evaluator_id)),
).map((row) => ({
  legacy_id: idOf(row, 'evaluation_comments'),
  cycle_id: requireMapped(cycleMap, row.cycle_id, 'comentario.cycle_id'),
  evaluator_id: requireEmployee(employeeMap, row.evaluator_id, 'comentario.evaluator_id'),
  evaluated_id: requireEmployee(employeeMap, row.evaluated_id, 'comentario.evaluated_id'),
  evaluation_type: row.evaluation_type,
  comment: row.comment ?? null,
  strengths: row.strengths ?? null,
  opportunities: row.opportunities ?? null,
})), (row) => `${row.cycle_id}:${row.evaluator_id}:${row.evaluated_id}:${row.evaluation_type}`);
await importRows('comments', commentRows);

const reportRows = dedupeRows(sourceReports.filter((row) =>
  cycleSourceIds.has(String(row.cycle_id)) &&
  employeeMap.has(String(row.employee_id)),
).map((row) => ({
  legacy_id: idOf(row, 'final_reports'),
  cycle_id: requireMapped(cycleMap, row.cycle_id, 'reporte.cycle_id'),
  employee_id: requireEmployee(employeeMap, row.employee_id, 'reporte.employee_id'),
  self_score: row.self_score ?? null,
  collective_score: row.collective_score ?? null,
  admin_summary: row.admin_summary ?? null,
  strengths: row.strengths ?? null,
  opportunities: row.opportunities ?? null,
  final_score: row.final_score ?? null,
  is_exported: row.is_exported ?? false,
})), (row) => `${row.cycle_id}:${row.employee_id}`);
await importRows('reports', reportRows);

if (APPLY) {
  console.log('\nMigración terminada. Verifica conteos y autenticación antes de habilitar el módulo.');
} else {
  console.log('\nSimulación terminada. Usa --apply únicamente después de revisar las equivalencias.');
}
