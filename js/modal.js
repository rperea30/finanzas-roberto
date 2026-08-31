export function openModal(innerHTML) {
  closeModal();
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'active-modal-overlay';
  overlay.innerHTML = `<div class="modal-box">${innerHTML}</div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  root.appendChild(overlay);
  return overlay;
}

export function closeModal() {
  const existing = document.getElementById('active-modal-overlay');
  if (existing) existing.remove();
}
