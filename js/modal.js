export function openModal(innerHTML) {
  closeModal();
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'active-modal-overlay';
  overlay.innerHTML = `<div class="modal-box"><button type="button" class="modal-close-btn" aria-label="Cerrar">✕</button>${innerHTML}</div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  overlay.querySelector('.modal-close-btn').addEventListener('click', () => closeModal());
  root.appendChild(overlay);
  return overlay;
}

export function closeModal() {
  const existing = document.getElementById('active-modal-overlay');
  if (existing) existing.remove();
}
