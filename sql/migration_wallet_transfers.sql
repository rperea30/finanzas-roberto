-- Permite mover dinero de tus ingresos hacia un wallet (ej. Yappy/Efectivo),
-- para reflejar cuánto decides destinar a gasto real.

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
