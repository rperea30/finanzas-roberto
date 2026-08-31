-- Agrega: saldo inicial por método de pago (ej. Yappy/Efectivo) + ingresos mensuales.
-- Ejecutar UNA sola vez en el SQL Editor de Supabase.

alter table payment_methods add column if not exists starting_balance numeric(12,2);

create table if not exists income_sources (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  monthly_amount numeric(12,2) not null default 0,
  color text not null default '#22c55e',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table income_sources enable row level security;

create policy "income_sources: all if member" on income_sources
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- Datos iniciales para tu hogar
do $$
declare
  v_household_id uuid;
begin
  select hm.household_id into v_household_id
  from household_members hm
  join auth.users u on u.id = hm.user_id
  where u.email = 'roberto300@live.com'
  limit 1;

  if v_household_id is null then
    raise exception 'No se encontró tu hogar.';
  end if;

  update payment_methods set starting_balance = 489.34
  where household_id = v_household_id and name = 'Yappy / Efectivo';

  insert into income_sources (household_id, name, monthly_amount, color) values
    (v_household_id, 'Salario', 0, '#3987e5'),
    (v_household_id, 'Magist TV', 0, '#9085e9'),
    (v_household_id, 'Manejo de redes sociales', 0, '#d55181');
end $$;
