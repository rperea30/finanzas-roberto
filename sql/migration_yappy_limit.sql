-- Pone el "Límite / Monto inicial" de Yappy/Efectivo en 379.34 (igual al Salario).
update payment_methods
set starting_balance = 379.34
where household_id = (
  select hm.household_id
  from household_members hm
  join auth.users u on u.id = hm.user_id
  where u.email = 'roberto300@live.com'
  limit 1
)
and name = 'Yappy / Efectivo';
