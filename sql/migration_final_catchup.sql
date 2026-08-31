-- Script final único: deja la base de datos correcta sin importar qué
-- scripts hayas corrido antes. Seguro de correr aunque ya exista algo.

-- 1) Tabla de transferencias de ingresos a wallets
create table if not exists wallet_transfers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  payment_method_id uuid not null references payment_methods(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  amount numeric(12,2) not null check (amount > 0),
  transfer_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists wallet_transfers_household_idx on wallet_transfers (household_id, transfer_date desc);

alter table wallet_transfers enable row level security;

drop policy if exists "wallet_transfers: all if member" on wallet_transfers;
create policy "wallet_transfers: all if member" on wallet_transfers
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- 2) Corrige si el ingreso de Salario quedó duplicado (deja solo un registro de 489.34)
do $$
declare
  v_household_id uuid;
  v_user_id uuid;
  v_salario_id uuid;
begin
  select hm.household_id, hm.user_id into v_household_id, v_user_id
  from household_members hm
  join auth.users u on u.id = hm.user_id
  where u.email = 'roberto300@live.com'
  limit 1;

  if v_household_id is null then
    raise exception 'No se encontró tu hogar.';
  end if;

  select id into v_salario_id from income_sources
  where household_id = v_household_id and name = 'Salario';

  if v_salario_id is not null then
    delete from income_entries
    where household_id = v_household_id
      and income_source_id = v_salario_id
      and notes = 'Efectivo (Yappy) inicial migrado del Excel';

    insert into income_entries (household_id, income_source_id, created_by, entry_date, amount, notes)
    values (v_household_id, v_salario_id, v_user_id, current_date, 489.34, 'Efectivo (Yappy) inicial migrado del Excel');

    update income_sources set monthly_amount = 489.34 where id = v_salario_id;
  end if;
end $$;
