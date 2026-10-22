-- My Fitness: Bluetooth Heart Rate session data
-- Raw BLE readings are processed locally. Only reduced ~5-second graph samples
-- and final HR/recovery values are stored in Supabase.

alter table public.cardio_sessions
  add column if not exists cardio_start_hr numeric,
  add column if not exists cardio_end_hr numeric,
  add column if not exists hr_recovery_1hr numeric,
  add column if not exists hr_recovery_2hr numeric,
  add column if not exists hr_samples jsonb;

comment on column public.cardio_sessions.hr_samples is
  'Reduced HR graph samples generated locally from approximately 5-second time windows; raw BLE readings are not stored here.';
