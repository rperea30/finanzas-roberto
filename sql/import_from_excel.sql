-- Importa los datos reales de "finanzas registro 2026.xlsx" a tu hogar.
-- Ejecutar UNA sola vez, después de haber iniciado sesión al menos una vez en la app.

do $$
declare
  v_household_id uuid;
  v_visa_global uuid;
  v_mastercard uuid;
  v_davivienda uuid;
  v_cash uuid;
  v_cat_servicios uuid;
  v_bill_ph uuid;
  v_bill_ensa uuid;
  v_bill_idaan uuid;
  v_bill_movil uuid;
  v_bill_fijo uuid;
begin
  select hm.household_id into v_household_id
  from household_members hm
  join auth.users u on u.id = hm.user_id
  where u.email = 'roberto300@live.com'
  limit 1;

  if v_household_id is null then
    raise exception 'No se encontró tu hogar. Inicia sesión al menos una vez en la app primero.';
  end if;

  -- ===== Métodos de pago =====
  insert into payment_methods (household_id, name, type, credit_limit, cycle_close_day, payment_due_day, monthly_interest_rate, color)
  values (v_household_id, 'Visa Global Bank', 'credit_card', 450, 25, 20, 0.0191583333, '#1d4ed8')
  returning id into v_visa_global;

  insert into payment_methods (household_id, name, type, credit_limit, cycle_close_day, payment_due_day, monthly_interest_rate, color)
  values (v_household_id, 'MasterCard Saint George', 'credit_card', 450, 9, 4, 0.0179, '#ea580c')
  returning id into v_mastercard;

  insert into payment_methods (household_id, name, type, credit_limit, cycle_close_day, payment_due_day, monthly_interest_rate, color)
  values (v_household_id, 'Visa Davivienda Platino', 'credit_card', 2894.94, 18, 14, 0.02, '#7c3aed')
  returning id into v_davivienda;

  insert into payment_methods (household_id, name, type, color)
  values (v_household_id, 'Yappy / Efectivo', 'cash', '#16a34a')
  returning id into v_cash;

  select id into v_cat_servicios from categories where household_id = v_household_id and name = 'Servicios y facturas' limit 1;

  -- ===== Facturas recurrentes =====
  insert into recurring_bills (household_id, name, category_id, default_amount, due_day)
  values (v_household_id, 'PH Altaterra (mantenimiento)', v_cat_servicios, 145.78, 10)
  returning id into v_bill_ph;

  insert into recurring_bills (household_id, name, category_id, default_amount, due_day)
  values (v_household_id, 'ENSA (electricidad y aseo)', v_cat_servicios, 47.72, 29)
  returning id into v_bill_ensa;

  insert into recurring_bills (household_id, name, category_id, default_amount, due_day)
  values (v_household_id, 'IDAAN (agua y alcantarillado)', v_cat_servicios, 7.92, 22)
  returning id into v_bill_idaan;

  insert into recurring_bills (household_id, name, category_id, default_amount, due_day)
  values (v_household_id, 'Más Móvil – móvil', v_cat_servicios, 46.18, 21)
  returning id into v_bill_movil;

  insert into recurring_bills (household_id, name, category_id, default_amount, due_day)
  values (v_household_id, 'Más Móvil – fijo (internet/TV/línea)', v_cat_servicios, 36.74, 27)
  returning id into v_bill_fijo;

  -- ===== JUNIO 2026 =====
  insert into bill_instances (household_id, payment_method_id, period_month, cycle_label, amount_due, amount_paid, due_date, status, interest_calculated, notes) values
  (v_household_id, v_visa_global, '2026-06-01', '26 abr – 25 may 2026', 854.77, 21.00, '2026-06-20', 'pendiente', 15.97, 'Pago mínimo cubierto US$21.00; saldo al corte pendiente'),
  (v_household_id, v_mastercard, '2026-06-01', '10 abr – 9 may 2026', 442.02, 442.02, '2026-06-04', 'pagado', 0, 'Pago de contado cancelado en su totalidad (en el Excel aparecía como "MasterCard Promerica")');

  insert into bill_instances (household_id, recurring_bill_id, period_month, cycle_label, amount_due, amount_paid, due_date, status, notes) values
  (v_household_id, v_bill_ph, '2026-06-01', 'Mensual', 145.78, 145.78, '2026-10-06', 'pagado', 'Factura Nº 2026-05-267'),
  (v_household_id, v_bill_ensa, '2026-06-01', 'Mensual', 47.72, 0, '2026-05-29', 'pendiente', 'Electricidad B/.34.74 + aseo B/.12.98'),
  (v_household_id, v_bill_idaan, '2026-06-01', '17 mar – 17 abr 2026', 7.92, 0, '2026-05-22', 'pendiente', 'Consumo agua B/.6.40 + alcantarillado B/.1.52'),
  (v_household_id, v_bill_movil, '2026-06-01', 'Mensual', 46.18, 0, '2026-05-21', 'pagado', 'Plan, equipo e impuestos incluidos'),
  (v_household_id, v_bill_fijo, '2026-06-01', 'Mensual', 36.74, 0, '2026-05-27', 'pagado', 'Internet/TV/línea fija');

  -- ===== JULIO 2026 (plantilla, montos en 0 en el Excel) =====
  insert into bill_instances (household_id, payment_method_id, period_month, cycle_label, amount_due, amount_paid, due_date, status, notes) values
  (v_household_id, v_visa_global, '2026-07-01', '26 may – 25 jun 2026', 0, 0, '2026-07-20', 'pendiente', 'Pendiente de actualizar con el estado de cuenta del mes'),
  (v_household_id, v_mastercard, '2026-07-01', '10 may – 9 jun 2026', 0, 0, '2026-07-04', 'pendiente', 'Pendiente de actualizar con el estado de cuenta del mes');

  insert into bill_instances (household_id, recurring_bill_id, period_month, cycle_label, amount_due, amount_paid, due_date, status) values
  (v_household_id, v_bill_ph, '2026-07-01', 'Mensual', 0, 0, '2026-10-07', 'pendiente'),
  (v_household_id, v_bill_ensa, '2026-07-01', 'Mensual', 0, 0, '2026-07-29', 'pendiente'),
  (v_household_id, v_bill_idaan, '2026-07-01', 'Mensual', 0, 0, '2026-07-22', 'pendiente'),
  (v_household_id, v_bill_movil, '2026-07-01', 'Mensual', 0, 0, '2026-07-21', 'pendiente'),
  (v_household_id, v_bill_fijo, '2026-07-01', 'Mensual', 0, 0, '2026-07-27', 'pendiente');

  -- ===== AGOSTO 2026 (con datos reales) =====
  insert into bill_instances (household_id, payment_method_id, period_month, cycle_label, amount_due, amount_paid, due_date, status, interest_calculated, notes) values
  (v_household_id, v_visa_global, '2026-08-01', '26 jul – 25 ago 2026', 522.43, 300.00, '2026-09-20', 'pendiente', 4.26, 'Se hizo un abono'),
  (v_household_id, v_mastercard, '2026-08-01', '10 jul – 9 ago 2026', 170.87, 170.87, '2026-09-04', 'pagado', 0, 'Saldo actual en el nuevo corte 221.88'),
  (v_household_id, v_davivienda, '2026-08-01', '19 jul – 18 ago 2026', 589.70, 0, '2026-09-14', 'pendiente', 11.79, 'Saldo a la fecha $589.70. Pago mínimo $91.69, vence 14/09/2026. Disponible $2,305.24. Tasa 24% anual (2% mensual). Membresía $150 anual. Seguros $2.09 por cada $1,000 de saldo + protección fraude $4.50. Lealtad 1,295 puntos ($11.65). Compra de saldo a otros bancos: 0% a 18 meses o 0.54% mensual a 66 meses.');

  insert into bill_instances (household_id, recurring_bill_id, period_month, amount_due, amount_paid, status) values
  (v_household_id, v_bill_ph, '2026-08-01', 0, 0, 'pagado'),
  (v_household_id, v_bill_ensa, '2026-08-01', 0, 0, 'pagado'),
  (v_household_id, v_bill_idaan, '2026-08-01', 0, 0, 'pagado'),
  (v_household_id, v_bill_movil, '2026-08-01', 0, 0, 'pagado'),
  (v_household_id, v_bill_fijo, '2026-08-01', 0, 0, 'pagado');

  -- ===== SEPTIEMBRE 2026 (plantilla) =====
  insert into bill_instances (household_id, payment_method_id, period_month, cycle_label, amount_due, amount_paid, due_date, status, notes) values
  (v_household_id, v_visa_global, '2026-09-01', '26 jul – 25 ago 2026', 0, 0, '2026-09-20', 'pendiente', 'Pendiente de actualizar con el estado de cuenta del mes'),
  (v_household_id, v_mastercard, '2026-09-01', '10 jul – 9 ago 2026', 0, 0, '2026-09-04', 'pendiente', 'Pendiente de actualizar con el estado de cuenta del mes');

  insert into bill_instances (household_id, recurring_bill_id, period_month, cycle_label, amount_due, amount_paid, due_date, status) values
  (v_household_id, v_bill_ph, '2026-09-01', 'Mensual', 0, 0, '2026-10-09', 'pendiente'),
  (v_household_id, v_bill_ensa, '2026-09-01', 'Mensual', 0, 0, '2026-09-29', 'pendiente'),
  (v_household_id, v_bill_idaan, '2026-09-01', 'Mensual', 0, 0, '2026-09-22', 'pendiente'),
  (v_household_id, v_bill_movil, '2026-09-01', 'Mensual', 0, 0, '2026-09-21', 'pendiente'),
  (v_household_id, v_bill_fijo, '2026-09-01', 'Mensual', 0, 0, '2026-09-27', 'pendiente');

  -- ===== OCTUBRE 2026 (plantilla) =====
  insert into bill_instances (household_id, payment_method_id, period_month, cycle_label, amount_due, amount_paid, due_date, status, notes) values
  (v_household_id, v_visa_global, '2026-10-01', '26 ago – 25 sep 2026', 0, 0, '2026-10-20', 'pendiente', 'Pendiente de actualizar con el estado de cuenta del mes'),
  (v_household_id, v_mastercard, '2026-10-01', '10 ago – 9 sep 2026', 0, 0, '2026-10-04', 'pendiente', 'Pendiente de actualizar con el estado de cuenta del mes');

  insert into bill_instances (household_id, recurring_bill_id, period_month, cycle_label, amount_due, amount_paid, due_date, status) values
  (v_household_id, v_bill_ph, '2026-10-01', 'Mensual', 0, 0, '2026-10-10', 'pendiente'),
  (v_household_id, v_bill_ensa, '2026-10-01', 'Mensual', 0, 0, '2026-10-29', 'pendiente'),
  (v_household_id, v_bill_idaan, '2026-10-01', 'Mensual', 0, 0, '2026-10-22', 'pendiente'),
  (v_household_id, v_bill_movil, '2026-10-01', 'Mensual', 0, 0, '2026-10-21', 'pendiente'),
  (v_household_id, v_bill_fijo, '2026-10-01', 'Mensual', 0, 0, '2026-10-27', 'pendiente');

  -- ===== NOVIEMBRE 2026 (plantilla) =====
  insert into bill_instances (household_id, payment_method_id, period_month, cycle_label, amount_due, amount_paid, due_date, status, notes) values
  (v_household_id, v_visa_global, '2026-11-01', '26 sep – 25 oct 2026', 0, 0, '2026-11-20', 'pendiente', 'Pendiente de actualizar con el estado de cuenta del mes'),
  (v_household_id, v_mastercard, '2026-11-01', '10 sep – 9 oct 2026', 0, 0, '2026-11-04', 'pendiente', 'Pendiente de actualizar con el estado de cuenta del mes');

  insert into bill_instances (household_id, recurring_bill_id, period_month, cycle_label, amount_due, amount_paid, due_date, status) values
  (v_household_id, v_bill_ph, '2026-11-01', 'Mensual', 0, 0, '2026-10-11', 'pendiente'),
  (v_household_id, v_bill_ensa, '2026-11-01', 'Mensual', 0, 0, '2026-11-29', 'pendiente'),
  (v_household_id, v_bill_idaan, '2026-11-01', 'Mensual', 0, 0, '2026-11-22', 'pendiente'),
  (v_household_id, v_bill_movil, '2026-11-01', 'Mensual', 0, 0, '2026-11-21', 'pendiente'),
  (v_household_id, v_bill_fijo, '2026-11-01', 'Mensual', 0, 0, '2026-11-27', 'pendiente');

  -- ===== DICIEMBRE 2026 (plantilla) =====
  insert into bill_instances (household_id, payment_method_id, period_month, cycle_label, amount_due, amount_paid, due_date, status, notes) values
  (v_household_id, v_visa_global, '2026-12-01', '26 oct – 25 nov 2026', 0, 0, '2026-12-20', 'pendiente', 'Pendiente de actualizar con el estado de cuenta del mes'),
  (v_household_id, v_mastercard, '2026-12-01', '10 oct – 9 nov 2026', 0, 0, '2026-12-04', 'pendiente', 'Pendiente de actualizar con el estado de cuenta del mes');

  insert into bill_instances (household_id, recurring_bill_id, period_month, cycle_label, amount_due, amount_paid, due_date, status) values
  (v_household_id, v_bill_ph, '2026-12-01', 'Mensual', 0, 0, '2026-10-12', 'pendiente'),
  (v_household_id, v_bill_ensa, '2026-12-01', 'Mensual', 0, 0, '2026-12-29', 'pendiente'),
  (v_household_id, v_bill_idaan, '2026-12-01', 'Mensual', 0, 0, '2026-12-22', 'pendiente'),
  (v_household_id, v_bill_movil, '2026-12-01', 'Mensual', 0, 0, '2026-12-21', 'pendiente'),
  (v_household_id, v_bill_fijo, '2026-12-01', 'Mensual', 0, 0, '2026-12-27', 'pendiente');

end $$;
