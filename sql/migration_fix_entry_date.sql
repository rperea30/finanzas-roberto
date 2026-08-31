-- Corrige la fecha del ingreso de Salario que quedó en 31 de agosto (hora UTC del servidor)
-- en vez de 30 de agosto (hora de Panamá).

update income_entries
set entry_date = '2026-08-30'
where household_id = (
  select hm.household_id
  from household_members hm
  join auth.users u on u.id = hm.user_id
  where u.email = 'roberto300@live.com'
  limit 1
)
and notes = 'Efectivo (Yappy) inicial migrado del Excel'
and entry_date = '2026-08-31';
