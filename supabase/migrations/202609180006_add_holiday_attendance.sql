alter type public.attendance_status add value if not exists 'holiday';

alter table public.timesheets drop constraint if exists timesheets_schedule_check;
alter table public.timesheets add constraint timesheets_schedule_check check (
  (attendance = 'worked'
    and mode is not null and entry_time is not null and exit_time is not null and exit_time > entry_time
    and ((mode = 'schedule_permission' and permission_entry_time is not null and permission_exit_time is not null and permission_exit_time > permission_entry_time)
      or (mode <> 'schedule_permission' and permission_entry_time is null and permission_exit_time is null)))
  or (attendance <> 'worked'
    and mode is null and entry_time is null and exit_time is null
    and permission_entry_time is null and permission_exit_time is null)
);
