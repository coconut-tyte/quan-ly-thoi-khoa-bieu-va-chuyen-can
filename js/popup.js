/**
 * @file popup.js
 * Popup đơn chọn trạng thái điểm danh.
 * Dùng một phần tử DOM duy nhất, tái sử dụng cho mọi ca học.
 * @module popup
 */

/** Các lựa chọn trong popup */
const OPTIONS = [
  { status: 'present', label: 'Có mặt',     emoji: '✅', key: '1' },
  { status: 'late',    label: 'Muộn',        emoji: '⏰', key: '2' },
  { status: 'absent',  label: 'Vắng',        emoji: '❌', key: '3' },
  { status: 'excused', label: 'Có phép',     emoji: '📋', key: '4' },
  { status: null,      label: 'Bỏ đánh dấu', emoji: '🔄', key: '5' },
];

/** Phần tử popup (singleton) */
let _popup = null;
/** Session đang được chọn */
let _currentSessionId = null;
/** Phần tử trigger mở popup (để trả focus) */
let _triggerEl = null;
/** Callback gọi khi user chọn trạng thái */
let _onSelect = null;

/**
 * Tạo phần tử popup một lần.
 */
function _createPopup() {
  const el = document.createElement('div');
  el.id = 'attendance-popup';
  el.setAttribute('role', 'menu');
  el.setAttribute('aria-label', 'Chọn trạng thái điểm danh');
  el.setAttribute('tabindex', '-1');

  Object.assign(el.style, {
    position: 'fixed',
    zIndex: '10000',
    background: 'var(--surface, #fff)',
    border: '1px solid var(--border, #d9dce6)',
    borderRadius: '10px',
    boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
    padding: '6px',
    minWidth: '170px',
    display: 'none',
    flexDirection: 'column',
    gap: '2px',
    outline: 'none',
  });

  // Dùng event delegation cho các nút bên trong popup
  el.addEventListener('click', _handleOptionClick);
  el.addEventListener('keydown', _handlePopupKeydown);

  // Tạo các mục menu
  OPTIONS.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('data-status', opt.status ?? '');
    btn.setAttribute('tabindex', idx === 0 ? '0' : '-1');
    // aria-label đọc được rõ ràng hơn
    btn.setAttribute('aria-label', `${opt.label} (phím ${opt.key})`);

    Object.assign(btn.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '100%',
      padding: '8px 10px',
      borderRadius: '6px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '500',
      color: 'var(--text, #1d2233)',
      textAlign: 'left',
      transition: 'background 0.15s ease',
    });

    // Emoji + label (không dùng innerHTML)
    const emojiSpan = document.createElement('span');
    emojiSpan.textContent = opt.emoji;
    emojiSpan.setAttribute('aria-hidden', 'true');

    const labelSpan = document.createElement('span');
    labelSpan.textContent = opt.label;

    const keySpan = document.createElement('span');
    keySpan.textContent = opt.key;
    Object.assign(keySpan.style, {
      marginLeft: 'auto',
      fontSize: '0.75rem',
      color: 'var(--text-muted, #636a80)',
      fontFamily: 'monospace',
    });

    btn.append(emojiSpan, labelSpan, keySpan);

    // Hiệu ứng hover bằng JS (không phụ thuộc CSS ngoài)
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--surface-2, #eef0f6)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });

    el.appendChild(btn);
  });

  document.body.appendChild(el);
  return el;
}

/**
 * Lấy hoặc tạo popup.
 * @returns {HTMLElement}
 */
function _getPopup() {
  if (!_popup) _popup = _createPopup();
  return _popup;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Mở popup cạnh một ô ca học.
 * @param {string} sessionId - ID session đang chọn
 * @param {HTMLElement} anchorEl - Phần tử ô .session để định vị
 * @param {(sessionId:string, status:string|null) => void} onSelect - Callback khi chọn
 */
export function openPopup(sessionId, anchorEl, onSelect) {
  const popup = _getPopup();
  _currentSessionId = sessionId;
  _triggerEl = anchorEl;
  _onSelect = onSelect;

  // Hiển thị trước để lấy kích thước
  popup.style.display = 'flex';
  popup.style.visibility = 'hidden';

  // Định vị cạnh ô, không tràn màn hình
  _positionPopup(popup, anchorEl);

  popup.style.visibility = 'visible';

  // Focus vào nút đầu tiên
  const firstBtn = popup.querySelector('[role="menuitem"]');
  firstBtn?.focus();

  // Đóng khi click ra ngoài hoặc Esc
  setTimeout(() => {
    document.addEventListener('click', _handleOutsideClick, { once: false, capture: true });
    document.addEventListener('keydown', _handleEscKey);
  }, 0);
}

/**
 * Đóng popup.
 */
export function closePopup() {
  const popup = _getPopup();
  popup.style.display = 'none';
  _currentSessionId = null;
  _onSelect = null;

  document.removeEventListener('click', _handleOutsideClick, true);
  document.removeEventListener('keydown', _handleEscKey);

  // Trả focus về ô trigger
  _triggerEl?.focus();
  _triggerEl = null;
}

/**
 * Kiểm tra popup có đang mở không.
 * @returns {boolean}
 */
export function isPopupOpen() {
  return _popup?.style.display !== 'none' && _popup !== null;
}

// ─── Vị trí popup ────────────────────────────────────────────────────────────

/**
 * Định vị popup gần anchorEl, không tràn ra ngoài viewport.
 * @param {HTMLElement} popup
 * @param {HTMLElement} anchor
 */
function _positionPopup(popup, anchor) {
  const rect = anchor.getBoundingClientRect();
  const pRect = popup.getBoundingClientRect();
  const margin = 8;

  let top = rect.bottom + margin;
  let left = rect.left;

  // Tràn dưới → hiện phía trên
  if (top + pRect.height > window.innerHeight - margin) {
    top = rect.top - pRect.height - margin;
  }
  // Tràn phải → dịch trái
  if (left + pRect.width > window.innerWidth - margin) {
    left = window.innerWidth - pRect.width - margin;
  }
  // Không âm bên trái
  if (left < margin) left = margin;
  // Không âm bên trên
  if (top < margin) top = margin;

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}

// ─── Event handlers ──────────────────────────────────────────────────────────

/** Event delegation trong popup */
function _handleOptionClick(e) {
  const btn = e.target.closest('[role="menuitem"]');
  if (!btn) return;
  const status = btn.dataset.status || null;
  _onSelect?.(_currentSessionId, status === '' ? null : status);
  closePopup();
}

/** Điều hướng bàn phím trong popup */
function _handlePopupKeydown(e) {
  const items = [..._getPopup().querySelectorAll('[role="menuitem"]')];
  const focused = document.activeElement;
  const idx = items.indexOf(focused);

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
      break;
    case 'ArrowUp':
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
      break;
    case 'Home':
      e.preventDefault();
      items[0]?.focus();
      break;
    case 'End':
      e.preventDefault();
      items[items.length - 1]?.focus();
      break;
    // Phím 1-5 chọn nhanh
    case '1': case '2': case '3': case '4': case '5': {
      const opt = OPTIONS.find((o) => o.key === e.key);
      if (opt) {
        _onSelect?.(_currentSessionId, opt.status);
        closePopup();
      }
      break;
    }
  }
}

/** Đóng khi click bên ngoài */
function _handleOutsideClick(e) {
  const popup = _getPopup();
  if (popup.contains(e.target)) return;
  if (_triggerEl?.contains(e.target)) return; // click lại ô trigger → xử lý bên attendance.js
  closePopup();
}

/** Đóng khi Esc */
function _handleEscKey(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closePopup();
  }
}
