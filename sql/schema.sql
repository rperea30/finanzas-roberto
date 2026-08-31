-- Finanzas Familiares — esquema Supabase
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > New query > Run

-- =========================================================
-- 1. HOGARES (households) — une a los dos miembros de la pareja
-- =========================================================
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mi hogar',
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  created_at timestamptz not null default now()
);

create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

-- =========================================================
-- 2. CATEGORÍAS de gasto
-- =========================================================
create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  icon text not null default '💸',
  color text not null default '#6b7280',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 3. MÉTODOS DE PAGO (tarjetas / efectivo / wallet)
--    Equivale a las hojas "Control de Gasto Diario" del Excel
-- =========================================================
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,                         -- ej. "Visa Global Bank", "Yappy / Efectivo"
  type text not null check (type in ('credit_card','debit_card','cash','wallet')),
  credit_limit numeric(12,2),
  cycle_close_day int,                        -- día de corte (1-31)
  payment_due_day int,                        -- día límite de pago
  monthly_interest_rate numeric(6,4),          -- ej. 0.02 = 2% mensual
  color text not null default '#2563eb',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 4. GASTOS del día a día (equivale al "REGISTRO DIARIO")
-- =========================================================
create table expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  expense_date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  merchant text,                               -- comercio / detalle
  notes text,
  category_id uuid references categories(id),
  payment_method_id uuid references payment_methods(id),
  photo_path text,                             -- ruta en el bucket 'receipts'
  created_at timestamptz not null default now()
);

create index expenses_household_date_idx on expenses (household_id, expense_date desc);
create index expenses_category_idx on expenses (category_id);
create index expenses_payment_method_idx on expenses (payment_method_id);

-- =========================================================
-- 5. FACTURAS / OBLIGACIONES RECURRENTES
--    Equivale a "Dashboard Financiero Mensual" (PH, ENSA, IDAAN, Más Móvil, etc.)
-- =========================================================
create table recurring_bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,                          -- ej. "ENSA (electricidad y aseo)"
  category_id uuid references categories(id),
  default_amount numeric(12,2),
  due_day int,                                 -- día del mes en que vence
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Instancia mensual de cada factura / ciclo de tarjeta (una fila por mes)
create table bill_instances (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  recurring_bill_id uuid references recurring_bills(id) on delete set null,
  payment_method_id uuid references payment_methods(id) on delete set null,
  period_month date not null,                  -- primer día del mes, ej. 2026-08-01
  cycle_label text,                            -- ej. "26 jul – 25 ago 2026"
  amount_due numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  due_date date,
  status text not null default 'pendiente' check (status in ('pendiente','pagado','parcial','vencido')),
  interest_calculated numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  check (recurring_bill_id is not null or payment_method_id is not null)
);

create index bill_instances_household_period_idx on bill_instances (household_id, period_month);

-- =========================================================
-- 6. Categorías por defecto al crear un hogar nuevo
-- =========================================================
create or replace function seed_default_categories()
returns trigger as $$
begin
  insert into categories (household_id, name, icon, color, is_default) values
    (new.id, 'Comida y restaurantes', '🍔', '#f97316', true),
    (new.id, 'Supermercado', '🛒', '#22c55e', true),
    (new.id, 'Transporte', '🚗', '#3b82f6', true),
    (new.id, 'Servicios y facturas', '🧾', '#a855f7', true),
    (new.id, 'Salud', '🏥', '#ef4444', true),
    (new.id, 'Hogar', '🏠', '#0ea5e9', true),
    (new.id, 'Entretenimiento', '🎬', '#eab308', true),
    (new.id, 'Ropa', '👕', '#ec4899', true),
    (new.id, 'Educación', '📚', '#14b8a6', true),
    (new.id, 'Otros', '💸', '#6b7280', true);
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_seed_categories
  after insert on households
  for each row execute function seed_default_categories();

-- =========================================================
-- 6b. Funciones para crear/unirse a un hogar de forma atómica
--     (evitan el problema de RLS al leer una fila recién creada
--     antes de que exista la membresía)
-- =========================================================
create or replace function create_household(p_name text, p_display_name text)
returns households as $$
declare
  new_household households;
begin
  insert into households (name) values (p_name) returning * into new_household;
  insert into household_members (household_id, user_id, display_name)
  values (new_household.id, auth.uid(), p_display_name);
  return new_household;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function join_household(p_invite_code text, p_display_name text)
returns households as $$
declare
  h households;
begin
  select * into h from households where invite_code = trim(p_invite_code);
  if h.id is null then
    raise exception 'Código de invitación no válido.';
  end if;
  insert into household_members (household_id, user_id, display_name)
  values (h.id, auth.uid(), p_display_name);
  return h;
end;
$$ language plpgsql security definer set search_path = public;

-- =========================================================
-- 7. Seguridad: Row Level Security — cada hogar solo ve sus datos
-- =========================================================
alter table households enable row level security;
alter table household_members enable row level security;
alter table categories enable row level security;
alter table payment_methods enable row level security;
alter table expenses enable row level security;
alter table recurring_bills enable row level security;
alter table bill_instances enable row level security;

-- Función auxiliar: ¿el usuario actual pertenece a este hogar?
create or replace function is_household_member(h_id uuid)
returns boolean as $$
  select exists (
    select 1 from household_members
    where household_id = h_id and user_id = auth.uid()
  );
$$ language sql stable security definer;

-- households: se puede crear (el creador se agrega luego como member);
-- se puede ver/editar si eres miembro
create policy "households: select if member" on households
  for select using (is_household_member(id));
create policy "households: insert anyone authenticated" on households
  for insert with check (auth.uid() is not null);
create policy "households: update if member" on households
  for update using (is_household_member(id));

-- household_members: puedes ver a los miembros de tu propio hogar;
-- puedes insertarte a ti mismo (para unirte con código de invitación)
create policy "members: select if same household" on household_members
  for select using (is_household_member(household_id));
create policy "members: insert self" on household_members
  for insert with check (user_id = auth.uid());

-- categories / payment_methods / expenses / recurring_bills / bill_instances:
-- CRUD completo si eres miembro del hogar
create policy "categories: all if member" on categories
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "payment_methods: all if member" on payment_methods
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "expenses: all if member" on expenses
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "recurring_bills: all if member" on recurring_bills
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "bill_instances: all if member" on bill_instances
  for all using (is_household_member(household_id)) with check (is_household_member(household_id));

-- =========================================================
-- 8. Storage: bucket para fotos de recibos
-- =========================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Las fotos se guardan como: receipts/<household_id>/<archivo>.jpg
-- Solo miembros del mismo hogar pueden leer/escribir sus propias fotos
create policy "receipts: read if member"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and is_household_member((storage.foldername(name))[1]::uuid)
  );

create policy "receipts: insert if member"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and is_household_member((storage.foldername(name))[1]::uuid)
  );

create policy "receipts: delete if member"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and is_household_member((storage.foldername(name))[1]::uuid)
  );
