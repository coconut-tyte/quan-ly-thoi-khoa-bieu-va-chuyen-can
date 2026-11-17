/**
 * @file toast.js
 * Hiển thị thông báo toast ngắn ở góc màn hình.
 * @module toast
 */

/** Container toast – tạo một lần duy nhất */
let _container = null;

/**
 * Lấy hoặc tạo container toast.
 * @returns {HTMLElement}
 */
function _getContainer() {
  if (_container) return _container;
  _container = document.createElement('div');
  _container.id = 'toast-container';
  _container.setAttribute('aria-live', 'polite');
  _container.setAttribute('aria-atomic', 'false');
  Object.assign(_container.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '9999',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    pointerEvents: 'none',
  });
  document.body.appendChild(_container);
  return _container;
}

/**
 * Hiển thị một toast.
 * @param {string} message - Nội dung thông báo
 * @param {'info'|'success'|'warning'|'error'} [type='info'] - Loại toast
 * @param {number} [duration=3000] - Thời gian hiển thị (ms)
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = _getContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');

  // Dùng textContent để tránh XSS
  toast.textContent = message;

  // Style inline để toast hoạt động độc lập không phụ thuộc CSS ngoài
  Object.assign(toast.style, {
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#fff',
    maxWidth: '320px',
    wordBreak: 'break-word',
    boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
    pointerEvents: 'auto',
    opacity: '0',
    transform: 'translateY(8px)',
    transition: 'opacity 0.25s ease, transform 0.25s ease',
    background: _bgColor(type),
  });

  container.appendChild(toast);

  // Trigger animation vào
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
  });

  // Tự đóng sau `duration` ms
  const timer = setTimeout(() => _dismiss(toast), duration);

  // Click để đóng sớm
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    _dismiss(toast);
  });
}

/**
 * Màu nền theo loại toast.
 * @param {string} type
 * @returns {string}
 */
function _bgColor(type) {
  const map = {
    info: '#3b5bdb',
    success: '#16a34a',
    warning: '#d97706',
    error: '#dc2626',
  };
  return map[type] ?? map.info;
}

/**
 * Ẩn và xoá một toast.
 * @param {HTMLElement} el
 */
function _dismiss(el) {
  el.style.opacity = '0';
  el.style.transform = 'translateY(8px)';
  setTimeout(() => el.remove(), 280);
}
