-- Nuevos motivos de no asistencia: día personal e incapacidad.
-- timesheets_schedule_check ya acepta cualquier valor distinto de 'worked' sin horario.
alter type public.attendance_status add value if not exists 'personal_day';
alter type public.attendance_status add value if not exists 'sick_leave';
