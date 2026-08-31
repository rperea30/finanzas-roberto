import { supabase } from './supabaseClient.js';
import { state, startOfMonth, addMonths } from './state.js';
import {
  showToast, fmtMoney, fmtDate, fmtDateLong, todayISO, monthLabel, el,
  paletteColor, gaugeLevel, levelColor, gaugeSVG, dueDateBadge,
} from './ui.js';
import { openModal, closeModal } from './modal.js';
import * as auth from './auth.js';
import * as data from './data.js';

const charts = { trend: null, donut: null };

/* ======================================================================
   INIT
   ====================================================================== */
async function init() {
  wireAuthForm();
  wireNav();
  wireExpenseForm();
  wirePhotoInput();
  wireSettingsButtons();
  wireBillsNav();
  wireIncomeNav();
  wireTransferButton();

  const session = await auth.getSession();
  if (session) {
    await bootAuthenticated(session);
  } else {
    showAuthView();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      state.household = null;
      showAuthView();
    }
  });
}

async function bootAuthenticated(session) {
  state.session = session;
  try {
    let household = await auth.getMyHousehold(session.user.id);
    if (!household) {
      // No debería pasar (se crea en el signup), pero por si acaso:
      household = await auth.createHousehold(session.user.id, session.user.email);
    }
    state.household = household;
    await loadHouseholdData();
    showAppShell();
    setActiveView('home');
  } catch (err) {
    console.error(err);
    showToast('Error cargando tu hogar: ' + err.message, 'error');
    showAuthView();
  }
}

async function loadHouseholdData() {
  const hId = state.household.id;
  const [categories, methods, bills, incomeSources] = await Promise.all([
    data.fetchCategories(hId),
    data.fetchPaymentMethods(hId),
    data.fetchRecurringBills(hId),
    data.fetchIncomeSources(hId),
  ]);
  state.categories = categories;
  state.paymentMethods = methods;
  state.recurringBills = bills;
  state.incomeSources = incomeSources;
}

function showAuthView() {
  document.getElementById('auth-view').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showAppShell() {
  document.getElementById('auth-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('fab-add').classList.remove('hidden');
}

/* ======================================================================
   AUTH
   ====================================================================== */
function wireAuthForm() {
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const extra = document.getElementById('signup-extra');
  const submitBtn = document.getElementById('auth-submit');
  let mode = 'login';

  tabLogin.addEventListener('click', () => {
    mode = 'login';
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    extra.classList.add('hidden');
    submitBtn.textContent = 'Entrar';
  });

  tabSignup.addEventListener('click', () => {
    mode = 'signup';
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    extra.classList.remove('hidden');
    submitBtn.textContent = 'Crear cuenta';
  });

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = '';
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    submitBtn.disabled = true;
    try {
      if (mode === 'login') {
        const { session } = await auth.signIn(email, password);
        if (session) await bootAuthenticated(session);
      } else {
        const name = document.getElementById('auth-name').value.trim() || email.split('@')[0];
        const inviteCode = document.getElementById('auth-invite').value.trim();
        const result = await auth.signUp(email, password);
        if (!result.session) {
          errorEl.textContent = '';
          showToast('Cuenta creada. Revisa tu correo para confirmar y luego inicia sesión.', 'success');
          tabLogin.click();
          submitBtn.disabled = false;
          return;
        }
        const household = inviteCode
          ? await auth.joinHousehold(result.user.id, name, inviteCode)
          : await auth.createHousehold(result.user.id, name);
        state.household = household;
        state.session = result.session;
        await loadHouseholdData();
        showAppShell();
        setActiveView('home');
      }
    } catch (err) {
      errorEl.textContent = err.message || 'Ocurrió un error.';
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await auth.signOut();
    showToast('Sesión cerrada');
  });
}

/* ======================================================================
   NAVEGACIÓN
   ====================================================================== */
const VIEWS = ['home', 'history', 'add', 'bills', 'settings'];

function wireNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => setActiveView(btn.dataset.view));
  });
  document.getElementById('fab-add').addEventListener('click', () => {
    state.editingExpenseId = null;
    resetExpenseForm();
    setActiveView('add');
  });
  document.getElementById('btn-settings').addEventListener('click', () => setActiveView('settings'));
}

function setActiveView(view) {
  VIEWS.forEach((v) => {
    document.getElementById('view-' + v).classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.getElementById('fab-add').classList.toggle('hidden', view === 'add');

  if (view === 'home') renderHome();
  if (view === 'history') renderHistory();
  if (view === 'add') renderExpenseFormOptions();
  if (view === 'bills') renderBills();
  if (view === 'settings') renderSettings();
}

/* ======================================================================
   HOME / DASHBOARD
   ====================================================================== */
async function renderHome() {
  document.getElementById('topbar-title').textContent = 'Finanzas';
  document.getElementById('topbar-subtitle').textContent = state.household?.name || '';

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthStartISO = monthStart.toISOString().slice(0, 10);
  const prevMonthStartISO = addMonths(monthStart, -1).toISOString().slice(0, 10);
  const todayIsoStr = todayISO();
  const dayOfMonth = now.getDate();

  let expenses = [];
  let prevExpenses = [];
  let incomeEntries = [];
  let allIncomeEntries = [];
  let allTransfers = [];
  try {
    [expenses, prevExpenses, incomeEntries, allIncomeEntries, allTransfers] = await Promise.all([
      data.fetchExpenses(state.household.id, { from: monthStartISO }),
      data.fetchExpenses(state.household.id, { from: prevMonthStartISO, to: monthStartISO }),
      data.fetchIncomeEntries(state.household.id, { from: monthStartISO }).catch(() => []),
      data.fetchIncomeEntries(state.household.id).catch(() => []),
      data.fetchWalletTransfers(state.household.id).catch(() => []),
    ]);
    state.expensesCache = expenses;
  } catch (err) {
    showToast('Error cargando gastos: ' + err.message, 'error');
    return;
  }

  const monthTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const prevMonthTotal = prevExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const todayTotal = expenses
    .filter((e) => e.expense_date === todayIsoStr)
    .reduce((s, e) => s + Number(e.amount), 0);
  const avgDaily = dayOfMonth > 0 ? monthTotal / dayOfMonth : 0;

  document.getElementById('stat-month-total').textContent = fmtMoney(monthTotal);
  document.getElementById('stat-today-total').textContent = fmtMoney(todayTotal);
  document.getElementById('stat-avg-daily').textContent = fmtMoney(avgDaily);

  const receivedIncome = incomeEntries.reduce((s, e) => s + Number(e.amount), 0);
  const targetIncome = state.incomeSources.reduce((s, i) => s + Number(i.monthly_amount), 0);
  const budget = receivedIncome > 0 ? receivedIncome : targetIncome;
  renderUnassignedCard(allIncomeEntries, allTransfers);
  state.incomeMonth = startOfMonth(new Date());
  renderIncomeMonthCard();
  renderHeroTrend(monthTotal, prevMonthTotal, budget, receivedIncome > 0);
  renderPaceCard(monthTotal, avgDaily, budget, now);
  renderTrendChart(expenses, monthStart, now);

  renderBreakdown(
    'method-breakdown',
    'method-empty',
    groupSum(expenses, (e) => e.payment_methods?.name || 'Sin método', (e) => e.payment_methods?.color || '#6b7280', () => ''),
    monthTotal
  );

  renderCategoryDonut(expenses);
  await renderHomeCardStrip();
  await renderTransfersList();
}

function renderHeroTrend(monthTotal, prevMonthTotal, budget, isReceived) {
  const sub = document.getElementById('hero-budget-sub');
  const gaugeContainer = document.getElementById('hero-gauge');
  const fill = document.getElementById('hero-track-fill');
  const leftLabel = document.getElementById('hero-track-label-left');
  const rightLabel = document.getElementById('hero-track-label-right');

  if (budget > 0) {
    const pct = (monthTotal / budget) * 100;
    const level = gaugeLevel(pct);
    fill.style.width = Math.min(100, pct) + '%';
    fill.className = 'hero-track-fill level-' + level;
    leftLabel.textContent = fmtMoney(monthTotal) + ' gastado';
    rightLabel.textContent = 'de ' + fmtMoney(budget) + (isReceived ? ' recibidos' : ' de meta');
    sub.textContent = pct >= 100
      ? `Superaste tus ingresos por ${fmtMoney(monthTotal - budget)}`
      : `Te quedan ${fmtMoney(budget - monthTotal)} este mes`;
    sub.className = 'hero-sub ' + (pct >= 90 ? 'trend-up' : 'trend-down');
    gaugeContainer.innerHTML = gaugeSVG(pct, { size: 'md' });
    return;
  }

  if (!prevMonthTotal) {
    sub.textContent = 'Agrega tus ingresos en Ajustes para ver tu presupuesto';
    sub.className = 'hero-sub';
  } else {
    const diffPct = ((monthTotal - prevMonthTotal) / prevMonthTotal) * 100;
    const up = diffPct >= 0;
    sub.textContent = `${up ? '▲' : '▼'} ${Math.abs(diffPct).toFixed(0)}% vs. mes anterior (${fmtMoney(prevMonthTotal)})`;
    sub.className = 'hero-sub ' + (up ? 'trend-up' : 'trend-down');
  }
  const pct = prevMonthTotal > 0 ? Math.min(100, (monthTotal / prevMonthTotal) * 100) : monthTotal > 0 ? 100 : 0;
  const level = prevMonthTotal > 0 ? gaugeLevel((monthTotal / prevMonthTotal) * 100) : 'good';
  fill.style.width = pct + '%';
  fill.className = 'hero-track-fill level-' + level;
  leftLabel.textContent = fmtMoney(monthTotal) + ' gastado';
  rightLabel.textContent = prevMonthTotal ? 'vs ' + fmtMoney(prevMonthTotal) + ' mes pasado' : 'primer mes de registro';
  gaugeContainer.innerHTML = gaugeSVG(prevMonthTotal > 0 ? (monthTotal / prevMonthTotal) * 100 : monthTotal > 0 ? 100 : 0, { size: 'md' });
}

function renderUnassignedCard(allIncomeEntries, allTransfers) {
  const totalIncome = allIncomeEntries.reduce((s, e) => s + Number(e.amount), 0);
  const totalTransferred = allTransfers.reduce((s, t) => s + Number(t.amount), 0);
  const unassigned = totalIncome - totalTransferred;

  document.getElementById('unassigned-total').textContent = fmtMoney(unassigned);

  const breakdown = document.getElementById('unassigned-breakdown');
  breakdown.innerHTML = `
    <div class="ub-row"><span>Ingresos recibidos (histórico)</span><strong>${fmtMoney(totalIncome)}</strong></div>
    <div class="ub-row"><span>Transferido (histórico)</span><strong>-${fmtMoney(totalTransferred)}</strong></div>
  `;

  if (state.incomeSources.length) {
    const perSource = document.createElement('div');
    perSource.style.marginTop = '10px';
    perSource.style.paddingTop = '10px';
    perSource.style.borderTop = '1px solid var(--border)';
    for (const src of state.incomeSources) {
      const received = allIncomeEntries.filter((e) => e.income_source_id === src.id).reduce((s, e) => s + Number(e.amount), 0);
      const transferred = allTransfers.filter((t) => t.income_source_id === src.id).reduce((s, t) => s + Number(t.amount), 0);
      const left = received - transferred;
      perSource.appendChild(
        el(`<div class="ub-row"><span>${escapeHtml(src.name)} sin asignar</span><strong>${fmtMoney(left)}</strong></div>`)
      );
    }
    breakdown.appendChild(perSource);
  }
}

async function renderIncomeMonthCard() {
  document.getElementById('income-month-label').textContent = capitalize(monthLabel(state.incomeMonth));
  const from = state.incomeMonth.toISOString().slice(0, 10);
  const to = addMonths(state.incomeMonth, 1).toISOString().slice(0, 10);

  let entries = [];
  try {
    entries = await data.fetchIncomeEntries(state.household.id, { from, to });
  } catch (err) {
    showToast('Error cargando ingresos: ' + err.message, 'error');
    return;
  }

  const total = entries.reduce((s, e) => s + Number(e.amount), 0);
  const groups = groupSum(
    entries,
    (e) => e.income_sources?.name || 'Otro ingreso',
    (e) => e.income_sources?.color || '#22c55e',
    () => '💵'
  );
  renderBreakdown('income-sources-breakdown', 'income-sources-empty', groups, total);

  const titleEl = document.getElementById('income-entries-title');
  const listEl = document.getElementById('income-entries-list');
  listEl.innerHTML = '';
  titleEl.textContent = entries.length ? 'Movimientos' : '';

  const sorted = [...entries].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
  for (const e of sorted) {
    const row = el(`
      <div class="list-row">
        <div class="row-main">
          <span class="color-dot" style="background:${e.income_sources?.color || '#22c55e'}"></span>
          <div>
            <div>${escapeHtml(e.income_sources?.name || 'Otro ingreso')}${e.notes ? ' — ' + escapeHtml(e.notes) : ''}</div>
            <div class="row-sub">${fmtDateLong(e.entry_date)}</div>
          </div>
        </div>
        <div class="row-actions" style="display:flex;align-items:center;gap:8px;">
          <strong>${fmtMoney(e.amount)}</strong>
          <button data-action="del">🗑️</button>
        </div>
      </div>
    `);
    row.querySelector('[data-action="del"]').addEventListener('click', async () => {
      if (!confirm('¿Eliminar este ingreso?')) return;
      await data.deleteIncomeEntry(e.id);
      renderIncomeMonthCard();
    });
    listEl.appendChild(row);
  }
}

function wireIncomeNav() {
  document.getElementById('income-prev-month').addEventListener('click', () => {
    state.incomeMonth = addMonths(state.incomeMonth, -1);
    renderIncomeMonthCard();
  });
  document.getElementById('income-next-month').addEventListener('click', () => {
    state.incomeMonth = addMonths(state.incomeMonth, 1);
    renderIncomeMonthCard();
  });
}

function wireTransferButton() {
  document.getElementById('btn-transfer-to-wallet').addEventListener('click', () => openTransferModal());
}

function openTransferModal() {
  if (!state.incomeSources.length) {
    showToast('Primero agrega un ingreso (ej. Salario) en Ajustes.', 'error');
    return;
  }
  if (!state.paymentMethods.length) {
    showToast('Primero agrega una tarjeta o wallet en Ajustes.', 'error');
    return;
  }
  const sourceOptions = state.incomeSources.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  const destOptions = state.paymentMethods
    .map((m) => `<option value="${m.id}">${escapeHtml(m.name)} (${labelType(m.type)})</option>`)
    .join('');
  const overlay = openModal(`
    <h3>Transferir ingreso</h3>
    <p class="helper-text">Mueve dinero de un ingreso hacia un wallet (para gastar) o directo a pagar una tarjeta.</p>
    <div class="field">
      <label>Desde (ingreso)</label>
      <select id="tr-source">${sourceOptions}</select>
    </div>
    <div class="field">
      <label>Hacia</label>
      <select id="tr-wallet">${destOptions}</select>
    </div>
    <div class="field">
      <label>Monto</label>
      <input type="number" step="0.01" min="0.01" id="tr-amount" class="amount-input" placeholder="0.00" />
    </div>
    <div class="field">
      <label>Fecha</label>
      <input type="date" id="tr-date" value="${todayISO()}" />
    </div>
    <div class="field">
      <label>Notas (opcional)</label>
      <input type="text" id="tr-notes" placeholder="Ej. abono a la tarjeta de agosto" />
    </div>
    <p class="error-text" id="tr-error"></p>
    <button class="btn btn-primary" id="tr-save">Transferir</button>
  `);
  overlay.querySelector('#tr-save').addEventListener('click', async () => {
    const amount = parseFloat(overlay.querySelector('#tr-amount').value);
    if (!amount || amount <= 0) {
      overlay.querySelector('#tr-error').textContent = 'Ingresa un monto válido.';
      return;
    }
    const destId = overlay.querySelector('#tr-wallet').value;
    const dest = state.paymentMethods.find((m) => m.id === destId);
    const transferDate = overlay.querySelector('#tr-date').value || todayISO();
    try {
      await data.addWalletTransfer(state.household.id, state.session.user.id, {
        income_source_id: overlay.querySelector('#tr-source').value,
        payment_method_id: destId,
        amount,
        transfer_date: transferDate,
        notes: overlay.querySelector('#tr-notes').value.trim() || null,
      });
      if (dest && (dest.type === 'credit_card' || dest.type === 'debit_card')) {
        await applyTransferAsCardPayment(dest.id, amount, transferDate);
      }
      closeModal();
      showToast('Transferencia registrada', 'success');
      renderHome();
    } catch (err) {
      overlay.querySelector('#tr-error').textContent = err.message;
    }
  });
}

// Cuando transfieres directo a una tarjeta, la registra como abono en el ciclo de ese mes.
async function applyTransferAsCardPayment(paymentMethodId, amount, transferDate) {
  const periodISO = startOfMonth(new Date(transferDate + 'T00:00:00')).toISOString().slice(0, 10);
  let instances = [];
  try {
    instances = await data.fetchBillInstances(state.household.id, periodISO);
  } catch {
    return;
  }
  const existing = instances.find((b) => b.payment_method_id === paymentMethodId);
  const newPaid = (existing ? Number(existing.amount_paid) : 0) + amount;
  const dueAmount = existing ? Number(existing.amount_due) : 0;
  await data.upsertBillInstance(state.household.id, {
    id: existing?.id,
    payment_method_id: paymentMethodId,
    period_month: periodISO,
    amount_due: dueAmount,
    amount_paid: newPaid,
    due_date: existing?.due_date || null,
    cycle_label: existing?.cycle_label || null,
    status: dueAmount > 0 && newPaid >= dueAmount ? 'pagado' : dueAmount > 0 ? 'parcial' : 'pagado',
  });
}

// Revierte el abono aplicado a una tarjeta cuando se borra la transferencia que lo originó.
async function reverseTransferCardPayment(paymentMethodId, amount, transferDate) {
  const periodISO = startOfMonth(new Date(transferDate + 'T00:00:00')).toISOString().slice(0, 10);
  let instances = [];
  try {
    instances = await data.fetchBillInstances(state.household.id, periodISO);
  } catch {
    return;
  }
  const existing = instances.find((b) => b.payment_method_id === paymentMethodId);
  if (!existing) return;
  const newPaid = Math.max(0, Number(existing.amount_paid) - amount);
  const dueAmount = Number(existing.amount_due);
  await data.upsertBillInstance(state.household.id, {
    id: existing.id,
    payment_method_id: paymentMethodId,
    period_month: periodISO,
    amount_due: dueAmount,
    amount_paid: newPaid,
    due_date: existing.due_date || null,
    cycle_label: existing.cycle_label || null,
    status: dueAmount > 0 && newPaid >= dueAmount ? 'pagado' : dueAmount > 0 && newPaid > 0 ? 'parcial' : 'pendiente',
  });
}

async function renderTransfersList() {
  const listEl = document.getElementById('transfers-list');
  const emptyEl = document.getElementById('transfers-empty');
  if (!listEl) return;
  let transfers = [];
  try {
    transfers = await data.fetchWalletTransfers(state.household.id);
  } catch (err) {
    showToast('Error cargando transferencias: ' + err.message, 'error');
    return;
  }
  listEl.innerHTML = '';
  if (!transfers.length) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  for (const t of transfers.slice(0, 15)) {
    const row = el(`
      <div class="list-row">
        <div class="row-main">
          <span class="color-dot" style="background:${t.payment_methods?.color || '#22c55e'}"></span>
          <div>
            <div>${escapeHtml(t.income_sources?.name || 'Ingreso')} → ${escapeHtml(t.payment_methods?.name || 'Wallet')}</div>
            <div class="row-sub">${fmtDate(t.transfer_date)}${t.notes ? ' — ' + escapeHtml(t.notes) : ''}</div>
          </div>
        </div>
        <div class="row-actions" style="display:flex;align-items:center;gap:8px;">
          <strong>${fmtMoney(t.amount)}</strong>
          <button data-action="del">🗑️</button>
        </div>
      </div>
    `);
    row.querySelector('[data-action="del"]').addEventListener('click', async () => {
      if (!confirm('¿Deshacer esta transferencia? Si fue a una tarjeta, también se revierte el abono.')) return;
      try {
        if (t.payment_methods && (t.payment_methods.type === 'credit_card' || t.payment_methods.type === 'debit_card')) {
          await reverseTransferCardPayment(t.payment_method_id, Number(t.amount), t.transfer_date);
        }
        await data.deleteWalletTransfer(t.id);
        showToast('Transferencia deshecha', 'success');
        renderHome();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
    listEl.appendChild(row);
  }
}

function renderPaceCard(monthTotal, avgDaily, budget, now) {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const projectedTotal = avgDaily * daysInMonth;

  const safeDailyEl = document.getElementById('pace-safe-daily');
  const daysLeftEl = document.getElementById('pace-days-left');
  const projectionEl = document.getElementById('pace-projection');
  const projectionNoteEl = document.getElementById('pace-projection-note');

  if (budget > 0) {
    const remaining = Math.max(0, budget - monthTotal);
    const safeDaily = daysLeft > 0 ? remaining / daysLeft : remaining;
    safeDailyEl.textContent = fmtMoney(safeDaily);
    safeDailyEl.className = 'value ' + (monthTotal >= budget ? 'level-critical' : 'level-good');
    daysLeftEl.textContent = daysLeft > 0 ? `para los próximos ${daysLeft} días` : 'último día del mes';

    const projLevel = gaugeLevel((projectedTotal / budget) * 100);
    projectionEl.textContent = fmtMoney(projectedTotal);
    projectionEl.className = 'value level-' + projLevel;
    projectionNoteEl.textContent = projectedTotal > budget
      ? `${fmtMoney(projectedTotal - budget)} sobre tu presupuesto de ${fmtMoney(budget)}`
      : `dentro de tu presupuesto de ${fmtMoney(budget)}`;
  } else {
    safeDailyEl.textContent = '—';
    safeDailyEl.className = 'value';
    daysLeftEl.textContent = 'agrega tus ingresos en Ajustes';
    projectionEl.textContent = fmtMoney(projectedTotal);
    projectionEl.className = 'value';
    projectionNoteEl.textContent = `a un ritmo de ${fmtMoney(avgDaily)}/día`;
  }
}

function renderTrendChart(expenses, monthStart, now) {
  const daysInView = now.getDate();
  const dailyTotals = new Array(daysInView).fill(0);
  for (const e of expenses) {
    const d = new Date(e.expense_date + 'T00:00:00');
    if (d.getMonth() === monthStart.getMonth() && d.getFullYear() === monthStart.getFullYear()) {
      const idx = d.getDate() - 1;
      if (idx >= 0 && idx < daysInView) dailyTotals[idx] += Number(e.amount);
    }
  }
  let running = 0;
  const cumulative = dailyTotals.map((v) => (running += v));
  const labels = cumulative.map((_, i) => String(i + 1));
  const pointRadii = dailyTotals.map((v) => (v > 0 ? 5 : 0));

  document.getElementById('trend-days-label').textContent = `${daysInView} días · toca un punto para ver el gasto`;

  const ctx = document.getElementById('trend-chart');
  if (charts.trend) charts.trend.destroy();
  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: cumulative,
        borderColor: '#3987e5',
        backgroundColor: 'rgba(57,135,229,0.18)',
        borderWidth: 2,
        pointRadius: pointRadii,
        pointHoverRadius: 7,
        pointBackgroundColor: '#3987e5',
        pointBorderColor: '#0b1220',
        pointBorderWidth: 2,
        tension: 0.35,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        if (dailyTotals[idx] <= 0) return;
        const d = new Date(monthStart);
        d.setDate(idx + 1);
        showDayExpensesModal(d.toISOString().slice(0, 10));
      },
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `Día ${items[0].label}`,
            label: (item) => fmtMoney(item.parsed.y),
            afterLabel: (item) => (dailyTotals[item.dataIndex] > 0 ? 'Toca para ver el detalle' : ''),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#93a4c3', maxTicksLimit: 6, font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#93a4c3', font: { size: 10 }, callback: (v) => '$' + v } },
      },
    },
  });
}

function showDayExpensesModal(dateISO) {
  const dayExpenses = state.expensesCache.filter((e) => e.expense_date === dateISO);
  const dayTotal = dayExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const rows = dayExpenses
    .map(
      (exp) => `
      <div class="list-row" data-id="${exp.id}" style="cursor:pointer;">
        <div class="row-main">
          <span class="color-dot" style="background:${exp.categories?.color || '#6b7280'}"></span>
          <div>
            <div>${exp.categories?.icon || '💸'} ${escapeHtml(exp.merchant || exp.categories?.name || 'Gasto')}</div>
            <div class="row-sub">${escapeHtml(exp.categories?.name || '')}${exp.payment_methods ? ' · ' + escapeHtml(exp.payment_methods.name) : ''}</div>
          </div>
        </div>
        <strong>${fmtMoney(exp.amount)}</strong>
      </div>`
    )
    .join('');
  const overlay = openModal(`
    <h3>${fmtDateLong(dateISO)}</h3>
    <p class="helper-text">Total del día: ${fmtMoney(dayTotal)}</p>
    ${rows || '<p class="empty-state">Sin gastos ese día.</p>'}
  `);
  overlay.querySelectorAll('.list-row').forEach((row) => {
    row.addEventListener('click', () => {
      const exp = dayExpenses.find((e) => e.id === row.dataset.id);
      if (exp) openExpenseDetail(exp);
    });
  });
}

function renderCategoryDonut(expenses) {
  renderCategoryTotalSection(expenses);
  renderCategoryByMethod(expenses);
}

function renderCategoryByMethod(allExpenses) {
  const container = document.getElementById('category-by-method');
  container.innerHTML = '';

  const usedMethodIds = new Set(allExpenses.map((e) => e.payment_method_id).filter(Boolean));
  const methods = state.paymentMethods.filter((m) => usedMethodIds.has(m.id));

  for (const m of methods) {
    const methodExpenses = allExpenses.filter((e) => e.payment_method_id === m.id);
    const methodTotal = methodExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const groups = groupSum(methodExpenses, (e) => e.categories?.name || 'Sin categoría', (e) => e.categories?.color || '#6b7280', (e) => e.categories?.icon || '💸');

    const card = el(`
      <div class="card">
        <div class="card-head">
          <h3><span class="color-dot" style="background:${m.color};display:inline-block;margin-right:6px;"></span>${escapeHtml(m.name)}</h3>
          <span class="helper-text">${fmtMoney(methodTotal)}</span>
        </div>
        <div class="method-cat-bars"></div>
        <div class="method-cat-list"></div>
      </div>
    `);

    const barsEl = card.querySelector('.method-cat-bars');
    for (const g of groups) {
      const pct = methodTotal > 0 ? Math.round((g.total / methodTotal) * 100) : 0;
      barsEl.appendChild(el(`
        <div class="category-bar-row">
          <div class="cat-name">${g.icon} ${escapeHtml(g.name)}</div>
          <div class="category-bar-track"><div class="category-bar-fill" style="width:${pct}%;background:${g.color}"></div></div>
          <div class="cat-amount">${fmtMoney(g.total)}</div>
        </div>
      `));
    }

    const listEl = card.querySelector('.method-cat-list');
    const sorted = [...methodExpenses].sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1));
    for (const exp of sorted) {
      const row = el(`
        <div class="list-row" style="cursor:pointer;">
          <div class="row-main">
            <span class="color-dot" style="background:${exp.categories?.color || '#6b7280'}"></span>
            <div>
              <div>${exp.categories?.icon || '💸'} ${escapeHtml(exp.merchant || exp.categories?.name || 'Gasto')}</div>
              <div class="row-sub">${fmtDate(exp.expense_date)}</div>
            </div>
          </div>
          <strong>${fmtMoney(exp.amount)}</strong>
        </div>
      `);
      row.addEventListener('click', () => openExpenseDetail(exp));
      listEl.appendChild(row);
    }

    container.appendChild(card);
  }
}

function renderCategoryTotalSection(expenses) {
  const filteredTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const groups = groupSum(expenses, (e) => e.categories?.name || 'Sin categoría', () => null, (e) => e.categories?.icon || '💸');
  const emptyEl = document.getElementById('category-empty');
  const rowEl = document.getElementById('category-donut-row');
  const legend = document.getElementById('category-legend');
  legend.innerHTML = '';

  const ctx = document.getElementById('category-donut');
  if (charts.donut) { charts.donut.destroy(); charts.donut = null; }

  if (!groups.length) {
    emptyEl.classList.remove('hidden');
    rowEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  rowEl.classList.remove('hidden');

  const colored = groups.map((g, i) => ({ ...g, color: paletteColor(i) }));

  charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: colored.map((g) => g.name),
      datasets: [{
        data: colored.map((g) => g.total),
        backgroundColor: colored.map((g) => g.color),
        borderColor: '#141f38',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => `${item.label}: ${fmtMoney(item.parsed)}` } },
      },
    },
  });

  for (const g of colored) {
    const pct = filteredTotal > 0 ? Math.round((g.total / filteredTotal) * 100) : 0;
    legend.appendChild(el(`
      <div class="legend-row">
        <span class="legend-dot" style="background:${g.color}"></span>
        <span class="legend-name">${escapeHtml(g.name)}</span>
        <span class="legend-amount">${fmtMoney(g.total)} · ${pct}%</span>
      </div>
    `));
  }

}

async function renderHomeCardStrip() {
  const strip = document.getElementById('home-card-strip');
  const emptyEl = document.getElementById('home-card-strip-empty');
  strip.innerHTML = '';

  if (!state.paymentMethods.length) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  const periodISO = startOfMonth(new Date()).toISOString().slice(0, 10);
  let instances = [];
  let allExpenses = [];
  let allTransfers = [];
  try {
    [instances, allExpenses, allTransfers] = await Promise.all([
      data.fetchBillInstances(state.household.id, periodISO).catch(() => []),
      data.fetchAllExpensesRaw(state.household.id).catch(() => []),
      data.fetchWalletTransfers(state.household.id).catch(() => []),
    ]);
  } catch {
    instances = [];
  }

  for (const m of state.paymentMethods) {
    const inst = instances.find((b) => b.payment_method_id === m.id);
    const due = inst ? Number(inst.amount_due) : 0;
    const paid = inst ? Number(inst.amount_paid) : 0;
    const pending = Math.max(0, due - paid);
    const isCashLike = m.type === 'cash' || m.type === 'wallet';
    const startingBalance = m.starting_balance != null ? Number(m.starting_balance) : null;

    let amountLabel, subLabel, gaugePct;
    if (isCashLike) {
      const base = startingBalance || 0;
      const transferredIn = allTransfers.filter((t) => t.payment_method_id === m.id).reduce((s, t) => s + Number(t.amount), 0);
      const spent = allExpenses.filter((e) => e.payment_method_id === m.id).reduce((s, e) => s + Number(e.amount), 0);
      const funded = base + transferredIn;
      const available = Math.max(0, funded - spent);
      amountLabel = fmtMoney(available);
      subLabel = funded > 0 ? `disponible de ${fmtMoney(funded)}` : `${fmtMoney(spent)} gastado`;
      gaugePct = funded > 0 ? (spent / funded) * 100 : 0;
    } else {
      amountLabel = fmtMoney(pending);
      subLabel = 'saldo pendiente';
      gaugePct = m.credit_limit ? (pending / Number(m.credit_limit)) * 100 : (due > 0 ? (paid / due) * 100 : 0);
    }

    const card = el(`
      <div class="mini-card" style="background:linear-gradient(150deg, ${m.color} 0%, ${m.color}cc 60%, #0f1b34 140%)">
        <div class="mini-card-gauge">${gaugeSVG(gaugePct, { size: 'sm' })}</div>
        <div class="mini-card-name">${escapeHtml(m.name)}</div>
        <div class="mini-card-amount">${amountLabel}</div>
        <div class="mini-card-sub">${subLabel}</div>
      </div>
    `);
    card.addEventListener('click', () => setActiveView('bills'));
    strip.appendChild(card);
  }
}

function groupSum(expenses, keyFn, colorFn, iconFn) {
  const map = new Map();
  for (const e of expenses) {
    const key = keyFn(e);
    if (!map.has(key)) map.set(key, { name: key, total: 0, color: colorFn(e), icon: iconFn(e) });
    map.get(key).total += Number(e.amount);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function renderBreakdown(listId, emptyId, groups, total) {
  const container = document.getElementById(listId);
  const emptyEl = document.getElementById(emptyId);
  container.innerHTML = '';
  if (!groups.length) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  for (const g of groups) {
    const pct = total > 0 ? Math.round((g.total / total) * 100) : 0;
    container.appendChild(
      el(`
      <div class="category-bar-row">
        <div class="cat-name">${g.icon ? g.icon + ' ' : ''}${escapeHtml(g.name)}</div>
        <div class="category-bar-track"><div class="category-bar-fill" style="width:${pct}%;background:${g.color}"></div></div>
        <div class="cat-amount">${fmtMoney(g.total)}</div>
      </div>
    `)
    );
  }
}

/* ======================================================================
   HISTORIAL
   ====================================================================== */
async function renderHistory() {
  const container = document.getElementById('expense-list');
  const emptyEl = document.getElementById('history-empty');
  container.innerHTML = '';

  let expenses = [];
  try {
    expenses = await data.fetchExpenses(state.household.id, { limit: 300 });
  } catch (err) {
    showToast('Error cargando historial: ' + err.message, 'error');
    return;
  }

  if (!expenses.length) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  let lastDay = null;
  for (const exp of expenses) {
    if (exp.expense_date !== lastDay) {
      lastDay = exp.expense_date;
      container.appendChild(el(`<div class="day-group-label">${fmtDateLong(exp.expense_date)}</div>`));
    }
    const row = el(`
      <div class="expense-row" data-id="${exp.id}">
        <div class="expense-icon" style="background:${(exp.categories?.color || '#6b7280')}33">${exp.categories?.icon || '💸'}</div>
        <div class="expense-info">
          <div class="title">${escapeHtml(exp.merchant || exp.categories?.name || 'Gasto')}</div>
          <div class="meta">${escapeHtml(exp.categories?.name || '')}${exp.payment_methods ? ' · ' + escapeHtml(exp.payment_methods.name) : ''}</div>
        </div>
        <div class="expense-amount">${fmtMoney(exp.amount)}</div>
      </div>
    `);
    row.addEventListener('click', () => openExpenseDetail(exp));
    container.appendChild(row);
  }
}

async function openExpenseDetail(exp) {
  let photoUrl = null;
  if (exp.photo_path) {
    photoUrl = await data.getReceiptUrl(exp.photo_path);
  }
  const overlay = openModal(`
    <h3>${escapeHtml(exp.merchant || 'Gasto')}</h3>
    ${photoUrl ? `<img src="${photoUrl}" class="photo-preview" />` : ''}
    <p class="helper-text">${fmtDateLong(exp.expense_date)}</p>
    <p style="font-size:26px;font-weight:700;margin:6px 0 14px;">${fmtMoney(exp.amount)}</p>
    <p class="helper-text">${escapeHtml(exp.categories?.name || 'Sin categoría')} · ${escapeHtml(exp.payment_methods?.name || 'Sin método')}</p>
    ${exp.notes ? `<p class="helper-text">📝 ${escapeHtml(exp.notes)}</p>` : ''}
    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn btn-secondary" id="modal-edit-btn">Editar</button>
      <button class="btn btn-danger" id="modal-delete-btn">Eliminar</button>
    </div>
  `);
  overlay.querySelector('#modal-edit-btn').addEventListener('click', () => {
    closeModal();
    startEditExpense(exp);
  });
  overlay.querySelector('#modal-delete-btn').addEventListener('click', async () => {
    if (!confirm('¿Eliminar este gasto?')) return;
    try {
      await data.deleteExpense(exp.id);
      closeModal();
      showToast('Gasto eliminado');
      renderHistory();
      renderHome();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

function startEditExpense(exp) {
  state.editingExpenseId = exp.id;
  setActiveView('add');
  document.getElementById('add-expense-title').textContent = 'Editar gasto';
  document.getElementById('expense-submit').textContent = 'Guardar cambios';
  document.getElementById('expense-cancel-edit').classList.remove('hidden');
  document.getElementById('exp-amount').value = exp.amount;
  document.getElementById('exp-date').value = exp.expense_date;
  document.getElementById('exp-merchant').value = exp.merchant || '';
  document.getElementById('exp-notes').value = exp.notes || '';
  selectPill('exp-category-pills', exp.category_id);
  selectPill('exp-method-pills', exp.payment_method_id);
}

/* ======================================================================
   FORMULARIO DE GASTO
   ====================================================================== */
let pendingPhotoFile = null;

function resetExpenseForm() {
  pendingPhotoFile = null;
  document.getElementById('expense-form').reset();
  document.getElementById('exp-date').value = todayISO();
  document.getElementById('photo-preview').classList.add('hidden');
  document.getElementById('photo-drop-label').textContent = '📷 Tocar para tomar foto o elegir imagen';
  document.getElementById('add-expense-title').textContent = 'Nuevo gasto';
  document.getElementById('expense-submit').textContent = 'Guardar gasto';
  document.getElementById('expense-cancel-edit').classList.add('hidden');
  document.getElementById('expense-error').textContent = '';
  renderExpenseFormOptions();
}

function renderExpenseFormOptions() {
  const catContainer = document.getElementById('exp-category-pills');
  catContainer.innerHTML = '';
  for (const c of state.categories) {
    const pill = el(`<div class="pill" data-id="${c.id}">${c.icon} ${escapeHtml(c.name)}</div>`);
    pill.addEventListener('click', () => selectPill('exp-category-pills', c.id));
    catContainer.appendChild(pill);
  }
  const addCatPill = el(`<div class="pill pill-add">+ Nueva categoría</div>`);
  addCatPill.addEventListener('click', () => openCategoryModal(true));
  catContainer.appendChild(addCatPill);
  if (state.categories[0] && !state.editingExpenseId) selectPill('exp-category-pills', state.categories[0].id);

  const methodContainer = document.getElementById('exp-method-pills');
  methodContainer.innerHTML = '';
  for (const m of state.paymentMethods) {
    const pill = el(`<div class="pill" data-id="${m.id}">${escapeHtml(m.name)}</div>`);
    pill.addEventListener('click', () => selectPill('exp-method-pills', m.id));
    methodContainer.appendChild(pill);
  }
  const addMethodPill = el(`<div class="pill pill-add">+ Nuevo método</div>`);
  addMethodPill.addEventListener('click', () => openMethodModal(true));
  methodContainer.appendChild(addMethodPill);
  if (state.paymentMethods[0] && !state.editingExpenseId) {
    selectPill('exp-method-pills', state.paymentMethods[0].id);
  }
}

function selectPill(containerId, id) {
  const container = document.getElementById(containerId);
  container.querySelectorAll('.pill').forEach((p) => {
    p.classList.toggle('selected', p.dataset.id === id);
  });
}

function getSelectedPill(containerId) {
  const sel = document.querySelector(`#${containerId} .pill.selected`);
  return sel ? sel.dataset.id : null;
}

function wirePhotoInput() {
  const drop = document.getElementById('photo-drop');
  const input = document.getElementById('exp-photo');
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    pendingPhotoFile = file;
    const preview = document.getElementById('photo-preview');
    preview.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
    document.getElementById('photo-drop-label').textContent = '📷 Cambiar foto';
  });
}

function wireExpenseForm() {
  document.getElementById('expense-cancel-edit').addEventListener('click', () => {
    state.editingExpenseId = null;
    resetExpenseForm();
    setActiveView('history');
  });

  document.getElementById('expense-back-btn').addEventListener('click', () => {
    const wasEditing = !!state.editingExpenseId;
    state.editingExpenseId = null;
    resetExpenseForm();
    setActiveView(wasEditing ? 'history' : 'home');
  });

  document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('expense-error');
    errorEl.textContent = '';
    const submitBtn = document.getElementById('expense-submit');

    const amount = parseFloat(document.getElementById('exp-amount').value);
    const expenseDate = document.getElementById('exp-date').value;
    const categoryId = getSelectedPill('exp-category-pills');
    const methodId = getSelectedPill('exp-method-pills');
    const merchant = document.getElementById('exp-merchant').value.trim();
    const notes = document.getElementById('exp-notes').value.trim();

    if (!amount || amount <= 0) {
      errorEl.textContent = 'Ingresa un monto válido.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';
    try {
      let photoPath;
      if (pendingPhotoFile) {
        photoPath = await data.uploadReceiptPhoto(state.household.id, pendingPhotoFile);
      }

      const payload = {
        amount,
        expense_date: expenseDate,
        category_id: categoryId || null,
        payment_method_id: methodId || null,
        merchant: merchant || null,
        notes: notes || null,
      };
      if (photoPath) payload.photo_path = photoPath;

      if (state.editingExpenseId) {
        await data.updateExpense(state.editingExpenseId, payload);
        showToast('Gasto actualizado', 'success');
      } else {
        await data.addExpense(state.household.id, state.session.user.id, payload);
        showToast('Gasto guardado', 'success');
      }

      state.editingExpenseId = null;
      resetExpenseForm();
      setActiveView('history');
    } catch (err) {
      errorEl.textContent = err.message || 'Error al guardar.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = state.editingExpenseId ? 'Guardar cambios' : 'Guardar gasto';
    }
  });
}

/* ======================================================================
   FACTURAS / TARJETAS (VISTA MENSUAL)
   ====================================================================== */
function wireBillsNav() {
  document.getElementById('bills-prev-month').addEventListener('click', () => {
    state.billsMonth = addMonths(state.billsMonth, -1);
    renderBills();
  });
  document.getElementById('bills-next-month').addEventListener('click', () => {
    state.billsMonth = addMonths(state.billsMonth, 1);
    renderBills();
  });
  document.getElementById('btn-add-bill-instance').addEventListener('click', () => openBillInstanceModal());
}

async function renderBills() {
  document.getElementById('bills-month-label').textContent = capitalize(monthLabel(state.billsMonth));
  const periodISO = state.billsMonth.toISOString().slice(0, 10);

  let instances = [];
  try {
    instances = await data.fetchBillInstances(state.household.id, periodISO);
  } catch (err) {
    showToast('Error cargando facturas: ' + err.message, 'error');
    return;
  }

  const totalDue = instances.reduce((s, b) => s + Number(b.amount_due), 0);
  const totalPending = instances.reduce((s, b) => s + Math.max(0, Number(b.amount_due) - Number(b.amount_paid)), 0);
  document.getElementById('bills-total-due').textContent = fmtMoney(totalDue);
  document.getElementById('bills-total-pending').textContent = fmtMoney(totalPending);

  const list = document.getElementById('bills-list');
  const emptyEl = document.getElementById('bills-empty');
  list.innerHTML = '';

  if (!instances.length) {
    emptyEl.classList.remove('hidden');
  } else {
    emptyEl.classList.add('hidden');
    for (const b of instances) {
      const name = b.recurring_bills?.name || b.payment_methods?.name || 'Sin nombre';
      const color = b.payment_methods?.color || '#2563eb';
      const limit = b.payment_methods?.credit_limit ? Number(b.payment_methods.credit_limit) : null;
      const due = Number(b.amount_due);
      const paid = Number(b.amount_paid);
      const pending = Math.max(0, due - paid);
      const gaugePct = limit ? (pending / limit) * 100 : due > 0 ? (paid / due) * 100 : (b.status === 'pagado' ? 100 : 0);
      const gaugeText = limit ? 'uso de límite' : 'pagado';
      const rate = b.payment_methods?.monthly_interest_rate ? Number(b.payment_methods.monthly_interest_rate) : 0;
      const interestCost = pending > 0 && rate > 0 ? pending * rate : 0;

      const card = el(`
        <div class="bill-card" data-id="${b.id}" style="--bc-color:${color}">
          <div class="bill-card-top">
            <div>
              <div class="bill-card-name"><span class="bill-card-dot"></span>${escapeHtml(name)}</div>
              <div class="bill-card-cycle">${b.cycle_label ? escapeHtml(b.cycle_label) : (b.due_date ? 'Vence ' + fmtDate(b.due_date) : 'Sin ciclo')}</div>
            </div>
            <span class="chip status-${b.status}">${b.status}</span>
          </div>
          ${dueDateBadge(b.due_date, b.status)}
          <div class="bill-card-stats">
            <div class="bill-card-stat">
              <div class="bc-label">A pagar</div>
              <div class="bc-value">${fmtMoney(due)}</div>
            </div>
            <div class="bill-card-stat">
              <div class="bc-label">Pagado</div>
              <div class="bc-value">${fmtMoney(paid)}</div>
            </div>
            <div class="bill-card-stat bc-pending">
              <div class="bc-label">Pendiente</div>
              <div class="bc-value ${pending > 0 ? 'is-high' : ''}">${fmtMoney(pending)}</div>
            </div>
          </div>
          <div class="bill-card-gauge-row">
            ${gaugeSVG(gaugePct, { size: 'sm' })}
            <div class="bc-note">${limit ? `Límite ${fmtMoney(limit)} · ${gaugeText}` : gaugeText}${b.notes ? ' — ' + escapeHtml(b.notes) : ''}</div>
          </div>
          ${interestCost > 0 ? `
          <div class="interest-warning">
            <span>⚠️</span>
            <span>Si no pagas el saldo completo (${fmtMoney(pending)}), te cuesta ~${fmtMoney(interestCost)} en intereses este ciclo (${(rate * 100).toFixed(2)}% mensual).</span>
          </div>` : ''}
        </div>
      `);
      card.addEventListener('click', () => openBillInstanceModal(b));
      list.appendChild(card);
    }
  }
}

function openBillInstanceModal(instance) {
  const periodISO = state.billsMonth.toISOString().slice(0, 10);
  const isEdit = !!instance;

  const billOptions = state.recurringBills
    .map((rb) => `<option value="bill:${rb.id}" ${instance?.recurring_bill_id === rb.id ? 'selected' : ''}>${escapeHtml(rb.name)}</option>`)
    .join('');
  const methodOptions = state.paymentMethods
    .map((m) => `<option value="method:${m.id}" ${instance?.payment_method_id === m.id ? 'selected' : ''}>${escapeHtml(m.name)} (tarjeta)</option>`)
    .join('');

  const overlay = openModal(`
    <h3>${isEdit ? 'Editar' : 'Agregar'} factura / ciclo</h3>
    <div class="field">
      <label>Factura o tarjeta</label>
      <select id="bi-source">${billOptions}${methodOptions}</select>
    </div>
    <div class="field">
      <label>Etiqueta de ciclo (opcional, ej. "26 jul – 25 ago")</label>
      <input type="text" id="bi-cycle-label" value="${instance?.cycle_label ? escapeHtml(instance.cycle_label) : ''}" />
    </div>
    <div class="field">
      <label>Monto a pagar</label>
      <input type="number" step="0.01" id="bi-amount-due" value="${instance?.amount_due ?? ''}" />
    </div>
    <div class="field">
      <label>Monto pagado</label>
      <input type="number" step="0.01" id="bi-amount-paid" value="${instance?.amount_paid ?? 0}" />
    </div>
    <div class="field">
      <label>Fecha límite de pago</label>
      <input type="date" id="bi-due-date" value="${instance?.due_date || ''}" />
    </div>
    <div class="field">
      <label>Estado</label>
      <select id="bi-status">
        ${['pendiente', 'pagado', 'parcial', 'vencido']
          .map((s) => `<option value="${s}" ${instance?.status === s ? 'selected' : ''}>${s}</option>`)
          .join('')}
      </select>
    </div>
    <p class="error-text" id="bi-error"></p>
    <div class="modal-actions">
      <button class="btn btn-primary" id="bi-save">Guardar</button>
      ${isEdit ? '<button class="btn btn-danger" id="bi-delete">Eliminar</button>' : ''}
    </div>
  `);

  overlay.querySelector('#bi-save').addEventListener('click', async () => {
    const src = overlay.querySelector('#bi-source').value;
    if (!src) {
      overlay.querySelector('#bi-error').textContent = 'Agrega primero una tarjeta o factura recurrente en Ajustes.';
      return;
    }
    const [kind, id] = src.split(':');
    const payload = {
      id: instance?.id,
      period_month: periodISO,
      recurring_bill_id: kind === 'bill' ? id : null,
      payment_method_id: kind === 'method' ? id : null,
      cycle_label: overlay.querySelector('#bi-cycle-label').value.trim() || null,
      amount_due: parseFloat(overlay.querySelector('#bi-amount-due').value) || 0,
      amount_paid: parseFloat(overlay.querySelector('#bi-amount-paid').value) || 0,
      due_date: overlay.querySelector('#bi-due-date').value || null,
      status: overlay.querySelector('#bi-status').value,
    };
    try {
      await data.upsertBillInstance(state.household.id, payload);
      closeModal();
      showToast('Guardado', 'success');
      renderBills();
    } catch (err) {
      overlay.querySelector('#bi-error').textContent = err.message;
    }
  });

  const delBtn = overlay.querySelector('#bi-delete');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta factura del mes?')) return;
      await data.deleteBillInstance(instance.id);
      closeModal();
      renderBills();
    });
  }
}

/* ======================================================================
   AJUSTES
   ====================================================================== */
function wireSettingsButtons() {
  document.getElementById('btn-copy-invite').addEventListener('click', async () => {
    const code = state.household?.invite_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast('Código copiado');
    } catch {
      showToast(code);
    }
  });

  document.getElementById('btn-add-method').addEventListener('click', () => openMethodModal());
  document.getElementById('btn-add-recurring-bill').addEventListener('click', () => openRecurringBillModal());
  document.getElementById('btn-add-category').addEventListener('click', () => openCategoryModal());
  document.getElementById('btn-add-income').addEventListener('click', () => openIncomeModal());
}

async function renderSettings() {
  document.getElementById('invite-code-display').textContent = state.household?.invite_code || '------';

  const incomeList = document.getElementById('income-list');
  incomeList.innerHTML = '';
  if (!state.incomeSources.length) {
    incomeList.appendChild(el('<p class="helper-text">Sin ingresos registrados todavía.</p>'));
  }

  const monthStartISO = startOfMonth(new Date()).toISOString().slice(0, 10);
  let entriesThisMonth = [];
  try {
    entriesThisMonth = await data.fetchIncomeEntries(state.household.id, { from: monthStartISO });
  } catch {
    entriesThisMonth = [];
  }
  const receivedBySource = new Map();
  for (const e of entriesThisMonth) {
    receivedBySource.set(e.income_source_id, (receivedBySource.get(e.income_source_id) || 0) + Number(e.amount));
  }

  let receivedTotal = 0;
  for (const inc of state.incomeSources) {
    const received = receivedBySource.get(inc.id) || 0;
    receivedTotal += received;
    const row = el(`
      <div class="list-row">
        <div class="row-main" style="cursor:pointer;">
          <span class="color-dot" style="background:${inc.color}"></span>
          <div>
            <div>${escapeHtml(inc.name)}</div>
            <div class="row-sub">${fmtMoney(received)} recibido${inc.monthly_amount > 0 ? ' de meta ' + fmtMoney(inc.monthly_amount) : ' este mes'}</div>
          </div>
        </div>
        <div class="row-actions" style="display:flex;align-items:center;gap:6px;">
          <button data-action="log" title="Registrar ingreso recibido">➕</button>
          <button data-action="del">🗑️</button>
        </div>
      </div>
    `);
    row.querySelector('.row-main').addEventListener('click', () => openIncomeModal(inc));
    row.querySelector('[data-action="log"]').addEventListener('click', (e) => {
      e.stopPropagation();
      openLogIncomeModal(inc);
    });
    row.querySelector('[data-action="del"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`¿Eliminar "${inc.name}"?`)) return;
      await data.deleteIncomeSource(inc.id);
      await loadHouseholdData();
      renderSettings();
    });
    incomeList.appendChild(row);
  }
  document.getElementById('income-total').textContent = fmtMoney(receivedTotal);
  document.getElementById('income-total-label').textContent = 'Recibido este mes';

  const methodsList = document.getElementById('methods-list');
  methodsList.innerHTML = '';
  if (!state.paymentMethods.length) {
    methodsList.appendChild(el('<p class="helper-text">Sin métodos de pago todavía.</p>'));
  }
  for (const m of state.paymentMethods) {
    const row = el(`
      <div class="list-row">
        <div class="row-main">
          <span class="color-dot" style="background:${m.color}"></span>
          <div>
            <div>${escapeHtml(m.name)}</div>
            <div class="row-sub">${labelType(m.type)}${m.credit_limit ? ' · límite ' + fmtMoney(m.credit_limit) : ''}${m.starting_balance != null ? ' · saldo inicial ' + fmtMoney(m.starting_balance) : ''}</div>
          </div>
        </div>
        <div class="row-actions"><button data-action="archive">🗑️</button></div>
      </div>
    `);
    row.querySelector('[data-action="archive"]').addEventListener('click', async () => {
      if (!confirm(`¿Archivar "${m.name}"?`)) return;
      await data.archivePaymentMethod(m.id);
      await loadHouseholdData();
      renderSettings();
    });
    methodsList.appendChild(row);
  }

  const billsList = document.getElementById('recurring-bills-list');
  billsList.innerHTML = '';
  if (!state.recurringBills.length) {
    billsList.appendChild(el('<p class="helper-text">Sin facturas recurrentes todavía.</p>'));
  }
  for (const b of state.recurringBills) {
    billsList.appendChild(
      el(`
      <div class="list-row">
        <div class="row-main">
          <div>
            <div>${escapeHtml(b.name)}</div>
            <div class="row-sub">${b.default_amount ? fmtMoney(b.default_amount) : 'Monto variable'}${b.due_day ? ' · día ' + b.due_day : ''}</div>
          </div>
        </div>
      </div>
    `)
    );
  }

  const catList = document.getElementById('categories-list');
  catList.innerHTML = '';
  for (const c of state.categories) {
    const row = el(`
      <div class="list-row">
        <div class="row-main">
          <span>${c.icon}</span>
          <div>${escapeHtml(c.name)}</div>
        </div>
        ${!c.is_default ? '<div class="row-actions"><button data-action="del">🗑️</button></div>' : ''}
      </div>
    `);
    const delBtn = row.querySelector('[data-action="del"]');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm(`¿Eliminar categoría "${c.name}"?`)) return;
        await data.deleteCategory(c.id);
        await loadHouseholdData();
        renderSettings();
      });
    }
    catList.appendChild(row);
  }
}

function labelType(t) {
  return { credit_card: 'Tarjeta de crédito', debit_card: 'Tarjeta de débito', cash: 'Efectivo', wallet: 'Billetera digital' }[t] || t;
}

function openMethodModal(fromExpenseForm) {
  const overlay = openModal(`
    <h3>Nuevo método de pago</h3>
    <div class="field">
      <label>Nombre</label>
      <input type="text" id="pm-name" placeholder="Ej. Visa Global Bank" />
    </div>
    <div class="field">
      <label>Tipo</label>
      <select id="pm-type">
        <option value="credit_card">Tarjeta de crédito</option>
        <option value="debit_card">Tarjeta de débito</option>
        <option value="cash">Efectivo</option>
        <option value="wallet">Billetera digital (Yappy, etc.)</option>
      </select>
    </div>
    <div class="field">
      <label>Límite de crédito (si aplica)</label>
      <input type="number" step="0.01" id="pm-limit" />
    </div>
    <div class="field">
      <label>Día de corte (si aplica)</label>
      <input type="number" min="1" max="31" id="pm-close-day" />
    </div>
    <div class="field">
      <label>Día límite de pago (si aplica)</label>
      <input type="number" min="1" max="31" id="pm-due-day" />
    </div>
    <div class="field">
      <label>Tasa de interés mensual % (si aplica)</label>
      <input type="number" step="0.01" id="pm-rate" />
    </div>
    <div class="field">
      <label>Saldo inicial (para efectivo / billetera)</label>
      <input type="number" step="0.01" id="pm-starting-balance" />
    </div>
    <p class="error-text" id="pm-error"></p>
    <button class="btn btn-primary" id="pm-save">Guardar</button>
  `);
  overlay.querySelector('#pm-save').addEventListener('click', async () => {
    const name = overlay.querySelector('#pm-name').value.trim();
    if (!name) {
      overlay.querySelector('#pm-error').textContent = 'El nombre es obligatorio.';
      return;
    }
    const rateInput = overlay.querySelector('#pm-rate').value;
    const startingBalanceInput = overlay.querySelector('#pm-starting-balance').value;
    try {
      const created = await data.addPaymentMethod(state.household.id, {
        name,
        type: overlay.querySelector('#pm-type').value,
        credit_limit: overlay.querySelector('#pm-limit').value || null,
        cycle_close_day: overlay.querySelector('#pm-close-day').value || null,
        payment_due_day: overlay.querySelector('#pm-due-day').value || null,
        monthly_interest_rate: rateInput ? parseFloat(rateInput) / 100 : null,
        starting_balance: startingBalanceInput ? parseFloat(startingBalanceInput) : null,
      });
      await loadHouseholdData();
      closeModal();
      showToast('Método agregado', 'success');
      if (fromExpenseForm) {
        renderExpenseFormOptions();
        selectPill('exp-method-pills', created.id);
      } else {
        renderSettings();
      }
    } catch (err) {
      overlay.querySelector('#pm-error').textContent = err.message;
    }
  });
}

function openRecurringBillModal() {
  const catOptions = state.categories.map((c) => `<option value="${c.id}">${c.icon} ${escapeHtml(c.name)}</option>`).join('');
  const overlay = openModal(`
    <h3>Nueva factura recurrente</h3>
    <div class="field">
      <label>Nombre</label>
      <input type="text" id="rb-name" placeholder="Ej. ENSA (electricidad y aseo)" />
    </div>
    <div class="field">
      <label>Categoría</label>
      <select id="rb-category">${catOptions}</select>
    </div>
    <div class="field">
      <label>Monto habitual (opcional)</label>
      <input type="number" step="0.01" id="rb-amount" />
    </div>
    <div class="field">
      <label>Día del mes en que vence</label>
      <input type="number" min="1" max="31" id="rb-due-day" />
    </div>
    <p class="error-text" id="rb-error"></p>
    <button class="btn btn-primary" id="rb-save">Guardar</button>
  `);
  overlay.querySelector('#rb-save').addEventListener('click', async () => {
    const name = overlay.querySelector('#rb-name').value.trim();
    if (!name) {
      overlay.querySelector('#rb-error').textContent = 'El nombre es obligatorio.';
      return;
    }
    try {
      await data.addRecurringBill(state.household.id, {
        name,
        category_id: overlay.querySelector('#rb-category').value || null,
        default_amount: overlay.querySelector('#rb-amount').value || null,
        due_day: overlay.querySelector('#rb-due-day').value || null,
      });
      await loadHouseholdData();
      closeModal();
      renderSettings();
      showToast('Factura agregada', 'success');
    } catch (err) {
      overlay.querySelector('#rb-error').textContent = err.message;
    }
  });
}

function openCategoryModal(fromExpenseForm) {
  const overlay = openModal(`
    <h3>Nueva categoría</h3>
    <div class="field">
      <label>Nombre</label>
      <input type="text" id="cat-name" placeholder="Ej. Mascotas" />
    </div>
    <div class="field">
      <label>Ícono (emoji)</label>
      <input type="text" id="cat-icon" placeholder="🐾" maxlength="4" />
    </div>
    <div class="field">
      <label>Color</label>
      <input type="color" id="cat-color" value="#6b7280" />
    </div>
    <p class="error-text" id="cat-error"></p>
    <button class="btn btn-primary" id="cat-save">Guardar</button>
  `);
  overlay.querySelector('#cat-save').addEventListener('click', async () => {
    const name = overlay.querySelector('#cat-name').value.trim();
    if (!name) {
      overlay.querySelector('#cat-error').textContent = 'El nombre es obligatorio.';
      return;
    }
    try {
      const created = await data.addCategory(state.household.id, {
        name,
        icon: overlay.querySelector('#cat-icon').value.trim() || '💸',
        color: overlay.querySelector('#cat-color').value,
      });
      await loadHouseholdData();
      closeModal();
      showToast('Categoría agregada', 'success');
      if (fromExpenseForm) {
        renderExpenseFormOptions();
        selectPill('exp-category-pills', created.id);
      } else {
        renderSettings();
      }
    } catch (err) {
      overlay.querySelector('#cat-error').textContent = err.message;
    }
  });
}

function openIncomeModal(income) {
  const isEdit = !!income;
  const overlay = openModal(`
    <h3>${isEdit ? 'Editar ingreso' : 'Nuevo ingreso'}</h3>
    <div class="field">
      <label>Nombre</label>
      <input type="text" id="inc-name" placeholder="Ej. Salario" value="${income ? escapeHtml(income.name) : ''}" />
    </div>
    <div class="field">
      <label>Meta mensual (opcional)</label>
      <input type="number" step="0.01" min="0" id="inc-amount" value="${income ? income.monthly_amount : ''}" />
    </div>
    <div class="field">
      <label>Color</label>
      <input type="color" id="inc-color" value="${income ? income.color : '#22c55e'}" />
    </div>
    <p class="error-text" id="inc-error"></p>
    <div class="modal-actions">
      <button class="btn btn-primary" id="inc-save">Guardar</button>
      ${isEdit ? '<button class="btn btn-danger" id="inc-delete">Eliminar</button>' : ''}
    </div>
  `);
  overlay.querySelector('#inc-save').addEventListener('click', async () => {
    const name = overlay.querySelector('#inc-name').value.trim();
    const amount = parseFloat(overlay.querySelector('#inc-amount').value);
    if (!name) {
      overlay.querySelector('#inc-error').textContent = 'El nombre es obligatorio.';
      return;
    }
    if (isNaN(amount) || amount < 0) {
      overlay.querySelector('#inc-error').textContent = 'Ingresa un monto válido.';
      return;
    }
    try {
      const payload = { name, monthly_amount: amount, color: overlay.querySelector('#inc-color').value };
      if (isEdit) {
        await data.updateIncomeSource(income.id, payload);
      } else {
        await data.addIncomeSource(state.household.id, payload);
      }
      await loadHouseholdData();
      closeModal();
      renderSettings();
      showToast('Ingreso guardado', 'success');
    } catch (err) {
      overlay.querySelector('#inc-error').textContent = err.message;
    }
  });
  const delBtn = overlay.querySelector('#inc-delete');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar "${income.name}"?`)) return;
      await data.deleteIncomeSource(income.id);
      await loadHouseholdData();
      closeModal();
      renderSettings();
    });
  }
}

function openLogIncomeModal(incomeSource) {
  const overlay = openModal(`
    <h3>Registrar ingreso — ${escapeHtml(incomeSource.name)}</h3>
    <div class="field">
      <label>Monto recibido</label>
      <input type="number" step="0.01" min="0.01" id="ie-amount" class="amount-input" placeholder="0.00" />
    </div>
    <div class="field">
      <label>Fecha</label>
      <input type="date" id="ie-date" value="${todayISO()}" />
    </div>
    <div class="field">
      <label>Notas (opcional)</label>
      <input type="text" id="ie-notes" placeholder="Ej. quincena, pago de cliente..." />
    </div>
    <p class="error-text" id="ie-error"></p>
    <button class="btn btn-primary" id="ie-save">Guardar ingreso</button>
  `);
  overlay.querySelector('#ie-save').addEventListener('click', async () => {
    const amount = parseFloat(overlay.querySelector('#ie-amount').value);
    if (!amount || amount <= 0) {
      overlay.querySelector('#ie-error').textContent = 'Ingresa un monto válido.';
      return;
    }
    try {
      await data.addIncomeEntry(state.household.id, state.session.user.id, {
        income_source_id: incomeSource.id,
        amount,
        entry_date: overlay.querySelector('#ie-date').value || todayISO(),
        notes: overlay.querySelector('#ie-notes').value.trim() || null,
      });
      closeModal();
      showToast('Ingreso registrado', 'success');
      renderSettings();
    } catch (err) {
      overlay.querySelector('#ie-error').textContent = err.message;
    }
  });
}

/* ======================================================================
   HELPERS
   ====================================================================== */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

init();
