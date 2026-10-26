import { attendanceLabel } from '../attendance';
import { workedHours } from '../utils';
import { summarizeActivities, type ActivityBreakdown, type ReportSheet } from '../reportData';
import type { Worksheet } from 'exceljs';

const modeLabel = (mode: string | null) => ({ office: 'Presencial', home_office: 'Home Office', schedule_permission: 'Permiso de horario' })[mode || ''] || mode || '';
const excelDate = (value: string) => new Date(`${value}T12:00:00`);
const slug = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function downloadTimesheetWorkbook(sheets: any[], employeeId: string, name: string, from: string, to: string, includeBreakdowns = false) {
  const own = sheets.filter(sheet => sheet.employee_id === employeeId).sort((a, b) => a.work_date.localeCompare(b.work_date));
  if (!own.length) return;
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Central RH';
  workbook.subject = `Timesheets de ${name} del ${from} al ${to}`;
  const blue = 'FF20304A';
  const white = 'FFFFFFFF';
  const dateFormat = 'dd/mm/yyyy';
  const styleHeader = (sheet: Worksheet) => {
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    sheet.getRow(1).height = 30;
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const summary = workbook.addWorksheet('Resumen');
  summary.columns = [{ header: 'Mes', width: 18 }, { header: 'Capturas', width: 16 }, { header: 'Trabajados', width: 16 }, { header: 'Ausencias y feriados', width: 23 }, { header: 'Horas registradas', width: 20 }];
  styleHeader(summary);
  const months = new Map<string, any[]>();
  for (const sheet of own) {
    const key = sheet.work_date.slice(0, 7);
    months.set(key, [...(months.get(key) || []), sheet]);
  }
  for (const cursor = new Date(`${from.slice(0, 7)}-01T12:00:00`); cursor <= new Date(`${to.slice(0, 7)}-01T12:00:00`); cursor.setMonth(cursor.getMonth() + 1)) {
    const month = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const items = months.get(month) || [];
    const row = summary.addRow([excelDate(`${month}-01`), items.length, items.filter(s => s.attendance === 'worked').length, items.filter(s => s.attendance !== 'worked').length, items.reduce((sum, s) => sum + (s.attendance === 'worked' ? workedHours(s.entry_time, s.exit_time) : 0), 0)]);
    row.getCell(1).numFmt = 'mmm yyyy';
    row.getCell(5).numFmt = '0.00';
  }
  summary.addRow([]);
  summary.addRow(['Colaborador', name]);
  summary.addRow(['Período', `${from} al ${to}`]);
  summary.addRow(['Capturas', own.length]);
  summary.addRow(['Horas registradas', own.reduce((sum, s) => sum + (s.attendance === 'worked' ? workedHours(s.entry_time, s.exit_time) : 0), 0)]).getCell(2).numFmt = '0.00';
  summary.addRow(['Fuente', 'Central RH · timesheets']);
  summary.addRow(['Nota', 'Los porcentajes de actividades son partes del día, no horas exactas.']);

  const addBreakdown = (title: string, label: string, rows: ActivityBreakdown[]) => {
    const sheet = workbook.addWorksheet(title);
    sheet.columns = [
      { header: label, width: title === 'Por tarea' ? 75 : 40 },
      { header: 'Días con registro', width: 22 },
      { header: 'Días equivalentes', width: 22 },
      { header: '% de actividad', width: 20 },
    ];
    styleHeader(sheet);
    for (const item of rows) {
      const row = sheet.addRow([item.name, item.days, item.equivalent, item.share]);
      row.getCell(3).numFmt = '0.00';
      row.getCell(4).numFmt = '0.0%';
      if (title === 'Por tarea' && item.name.length > 80) {
        row.height = item.name.length > 140 ? 48 : 36;
        row.getCell(1).alignment = { vertical: 'middle', wrapText: true };
      }
    }
  };
  if (includeBreakdowns) {
    const breakdown = summarizeActivities(own as ReportSheet[]);
    addBreakdown('Por cliente', 'Cliente', breakdown.clients);
    addBreakdown('Por tarea', 'Tarea (actividad)', breakdown.tasks);
  }

  const daily = workbook.addWorksheet('Capturas');
  daily.columns = [
    { header: 'Fecha', width: 15 }, { header: 'Asistencia', width: 20 }, { header: 'Modalidad', width: 22 },
    { header: 'Entrada', width: 14 }, { header: 'Salida', width: 14 }, { header: 'Inicio permiso', width: 17 },
    { header: 'Fin permiso', width: 17 }, { header: 'Horas del día', width: 17 },
    { header: 'Actividades', width: 16 }, { header: 'Puesto', width: 30 },
  ];
  styleHeader(daily);
  for (const sheet of own) {
    const row = daily.addRow([excelDate(sheet.work_date), attendanceLabel(sheet.attendance), modeLabel(sheet.mode), sheet.entry_time || '', sheet.exit_time || '', sheet.permission_entry_time || '', sheet.permission_exit_time || '', sheet.attendance === 'worked' ? workedHours(sheet.entry_time, sheet.exit_time) : null, sheet.timesheet_entries?.length || 0, sheet.position_snapshot || sheet.employee?.position || '']);
    row.getCell(1).numFmt = dateFormat;
    row.getCell(8).numFmt = '0.00';
  }

  const activities = workbook.addWorksheet('Actividades');
  activities.columns = [
    { header: 'Fecha', width: 15 }, { header: 'Cliente', width: 30 }, { header: 'Actividad', width: 70 },
    { header: '% del día', width: 17 }, { header: 'Asistencia', width: 18 },
  ];
  styleHeader(activities);
  for (const sheet of own) for (const entry of sheet.timesheet_entries || []) {
    const row = activities.addRow([excelDate(sheet.work_date), entry.client?.name || 'Sin cliente', entry.activity?.name || 'Sin actividad', Number(entry.percentage) / 100, attendanceLabel(sheet.attendance)]);
    row.getCell(1).numFmt = dateFormat;
    row.getCell(4).numFmt = '0.00%';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `timesheets-${slug(name)}-${from}-${to}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
