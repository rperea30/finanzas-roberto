// Estado global sencillo en memoria (se recarga desde Supabase al iniciar sesión)
export const state = {
  session: null,
  household: null,        // { id, name, invite_code }
  categories: [],
  paymentMethods: [],
  recurringBills: [],
  incomeSources: [],
  expensesCache: [],       // últimos gastos cargados (historial/dashboard)
  billsMonth: startOfMonth(new Date()),
  editingExpenseId: null,
};

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
