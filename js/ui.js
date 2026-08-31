export function showToast(message, type = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmtDate(d) {
  const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  return date.toLocaleDateString('es-PA', { day: 'numeric', month: 'short' });
}

export function fmtDateLong(d) {
  const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  return date.toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function monthLabel(date) {
  return date.toLocaleDateString('es-PA', { month: 'long', year: 'numeric' });
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Categorical chart palette, fixed order (dataviz dark-mode steps).
export const CATEGORY_PALETTE = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#22c55e', '#9085e9', '#e66767',
];

export function paletteColor(index) {
  return CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
}

// Semaphore level from a 0-100+ percent value.
export function gaugeLevel(pct) {
  if (pct >= 100) return 'critical';
  if (pct >= 90) return 'serious';
  if (pct >= 70) return 'warning';
  return 'good';
}

const LEVEL_VARS = {
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  serious: 'var(--status-serious)',
  critical: 'var(--status-critical)',
};

export function levelColor(level) {
  return LEVEL_VARS[level] || LEVEL_VARS.good;
}

// Days between today and a YYYY-MM-DD date (negative = already past).
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(todayISO() + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

// Renders a due-date badge, color-coded by urgency (paid bills always read as settled).
export function dueDateBadge(dueDate, status) {
  if (!dueDate) return '';
  const d = daysUntil(dueDate);
  const dateLabel = fmtDate(dueDate);

  if (status === 'pagado') {
    return `<div class="due-badge due-settled">📅 Pagada · vencía ${dateLabel}</div>`;
  }
  let level, text;
  if (d < 0) {
    level = 'critical';
    text = `Venció hace ${Math.abs(d)} día${Math.abs(d) === 1 ? '' : 's'} · ${dateLabel}`;
  } else if (d === 0) {
    level = 'critical';
    text = `¡Vence hoy! · ${dateLabel}`;
  } else if (d <= 3) {
    level = 'serious';
    text = `Vence en ${d} día${d === 1 ? '' : 's'} · ${dateLabel}`;
  } else if (d <= 7) {
    level = 'warning';
    text = `Vence en ${d} días · ${dateLabel}`;
  } else {
    level = 'good';
    text = `Vence ${dateLabel} · en ${d} días`;
  }
  return `<div class="due-badge due-level-${level}">📅 ${text}</div>`;
}

// Renders a radial SVG gauge with a centered percent label.
export function gaugeSVG(pct, { size = 'md', showLabel = true } = {}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const level = gaugeLevel(pct);
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  const sizeClass = size === 'sm' ? ' gauge-sm' : '';
  return `
    <div class="gauge-wrap${sizeClass}">
      <svg viewBox="0 0 100 100">
        <circle class="gauge-track" cx="50" cy="50" r="${r}" stroke-width="10" />
        <circle class="gauge-fill level-${level}" cx="50" cy="50" r="${r}" stroke-width="10"
          stroke-dasharray="${c}" stroke-dashoffset="${offset}" />
      </svg>
      ${showLabel ? `<div class="gauge-center-label">${Math.round(pct)}%</div>` : ''}
    </div>
  `;
}
