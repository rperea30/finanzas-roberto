-- Permite registrar cada ingreso RECIBIDO (no solo una meta mensual),
-- para comparar ingresos reales vs gastos reales.
-- Ejecutar UNA sola vez en el SQL Editor de Supabase.

create table if not exists income_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  income_source_id uuid references income_sources(id) on delete set null,
  created_by uuid not null references auth.users(id),
  entry_date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists income_entries_household_date_idx on income_entries (household_id, entry_date desc);

alter table income_entries enable row level security;

create policy "income_entries: all if member" on income_entries
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));
