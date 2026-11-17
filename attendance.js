/* =====================================================================
   attendance.js — TV3: ĐIỂM DANH (JS tương tác)
   ---------------------------------------------------------------------
   Gộp 5 file cũ của TV3 (attendance.js, popup.js, state.js, toast.js, và
   phần dùng chung) thành 1 file chạy bằng <script> thường — mở index.html
   trực tiếp (file://) vẫn chạy, không cần server như khi dùng import/export.
   Cấu trúc file:  TOAST → STATE (undo/redo) → POPUP → ĐIỂM DANH
   Công khai ra ngoài:  window.Attendance = { setStatus, undo, redo, showToast, init }
   Phát sự kiện:        document 'attendance:changed'  detail { id, status, method }
   ===================================================================== */
(function () {
'use strict';

// ═════════════════════════════════════════════════════════════════════════════
// TOAST (từ toast.js)
// ═════════════════════════════════════════════════════════════════════════════

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
function showToast(message, type = 'info', duration = 3000) {
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

// ═════════════════════════════════════════════════════════════════════════════
// STATE — undo / redo / applyStatus (từ state.js của TV3)
// Dữ liệu nay nằm ở DataStore (data.js, TV5) → không còn _data riêng, không còn storage.js
// ═════════════════════════════════════════════════════════════════════════════
const Data = window.DataStore;

/** Stack Undo / Redo – mỗi phần tử { sessionId, from, to } */
const _undoStack = [];
const _redoStack = [];
const MAX_STACK = 20;

function getSession(id) { return Data.getSession(id); }
function getCourse(id)  { return Data.getCourse(id); }

/** Hàm mutation duy nhất đổi trạng thái 1 buổi + ghi history. Dùng qua setStatus(). */
function applyStatus(sessionId, newStatus, method = 'manual', { pushUndo = true } = {}) {
  const session = getSession(sessionId);
  if (!session) return;
  const oldStatus = session.status;
  session.status = newStatus;

  const history = Data.getData().history;
  history.push({
    id: `h${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sessionId, from: oldStatus, to: newStatus, at: new Date().toISOString(), method,
  });
  if (history.length > 100) history.shift();

  if (pushUndo) {
    _undoStack.push({ sessionId, from: oldStatus, to: newStatus });
    if (_undoStack.length > MAX_STACK) _undoStack.shift();
    _redoStack.length = 0;
  }
  Data.commit({ kind: 'status', sessionId, status: newStatus, method });
}

function canUndo() { return _undoStack.length > 0; }
function canRedo() { return _redoStack.length > 0; }

function undo() {
  while (canUndo()) {
    const { sessionId, from, to } = _undoStack.pop();
    if (!getSession(sessionId)) continue;            // buổi đã bị xóa → bỏ qua
    _redoStack.push({ sessionId, from, to });
    applyStatus(sessionId, from, 'manual', { pushUndo: false });
    return { sessionId, status: from };
  }
  return null;
}

function redo() {
  while (canRedo()) {
    const { sessionId, from, to } = _redoStack.pop();
    if (!getSession(sessionId)) continue;
    _undoStack.push({ sessionId, from, to });
    applyStatus(sessionId, to, 'manual', { pushUndo: false });
    return { sessionId, status: to };
  }
  return null;
}

/** Đăng ký callback khi dữ liệu đổi. */
function subscribe(fn) { return Data.subscribe(fn); }

/** Buổi học ở tương lai? (so sánh theo NGÀY ĐỊA PHƯƠNG – bản gốc dùng UTC nên lệch 1 ngày ở VN) */
function isFuture(session) { return session.date > Data.date.today(); }

/** Xoay vòng trạng thái: null → present → late → absent → excused → null */
function cycleStatus(current) {
  const cycle = [null, 'present', 'late', 'absent', 'excused'];
  return cycle[(cycle.indexOf(current) + 1) % cycle.length];
}

// Khi dữ liệu thay đổi cấu trúc (xóa/nhập/đặt lại/đồng bộ tab) → xóa stack undo/redo cho an toàn
Data.subscribe((d) => {
  if (d && d.kind && d.kind !== 'status') {
    _undoStack.length = 0; _redoStack.length = 0;
    _updateUndoRedoButtons();
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POPUP chọn trạng thái (từ popup.js)
// ═════════════════════════════════════════════════════════════════════════════

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
function openPopup(sessionId, anchorEl, onSelect) {
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
function closePopup() {
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
function isPopupOpen() {
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

// ═════════════════════════════════════════════════════════════════════════════
// ĐIỂM DANH (từ attendance.js)
// ═════════════════════════════════════════════════════════════════════════════


// ─── Hằng số ─────────────────────────────────────────────────────────────────

/** Thời gian khóa click liên tiếp quá nhanh (ms) */
const CLICK_LOCK_MS = 150;
/** Thời gian nhấn giữ để xoá trạng thái trên mobile (ms) */
const LONG_PRESS_MS = 500;
/** Vòng xoay trạng thái cho Shift+Click / Double-click */
const STATUS_LABELS = {
  present: 'Có mặt',
  late:    'Muộn',
  absent:  'Vắng',
  excused: 'Có phép',
  null:    'Chưa điểm danh',
};

// ─── State nội bộ ─────────────────────────────────────────────────────────────

/** Map sessionId → timestamp lần click cuối (chống click nhanh) */
const _lockMap = new Map();
/** Long-press timer (mobile) */
let _longPressTimer = null;
/** sessionId đang trong long-press */
let _longPressId = null;

// ─── Khởi tạo ────────────────────────────────────────────────────────────────

/**
 * Khởi tạo module điểm danh.
 * Gắn event delegation lên #calendar và phím tắt toàn cục.
 * @param {HTMLElement} [calendarEl] - Container lịch (mặc định #calendar)
 */
function initAttendance(calendarEl) {
  const container = calendarEl ?? document.getElementById('calendar');
  if (!container) {
    console.warn('[attendance] Không tìm thấy #calendar');
    return;
  }

  // ── Event delegation: CHỈ MỘT listener 'click' ──────────────────────────
  container.addEventListener('click', _handleClick);
  container.addEventListener('dblclick', _handleDblClick);
  container.addEventListener('contextmenu', _handleContextMenu);

  // Mobile: nhấn giữ
  container.addEventListener('pointerdown', _handlePointerDown);
  container.addEventListener('pointerup',   _handlePointerUp);
  container.addEventListener('pointermove', _handlePointerMove);
  container.addEventListener('pointercancel', _handlePointerUp);

  // Phím tắt: Enter/Space mở popup, Ctrl+Z undo, Ctrl+Y redo
  container.addEventListener('keydown', _handleContainerKeydown);
  document.addEventListener('keydown', _handleGlobalKeydown);

  // Đăng ký nút Undo nếu có
  document.getElementById('btn-undo')?.addEventListener('click', handleUndo);
  document.getElementById('btn-redo')?.addEventListener('click', handleRedo);

  // Lắng nghe thay đổi state để cập nhật nút undo/redo
  subscribe(_updateUndoRedoButtons);
  _updateUndoRedoButtons();
}

// ─── Hàm trung tâm ───────────────────────────────────────────────────────────

/**
 * Hàm trung tâm: đặt trạng thái cho một session.
 * Các module khác (QR, GPS) gọi hàm này để ghi điểm danh.
 * @param {string} sessionId
 * @param {string|null} status - 'present' | 'late' | 'absent' | 'excused' | null
 * @param {'manual'|'qr'|'gps'} [method='manual']
 */
function setStatus(sessionId, status, method = 'manual') {
  const session = getSession(sessionId);
  if (!session) return;

  // Chặn buổi tương lai (trừ khi là QR/GPS)
  if (method === 'manual' && isFuture(session)) {
    const confirmed = window.confirm(
      `Buổi học ngày ${session.date} chưa diễn ra.\nBạn có chắc muốn đánh dấu không?`
    );
    if (!confirmed) {
      showToast('Buổi này chưa diễn ra', 'warning');
      return;
    }
  }

  // Ghi vào state
  applyStatus(sessionId, status, method);

  // Cập nhật DOM tức thì
  _updateSessionEl(sessionId, status);

  // Phát CustomEvent để TV4 (thống kê) lắng nghe
  document.dispatchEvent(
    new CustomEvent('attendance:changed', {
      bubbles: true,
      detail: { id: sessionId, status, method },
    })
  );

  // Vibrate nhẹ trên mobile
  navigator.vibrate?.(30);
}

// ─── Cập nhật DOM ─────────────────────────────────────────────────────────────

/**
 * Cập nhật đúng ô session vừa đổi, không render lại cả lịch.
 * @param {string} sessionId
 * @param {string|null} status
 */
function _updateSessionEl(sessionId, status) {
  const el = document.querySelector(`[data-session-id="${CSS.escape(sessionId)}"]`);
  if (!el) return;

  // 1. dataset.status
  if (status === null) {
    delete el.dataset.status;
  } else {
    el.dataset.status = status;
  }

  // 2. Badge
  const badge = el.querySelector('.badge');
  if (badge) {
    const label = STATUS_LABELS[status] ?? STATUS_LABELS['null'];
    badge.textContent = label;
    badge.dataset.status = status ?? 'none';
    badge.className = `badge ${status ?? 'none'}`;
  }

  // 3. aria-label
  const session = getSession(sessionId);
  const course  = session ? getCourse(session.courseId) : null;
  const courseName = course?.name ?? 'Ca học';
  const statusText = STATUS_LABELS[status] ?? 'Chưa điểm danh';
  el.setAttribute('aria-label', `${courseName} – ${statusText}`);

  // 4. Hiệu ứng "pop" (TV2 viết CSS .pop { animation: pop ... })
  el.classList.remove('pop', 'updated');
  // Force reflow để restart animation
  void el.offsetWidth;
  el.classList.add('pop', 'updated');
  el.addEventListener('animationend', () => el.classList.remove('pop', 'updated'), { once: true });
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

/**
 * Click thường: mở popup (trừ Shift+Click → xoay vòng).
 */
function _handleClick(e) {
  // Shift+Click → xoay vòng nhanh
  if (e.shiftKey) {
    _doQuickCycle(e);
    return;
  }

  const sessionEl = e.target.closest('.session');
  if (!sessionEl) {
    // Click ra ngoài session → đóng popup (nếu có)
    if (isPopupOpen()) closePopup();
    return;
  }

  const sessionId = sessionEl.dataset.sessionId;
  if (!sessionId) return;

  // Chống click quá nhanh
  if (_isLocked(sessionId)) return;
  _lock(sessionId);

  // Toggle popup: nếu đang mở cho cùng session → đóng
  if (isPopupOpen()) {
    closePopup();
    return;
  }

  openPopup(sessionId, sessionEl, (id, status) => {
    setStatus(id, status);
  });
}

/**
 * Double-click: xoay vòng nhanh.
 */
function _handleDblClick(e) {
  _doQuickCycle(e);
}

/**
 * Chuột phải: xoá đánh dấu (bỏ trạng thái → null).
 */
function _handleContextMenu(e) {
  const sessionEl = e.target.closest('.session');
  if (!sessionEl) return;
  e.preventDefault();

  const sessionId = sessionEl.dataset.sessionId;
  if (!sessionId) return;
  if (_isLocked(sessionId)) return;
  _lock(sessionId);

  setStatus(sessionId, null);
  showToast('Đã bỏ đánh dấu', 'info');
}

/**
 * Nhấn giữ trên mobile (pointerdown → 500ms).
 */
function _handlePointerDown(e) {
  const sessionEl = e.target.closest('.session');
  if (!sessionEl || e.pointerType !== 'touch') return;

  const sessionId = sessionEl.dataset.sessionId;
  if (!sessionId) return;

  _longPressId = sessionId;
  _longPressTimer = setTimeout(() => {
    if (_longPressId !== sessionId) return;
    navigator.vibrate?.(50);
    setStatus(sessionId, null);
    showToast('Đã bỏ đánh dấu', 'info');
    _longPressId = null;
  }, LONG_PRESS_MS);
}

function _handlePointerUp() {
  clearTimeout(_longPressTimer);
  _longPressId = null;
}

function _handlePointerMove() {
  // Di chuyển tay → huỷ long-press
  clearTimeout(_longPressTimer);
  _longPressId = null;
}

/**
 * Keyboard trong container: Enter/Space mở popup trên ô đang focus.
 */
function _handleContainerKeydown(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const sessionEl = e.target.closest('.session');
  if (!sessionEl) return;
  e.preventDefault();

  const sessionId = sessionEl.dataset.sessionId;
  if (!sessionId) return;

  openPopup(sessionId, sessionEl, (id, status) => {
    setStatus(id, status);
  });
}

/**
 * Phím tắt toàn cục: Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo.
 */
function _handleGlobalKeydown(e) {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
  if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
    e.preventDefault();
    handleUndo();
  } else if (
    (e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
    (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)
  ) {
    e.preventDefault();
    handleRedo();
  }
}

// ─── Undo / Redo public handlers ─────────────────────────────────────────────

/** Thực hiện undo và cập nhật UI */
function handleUndo() {
  const result = undo();
  if (!result) {
    showToast('Không có gì để hoàn tác', 'info');
    return;
  }
  _updateSessionEl(result.sessionId, result.status);
  showToast('Đã hoàn tác', 'success', 2000);
  _updateUndoRedoButtons();
  document.dispatchEvent(
    new CustomEvent('attendance:changed', {
      bubbles: true,
      detail: { id: result.sessionId, status: result.status, method: 'undo' },
    })
  );
}

/** Thực hiện redo và cập nhật UI */
function handleRedo() {
  const result = redo();
  if (!result) {
    showToast('Không có gì để làm lại', 'info');
    return;
  }
  _updateSessionEl(result.sessionId, result.status);
  showToast('Đã làm lại', 'success', 2000);
  _updateUndoRedoButtons();
  document.dispatchEvent(
    new CustomEvent('attendance:changed', {
      bubbles: true,
      detail: { id: result.sessionId, status: result.status, method: 'redo' },
    })
  );
}

// ─── Helpers nội bộ ───────────────────────────────────────────────────────────

/**
 * Xoay vòng trạng thái nhanh (Shift+Click hoặc double-click).
 * @param {MouseEvent} e
 */
function _doQuickCycle(e) {
  const sessionEl = e.target.closest('.session');
  if (!sessionEl) return;
  e.preventDefault();

  const sessionId = sessionEl.dataset.sessionId;
  if (!sessionId) return;
  if (_isLocked(sessionId)) return;
  _lock(sessionId);

  const session = getSession(sessionId);
  if (!session) return;

  const next = cycleStatus(session.status);
  setStatus(sessionId, next);
  showToast(`→ ${STATUS_LABELS[next] ?? 'Chưa điểm danh'}`, 'info', 1500);
}

/**
 * Kiểm tra ô session có đang bị khóa (click nhanh) không.
 * @param {string} sessionId
 * @returns {boolean}
 */
function _isLocked(sessionId) {
  const last = _lockMap.get(sessionId);
  return last !== undefined && Date.now() - last < CLICK_LOCK_MS;
}

/**
 * Khóa ô session trong CLICK_LOCK_MS ms.
 * @param {string} sessionId
 */
function _lock(sessionId) {
  _lockMap.set(sessionId, Date.now());
}

/**
 * Cập nhật trạng thái disabled của nút Undo/Redo.
 */
function _updateUndoRedoButtons() {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) btnUndo.disabled = !canUndo();
  if (btnRedo) btnRedo.disabled = !canRedo();
}

// ═════════════════════════════════════════════════════════════════════════════
// CÔNG KHAI
// ═════════════════════════════════════════════════════════════════════════════
window.Attendance = {
  init: initAttendance,
  setStatus,
  undo: handleUndo,
  redo: handleRedo,
  showToast,
};

initAttendance();
})();
