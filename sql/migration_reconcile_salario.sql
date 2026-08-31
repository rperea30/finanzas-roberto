-- Registra los B/.489.34 en efectivo (Yappy) como ingreso recibido de Salario,
-- y deja esa misma meta mensual en Salario.

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

  if v_salario_id is null then
    raise exception 'No se encontró la fuente de ingreso "Salario".';
  end if;

  update income_sources set monthly_amount = 489.34 where id = v_salario_id;

  insert into income_entries (household_id, income_source_id, created_by, entry_date, amount, notes)
  values (v_household_id, v_salario_id, v_user_id, current_date, 489.34, 'Efectivo (Yappy) inicial migrado del Excel');
end $$;
