-- Corrige ingresos duplicados de Salario (deja solo un registro de 489.34).

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

  select id into v_salario_id from income_sources
  where household_id = v_household_id and name = 'Salario';

  -- Borra TODOS los ingresos migrados del efectivo inicial (por si se duplicaron)
  delete from income_entries
  where household_id = v_household_id
    and income_source_id = v_salario_id
    and notes = 'Efectivo (Yappy) inicial migrado del Excel';

  -- Y deja exactamente uno
  insert into income_entries (household_id, income_source_id, created_by, entry_date, amount, notes)
  values (v_household_id, v_salario_id, v_user_id, current_date, 489.34, 'Efectivo (Yappy) inicial migrado del Excel');
end $$;
