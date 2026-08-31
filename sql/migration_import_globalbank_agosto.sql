-- Importa tus 14 compras reales de Visa Global Bank (25-30 agosto 2026).

do $$
declare
  v_household_id uuid;
  v_user_id uuid;
  v_visa_id uuid;
  v_cat_comida uuid;
  v_cat_super uuid;
  v_cat_transporte uuid;
  v_cat_servicios uuid;
  v_cat_salud uuid;
  v_cat_educacion uuid;
  v_cat_otros uuid;
begin
  select hm.household_id, hm.user_id into v_household_id, v_user_id
  from household_members hm
  join auth.users u on u.id = hm.user_id
  where u.email = 'roberto300@live.com'
  limit 1;

  if v_household_id is null then
    raise exception 'No se encontró tu hogar.';
  end if;

  select id into v_visa_id from payment_methods where household_id = v_household_id and name = 'Visa Global Bank';

  select id into v_cat_comida from categories where household_id = v_household_id and name = 'Comida y restaurantes';
  select id into v_cat_super from categories where household_id = v_household_id and name = 'Supermercado';
  select id into v_cat_transporte from categories where household_id = v_household_id and name = 'Transporte';
  select id into v_cat_servicios from categories where household_id = v_household_id and name = 'Servicios y facturas';
  select id into v_cat_salud from categories where household_id = v_household_id and name = 'Salud';
  select id into v_cat_educacion from categories where household_id = v_household_id and name = 'Educación';
  select id into v_cat_otros from categories where household_id = v_household_id and name = 'Otros';

  insert into expenses (household_id, created_by, payment_method_id, category_id, expense_date, amount, merchant) values
  (v_household_id, v_user_id, v_visa_id, v_cat_comida,     '2026-08-25', 2.84,   'Durán Coffee Store J.D.'),
  (v_household_id, v_user_id, v_visa_id, v_cat_otros,      '2026-08-27', 8.49,   'Microsoft 365'),
  (v_household_id, v_user_id, v_visa_id, v_cat_salud,      '2026-08-27', 2.60,   'Farmacia San Javier'),
  (v_household_id, v_user_id, v_visa_id, v_cat_transporte, '2026-08-27', 20.00,  'Estación Puma Vía Bolívar'),
  (v_household_id, v_user_id, v_visa_id, v_cat_comida,     '2026-08-27', 17.60,  'Restaurante Don Lee'),
  (v_household_id, v_user_id, v_visa_id, v_cat_comida,     '2026-08-27', 15.95,  'PedidosYa'),
  (v_household_id, v_user_id, v_visa_id, v_cat_super,      '2026-08-28', 39.32,  'Frutería Mimi CDE'),
  (v_household_id, v_user_id, v_visa_id, v_cat_servicios,  '2026-08-29', 46.18,  'Servicio celular Más Móvil'),
  (v_household_id, v_user_id, v_visa_id, v_cat_servicios,  '2026-08-29', 36.74,  'Servicio fijo Más Móvil'),
  (v_household_id, v_user_id, v_visa_id, v_cat_otros,      '2026-08-29', 20.00,  'ChatGPT Subscription'),
  (v_household_id, v_user_id, v_visa_id, v_cat_educacion,  '2026-08-30', 186.06, 'Flywire–ADEN'),
  (v_household_id, v_user_id, v_visa_id, v_cat_comida,     '2026-08-30', 3.85,   'Kotowa Los Pueblos'),
  (v_household_id, v_user_id, v_visa_id, v_cat_otros,      '2026-08-30', 12.25,  'Onze'),
  (v_household_id, v_user_id, v_visa_id, v_cat_otros,      '2026-08-30', 10.00,  'ChatGPT Credit');
end $$;
