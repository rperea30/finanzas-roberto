import { supabase } from './supabaseClient.js';

/* ---------------- Categorías ---------------- */
export async function fetchCategories(householdId) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('household_id', householdId)
    .order('is_default', { ascending: false })
    .order('name');
  if (error) throw error;
  return data;
}

export async function addCategory(householdId, { name, icon, color }) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ household_id: householdId, name, icon: icon || '💸', color: color || '#6b7280' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------- Métodos de pago ---------------- */
export async function fetchPaymentMethods(householdId) {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('household_id', householdId)
    .eq('archived', false)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function addPaymentMethod(householdId, payload) {
  const { data, error } = await supabase
    .from('payment_methods')
    .insert({ household_id: householdId, ...payload })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archivePaymentMethod(id) {
  const { error } = await supabase.from('payment_methods').update({ archived: true }).eq('id', id);
  if (error) throw error;
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ---------------- Fotos de recibos ---------------- */
export async function uploadReceiptPhoto(householdId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${householdId}/${uuid()}.${ext}`;
  const { error } = await supabase.storage.from('receipts').upload(path, file, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function getReceiptUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

/* ---------------- Gastos ---------------- */
export async function fetchExpenses(householdId, { from, to, limit = 200 } = {}) {
  let q = supabase
    .from('expenses')
    .select('*, categories(name, icon, color), payment_methods(name, color)')
    .eq('household_id', householdId)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (from) q = q.gte('expense_date', from);
  if (to) q = q.lte('expense_date', to);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function addExpense(householdId, userId, payload) {
  const { data, error } = await supabase
    .from('expenses')
    .insert({ household_id: householdId, created_by: userId, ...payload })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExpense(id, payload) {
  const { data, error } = await supabase
    .from('expenses')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------- Ingresos mensuales ---------------- */
export async function fetchIncomeSources(householdId) {
  const { data, error } = await supabase
    .from('income_sources')
    .select('*')
    .eq('household_id', householdId)
    .eq('active', true)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function addIncomeSource(householdId, payload) {
  const { data, error } = await supabase
    .from('income_sources')
    .insert({ household_id: householdId, ...payload })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateIncomeSource(id, payload) {
  const { data, error } = await supabase
    .from('income_sources')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteIncomeSource(id) {
  const { error } = await supabase.from('income_sources').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------- Ingresos recibidos (registro real) ---------------- */
export async function fetchIncomeEntries(householdId, { from, to } = {}) {
  let q = supabase
    .from('income_entries')
    .select('*, income_sources(name, color)')
    .eq('household_id', householdId)
    .order('entry_date', { ascending: false });
  if (from) q = q.gte('entry_date', from);
  if (to) q = q.lte('entry_date', to);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function addIncomeEntry(householdId, userId, payload) {
  const { data, error } = await supabase
    .from('income_entries')
    .insert({ household_id: householdId, created_by: userId, ...payload })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteIncomeEntry(id) {
  const { error } = await supabase.from('income_entries').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------- Transferencias de ingresos a wallets ---------------- */
export async function fetchWalletTransfers(householdId) {
  const { data, error } = await supabase
    .from('wallet_transfers')
    .select('*, income_sources(name, color), payment_methods(name, color, type)')
    .eq('household_id', householdId)
    .order('transfer_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addWalletTransfer(householdId, userId, payload) {
  const { data, error } = await supabase
    .from('wallet_transfers')
    .insert({ household_id: householdId, created_by: userId, ...payload })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWalletTransfer(id) {
  const { error } = await supabase.from('wallet_transfers').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------- Todos los gastos (sin filtro de fecha, para saldos) ---------------- */
export async function fetchAllExpensesRaw(householdId) {
  const { data, error } = await supabase
    .from('expenses')
    .select('amount, payment_method_id, expense_date')
    .eq('household_id', householdId);
  if (error) throw error;
  return data;
}

/* ---------------- Facturas recurrentes ---------------- */
export async function fetchRecurringBills(householdId) {
  const { data, error } = await supabase
    .from('recurring_bills')
    .select('*')
    .eq('household_id', householdId)
    .eq('active', true)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function addRecurringBill(householdId, payload) {
  const { data, error } = await supabase
    .from('recurring_bills')
    .insert({ household_id: householdId, ...payload })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ---------------- Instancias mensuales (facturas + ciclos de tarjeta) ---------------- */
export async function fetchBillInstances(householdId, periodMonthISO) {
  const { data, error } = await supabase
    .from('bill_instances')
    .select('*, recurring_bills(name, category_id), payment_methods(name, color, credit_limit, monthly_interest_rate)')
    .eq('household_id', householdId)
    .eq('period_month', periodMonthISO)
    .order('due_date');
  if (error) throw error;
  return data;
}

export async function upsertBillInstance(householdId, payload) {
  const { data, error } = await supabase
    .from('bill_instances')
    .upsert({ household_id: householdId, ...payload })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBillInstance(id) {
  const { error } = await supabase.from('bill_instances').delete().eq('id', id);
  if (error) throw error;
}
