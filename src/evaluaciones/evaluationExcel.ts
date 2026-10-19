import { averageNumber } from './format';
import { categoryKeys } from './evaluationSummary';
import { CATEGORY_LABELS } from './types';
import type { EvaluationComment, EvaluationCycle, EvaluationEmployee, EvaluationFinalReport, EvaluationQuestion, EvaluationResponse } from './types';

type ExportParticipant = { evaluatorId: string; employee?: EvaluationEmployee; status: string };

const HEADER_FILL = 'FF156082';
const BAND_FILL = 'FFDCE6F1';
const FIXED_COLUMNS = ['Ciclo', 'Evaluado', 'Área del evaluado', 'Evaluador', 'Área del evaluador', 'Tipo de evaluación', 'Estado'];

export async function downloadEvaluationWorkbook({ cycle, evaluated, participants, questions, responses, comments, report, selfScore, collectiveScore, fileLabel }: {
  cycle: EvaluationCycle;
  evaluated?: EvaluationEmployee;
  participants: ExportParticipant[];
  questions: EvaluationQuestion[];
  responses: EvaluationResponse[];
  comments: EvaluationComment[];
  report?: EvaluationFinalReport;
  selfScore: number | null;
  collectiveScore: number | null;
  fileLabel?: string;
}) {
  const { default: ExcelJS } = await import('exceljs');
  const evaluatedId = cycle.evaluated_employee_id;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Resumen', { views: [{ state: 'frozen', xSplit: 4, ySplit: 2 }] });

  // Columnas: fijas, luego cada categoría con sus reactivos seguidos de su promedio.
  const categories = categoryKeys(questions).map((key) => ({ key, questions: questions.filter((question) => question.category === key) }));
  const layout: { header: string; kind: 'fixed' | 'question' | 'category' | 'summary'; question?: EvaluationQuestion; category?: string }[] = [
    ...FIXED_COLUMNS.map((header) => ({ header, kind: 'fixed' as const })),
    ...categories.flatMap(({ key, questions: items }) => [
      ...items.map((question) => ({ header: question.question_text, kind: 'question' as const, question })),
      { header: CATEGORY_LABELS[key] ?? key, kind: 'category' as const, category: key },
    ]),
    ...['Autoevaluación consolidada', 'Evaluación colectiva consolidada', 'Resultado final', 'Resumen administrativo'].map((header) => ({ header, kind: 'summary' as const })),
  ];

  const bandRow = sheet.getRow(1);
  const headerRow = sheet.getRow(2);
  layout.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet.getColumn(index + 1).width = column.kind === 'fixed' ? (index === 0 ? 34 : 24) : column.kind === 'summary' ? 16 : column.kind === 'category' ? 14 : 18;
  });
  headerRow.height = 86;
  [4, 5, 6].forEach((index) => { sheet.getColumn(index + 1).hidden = true; });
  sheet.getColumn(layout.length).width = 60;

  let position = FIXED_COLUMNS.length + 1;
  for (const { key, questions: items } of categories) {
    const first = position;
    const last = position + items.length - 1;
    if (last > first) sheet.mergeCells(1, first, 1, last);
    const band = bandRow.getCell(first);
    band.value = CATEGORY_LABELS[key] ?? key;
    band.font = { bold: true };
    band.alignment = { horizontal: 'center' };
    for (let col = first; col <= last; col++) bandRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } };
    position = last + 2;
  }

  // Autoevaluación primero; después los evaluadores con respuesta completa (los que entran en el promedio vertical) y al final el resto.
  const isSelf = (participant: ExportParticipant) => participant.evaluatorId === evaluatedId;
  const isComplete = (participant: ExportParticipant) => participant.status === 'Respondió';
  const selfRows = participants.filter(isSelf);
  const peerRows = participants.filter((participant) => !isSelf(participant) && isComplete(participant));
  const otherRows = participants.filter((participant) => !isSelf(participant) && !isComplete(participant));
  const ordered = [...selfRows, ...peerRows, ...otherRows];
  const percent = (value: number | null | undefined) => (value === null || value === undefined ? null : Number(value));
  const isPercentColumn = (column: (typeof layout)[number]) => column.kind === 'question' || column.kind === 'category' || (column.kind === 'summary' && column.header !== 'Resumen administrativo');
  const letter = (index: number) => sheet.getColumn(index + 1).letter;

  const addEvaluatorRow = ({ evaluatorId, employee, status }: ExportParticipant) => {
    const byQuestion = new Map(responses
      .filter((response) => response.evaluator_id === evaluatorId && response.evaluated_id === evaluatedId)
      .map((response) => [response.question_id, Number(response.score)]));
    const row = sheet.addRow(layout.map((column) => {
      if (column.kind === 'question') return byQuestion.get(column.question!.id) ?? null;
      if (column.kind === 'category') return null;
      switch (column.header) {
        case 'Ciclo': return cycle.name;
        case 'Evaluado': return evaluated?.full_name ?? '';
        case 'Área del evaluado': return evaluated?.department ?? '';
        case 'Evaluador': return employee?.full_name ?? '';
        case 'Área del evaluador': return employee?.department ?? '';
        case 'Tipo de evaluación': return evaluatorId === evaluatedId ? 'Autoevaluación' : 'Colectiva';
        case 'Estado': return status;
        case 'Autoevaluación consolidada': return selfScore;
        case 'Evaluación colectiva consolidada': return collectiveScore;
        case 'Resultado final': return percent(report?.final_score);
        default: return report?.admin_summary ?? '';
      }
    }));
    // Promedio horizontal: cada categoría promedia sus reactivos en esa fila.
    layout.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      if (column.kind === 'category') {
        const values = questions.filter((question) => question.category === column.category && byQuestion.has(question.id)).map((question) => byQuestion.get(question.id) ?? 0);
        const count = categories.find((category) => category.key === column.category)?.questions.length ?? 0;
        const average = averageNumber(values);
        if (average !== null) cell.value = { formula: `AVERAGE(${letter(index - count)}${row.number}:${letter(index - 1)}${row.number})`, result: average };
      }
      if (isPercentColumn(column)) {
        cell.numFmt = '0%';
        cell.alignment = { horizontal: 'center' };
      }
      if (column.kind === 'category') cell.font = { bold: true };
    });
    return row;
  };

  selfRows.forEach(addEvaluatorRow);
  const peerStart = sheet.rowCount + 1;
  peerRows.forEach(addEvaluatorRow);
  const peerEnd = sheet.rowCount;

  // Promedio vertical: promedio colectivo de cada reactivo y categoría (solo evaluadores con respuesta completa).
  if (peerRows.length) {
    const totals = sheet.addRow(layout.map((column, index) => {
      if (column.header === 'Evaluador') return 'Promedio colectivo';
      if (column.kind !== 'question' && column.kind !== 'category') return null;
      const values = Array.from({ length: peerEnd - peerStart + 1 }, (_, offset) => sheet.getRow(peerStart + offset).getCell(index + 1).value)
        .map((value) => (typeof value === 'number' ? value : value && typeof value === 'object' && 'result' in value ? Number(value.result) : null))
        .filter((value): value is number => value !== null && Number.isFinite(value));
      const average = averageNumber(values);
      return average === null ? null : { formula: `AVERAGE(${letter(index)}${peerStart}:${letter(index)}${peerEnd})`, result: average };
    }));
    totals.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } };
      cell.border = { top: { style: 'thin' } };
      if (typeof cell.value === 'object' && cell.value !== null) { cell.numFmt = '0%'; cell.alignment = { horizontal: 'center' }; }
    });
  }

  otherRows.forEach(addEvaluatorRow);

  const commentSheet = workbook.addWorksheet('Fortalezas y oportunidades', { views: [{ state: 'frozen', ySplit: 1 }] });
  commentSheet.columns = [
    { header: 'Evaluador', width: 30 },
    { header: 'Área del evaluador', width: 22 },
    { header: 'Comentario general', width: 50 },
    { header: 'Fortalezas', width: 70 },
    { header: 'Oportunidades', width: 70 },
  ];
  commentSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  for (const { evaluatorId, employee } of ordered) {
    const comment = comments.find((item) => item.evaluator_id === evaluatorId && item.evaluated_id === evaluatedId);
    const row = commentSheet.addRow([employee?.full_name ?? '', employee?.department ?? '', comment?.comment ?? '', comment?.strengths ?? '', comment?.opportunities ?? '']);
    row.alignment = { vertical: 'top', wrapText: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  const slug = (fileLabel || cycle.name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() || 'ciclo';
  link.download = `resumen_evaluacion_${slug}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
