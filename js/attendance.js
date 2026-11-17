/**
 * @file attendance.js
 * Module chính: điểm danh, event delegation, cập nhật UI, undo/redo.
 * @module attendance
 */

import { getSession, getCourse, applyStatus, cycleStatus, isFuture, canUndo, canRedo, undo, redo, subscribe } from './state.js';
import { openPopup, closePopup, isPopupOpen } from './popup.js';
import { showToast } from './toast.js';

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
export function initAttendance(calendarEl) {
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
export function setStatus(sessionId, status, method = 'manual') {
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
export function handleUndo() {
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
export function handleRedo() {
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
