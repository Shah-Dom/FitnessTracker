-- Revision 3 does NOT create or seed the equipment table.
-- Your existing public.equipment table is used as-is.
-- Run this only if Add/Edit/Delete Equipment reports an RLS permission error.

alter table public.equipment enable row level security;

create policy "Authenticated users can add equipment"
on public.equipment for insert to authenticated
with check (true);

create policy "Authenticated users can edit equipment"
on public.equipment for update to authenticated
using (true) with check (true);

create policy "Authenticated users can delete equipment"
on public.equipment for delete to authenticated
using (true);
