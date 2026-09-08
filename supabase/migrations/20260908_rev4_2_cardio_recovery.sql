-- My Fitness Rev 4.2: add two-minute heart-rate recovery
alter table public.cardio_sessions add column if not exists hr_recovery_2min numeric;
