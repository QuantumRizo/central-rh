import { sb } from '../lib/supabase';
import { hasAllResponses, hasRequiredComments } from './taskUtils';
import type { EvaluationAssignment, EvaluationComment, EvaluationEmployee, EvaluationQuestion, EvaluationResponse } from './types';

export type CycleData = {
  assignments: EvaluationAssignment[];
  employees: EvaluationEmployee[];
  responses: EvaluationResponse[];
  comments: EvaluationComment[];
  questions: EvaluationQuestion[];
};

export type Participant = {
  assignment: EvaluationAssignment;
  employee?: EvaluationEmployee;
  answered: number;
  complete: boolean;
  started: boolean;
};

export async function loadCycleData(cycleId: string, evaluatedId: string | null): Promise<CycleData> {
  const [assignments, responses, comments, questionResult] = await Promise.all([
    fetchCycleRows<EvaluationAssignment>('evaluation_assignments', cycleId),
    fetchCycleRows<EvaluationResponse>('evaluation_responses', cycleId),
    fetchCycleRows<EvaluationComment>('evaluation_comments', cycleId),
    sb.from('evaluation_questions').select('*').order('question_order'),
  ]);
  if (questionResult.error) throw questionResult.error;
  const ids = [...new Set([...assignments.map((row) => row.evaluator_id), evaluatedId].filter((id): id is string => Boolean(id)))];
  const employeeResult = ids.length
    ? await sb.from('employees').select('id,full_name,position,department').in('id', ids)
    : { data: [], error: null };
  if (employeeResult.error) throw employeeResult.error;
  return {
    assignments,
    employees: (employeeResult.data ?? []) as EvaluationEmployee[],
    responses,
    comments,
    questions: (questionResult.data ?? []) as EvaluationQuestion[],
  };
}

export function buildParticipants({ assignments, employees, responses, comments, questions }: CycleData, evaluatedId: string | null): Participant[] {
  return assignments
    .filter((assignment) => assignment.evaluated_id === evaluatedId)
    .map((assignment) => {
      const ownResponses = responses.filter((response) => response.evaluator_id === assignment.evaluator_id && response.evaluated_id === assignment.evaluated_id);
      const comment = comments.find((item) => item.evaluator_id === assignment.evaluator_id && item.evaluated_id === assignment.evaluated_id);
      const answered = new Set(ownResponses.map((response) => response.question_id)).size;
      return {
        assignment,
        employee: employees.find((employee) => employee.id === assignment.evaluator_id),
        answered,
        complete: hasAllResponses(ownResponses, questions) && hasRequiredComments(comment),
        started: answered > 0 || Boolean(comment?.strengths?.trim() || comment?.opportunities?.trim()),
      };
    }).sort((a, b) => Number(a.complete) - Number(b.complete) || Number(a.started) - Number(b.started) || (a.employee?.full_name ?? '').localeCompare(b.employee?.full_name ?? '', 'es'));
}

export function participantStatus(participant: Participant) {
  return participant.complete ? 'Respondió' : participant.started ? 'En curso' : 'Sin responder';
}

async function fetchCycleRows<T>(table: 'evaluation_assignments' | 'evaluation_responses' | 'evaluation_comments', cycleId: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.from(table).select('*').eq('cycle_id', cycleId).order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []) as T[]);
    if ((data?.length ?? 0) < 1000) return rows;
  }
}
