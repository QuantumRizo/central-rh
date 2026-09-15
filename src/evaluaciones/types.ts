export type EvaluationType = 'self' | 'peer';

export type EvaluationCycle = {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'closed';
  start_date: string | null;
  end_date: string | null;
  evaluated_employee_id: string | null;
};

export type EvaluationEmployee = {
  id: string;
  full_name: string;
  position: string;
  department: string | null;
};

export type EvaluationQuestion = {
  id: string;
  question_text: string;
  category: string;
  max_score: number;
  question_order: number | null;
  is_inverted: boolean;
};

export type EvaluationAssignment = {
  id: string;
  cycle_id: string;
  evaluated_id: string;
  evaluator_id: string;
};

export type EvaluationResponse = {
  id: string;
  cycle_id: string;
  question_id: string;
  evaluator_id: string;
  evaluated_id: string;
  score: number;
  evaluation_type: EvaluationType;
};

export type EvaluationComment = {
  id: string;
  cycle_id: string;
  evaluator_id: string;
  evaluated_id: string;
  evaluation_type: EvaluationType;
  comment: string | null;
  strengths: string | null;
  opportunities: string | null;
};

export type EvaluationFinalReport = {
  id: string;
  cycle_id: string;
  employee_id: string;
  self_score: number | null;
  collective_score: number | null;
  admin_summary: string | null;
  strengths: string | null;
  opportunities: string | null;
  final_score: number | null;
  is_exported: boolean;
};

export type EvaluationTask = {
  id: string;
  type: EvaluationType;
  cycle: EvaluationCycle;
  target: EvaluationEmployee;
  completed: boolean;
  hasResponses: boolean;
  hasComment: boolean;
};

export const SCORE_OPTIONS = [
  { label: 'Casi nunca', value: 0.25 },
  { label: 'A veces', value: 0.5 },
  { label: 'Casi siempre', value: 0.75 },
  { label: 'Siempre', value: 1 },
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  orientacion_resultados: 'Orientación a Resultados',
  pensamiento_estrategico: 'Pensamiento Estratégico',
  calidad_mejora_continua: 'Calidad y Mejora Continua',
  relaciones_interpersonales: 'Relaciones Interpersonales',
  iniciativa: 'Iniciativa',
  trabajo_equipo: 'Trabajo en Equipo',
  organizacion: 'Organización',
  comunicacion: 'Comunicación',
};
