import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatScore } from './format';
import type { buildEvaluationSummary } from './evaluationSummary';

type Summary = ReturnType<typeof buildEvaluationSummary>;

const LOW_SCORE = 0.7;

function formatDiff(self: number | null, collective: number | null) {
  if (self === null || collective === null) return <span className="evaluation-diff none">—</span>;
  const points = Math.round((collective - self) * 100);
  const tone = points > 0 ? 'up' : points < 0 ? 'down' : 'even';
  return <span className={`evaluation-diff ${tone}`}>{points > 0 ? '+' : ''}{points}%</span>;
}

function collectiveTone(value: number | null) {
  return value === null ? '' : value >= 0.75 ? 'good' : value >= 0.5 ? 'warn' : 'bad';
}

export function EvaluationResultsTable({ categories, questionScores }: { categories: Summary['categories']; questionScores: Summary['questionScores'] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  const allOpen = collapsed.size === 0;
  const numbers = new Map(categories.flatMap((category) => category.questions).map((question, index) => [question.id, index + 1]));

  return <div className="evaluation-results">
    <div className="evaluation-results-toolbar">
      <button type="button" className="secondary" onClick={() => setCollapsed(allOpen ? new Set(categories.map((category) => category.key)) : new Set())}>{allOpen ? 'Contraer todo' : 'Expandir todo'}</button>
    </div>
    <div className="evaluation-results-grid evaluation-results-head" aria-hidden="true">
      <span>Categoría / reactivo</span><span>Preguntas</span><span>Autoevaluación</span><span>Colectiva</span><span>Diferencia</span>
    </div>
    {categories.map((category) => {
      const open = !collapsed.has(category.key);
      return <div className="evaluation-results-category" key={category.key}>
        <button type="button" className="evaluation-results-grid evaluation-results-row is-category" onClick={() => toggle(category.key)} aria-expanded={open}>
          <span className="evaluation-results-name"><ChevronRight size={16} className={open ? 'is-open' : ''} /><strong>{category.label}</strong></span>
          <span><i className="evaluation-count">{category.questions.length}</i></span>
          <span className="evaluation-score">{formatScore(category.selfScore)}</span>
          <span className={`evaluation-score ${collectiveTone(category.collectiveScore)}`}>{formatScore(category.collectiveScore)}</span>
          <span>{formatDiff(category.selfScore, category.collectiveScore)}</span>
        </button>
        {category.questions.map((question) => {
          const scores = questionScores.get(question.id);
          const self = scores?.self ?? null;
          const collective = scores?.collective ?? null;
          const low = (self !== null && self < LOW_SCORE) || (collective !== null && collective < LOW_SCORE);
          return <div className={`evaluation-results-grid evaluation-results-row is-question${open ? '' : ' is-collapsed'}`} key={question.id}>
            <span className="evaluation-results-name"><small>#{numbers.get(question.id)}</small><span>{question.question_text}{low && <em className="evaluation-low-badge">Oportunidad de mejora</em>}</span></span>
            <span className="evaluation-score muted">–</span>
            <span className={`evaluation-score ${self !== null && self < 0.75 ? 'warn' : ''}`}>{formatScore(self)}</span>
            <span className={`evaluation-score ${collectiveTone(collective)}`}>{formatScore(collective)}</span>
            <span>{formatDiff(self, collective)}</span>
          </div>;
        })}
      </div>;
    })}
  </div>;
}
