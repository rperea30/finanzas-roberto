-- Pone el saldo inicial de Yappy/Efectivo en $0.
-- De ahora en adelante, todo el dinero en Yappy llega por transferencias desde tus ingresos.

update payment_methods
set starting_balance = 0
where household_id = (
  select hm.household_id
  from household_members hm
  join auth.users u on u.id = hm.user_id
  where u.email = 'roberto300@live.com'
  limit 1
)
and name = 'Yappy / Efectivo';
