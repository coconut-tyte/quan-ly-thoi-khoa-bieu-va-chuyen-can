/**
 * @file state.js
 * Quản lý state in-memory, undo/redo stack và dispatch thay đổi.
 * @module state
 */

import { loadData, saveData, watchStorage } from './storage.js';

/** @typedef {{ id:string, name:string, color:string, totalSessions:number, room:string }} Course */
/** @typedef {{ id:string, courseId:string, date:string, startTime:string, endTime:string, status:string|null, note:string }} Session */
/** @typedef {{ id:string, from:string|null, to:string|null, at:string, method:string }} HistoryEntry */
/** @typedef {{ version:1, courses:Course[], sessions:Session[], history:HistoryEntry[] }} AppData */

/** Dữ liệu ứng dụng (in-memory) */
let _data = loadData();

/** Stack Undo – mỗi phần tử là snapshot { sessionId, from, to } */
const _undoStack = [];
/** Stack Redo */
const _redoStack = [];
/** Giới hạn stack */
const MAX_STACK = 20;

/** Callback khi state thay đổi (đăng ký từ bên ngoài) */
const _listeners = new Set();

// Đồng bộ khi tab khác thay đổi
watchStorage((newData) => {
  _data = newData;
  _notifyAll();
});

// ─── Getters ──────────────────────────────────────────────────────────────────

/**
 * Lấy toàn bộ dữ liệu (chỉ đọc).
 * @returns {AppData}
 */
export function getData() {
  return _data;
}

/**
 * Lấy session theo id.
 * @param {string} id
 * @returns {Session|undefined}
 */
export function getSession(id) {
  return _data.sessions.find((s) => s.id === id);
}

/**
 * Lấy course theo id.
 * @param {string} id
 * @returns {Course|undefined}
 */
export function getCourse(id) {
  return _data.courses.find((c) => c.id === id);
}

// ─── Mutation ────────────────────────────────────────────────────────────────

/**
 * Cập nhật trạng thái một session và ghi history.
 * Đây là hàm mutation duy nhất – không gọi thẳng từ UI, dùng qua setStatus trong attendance.js.
 * @param {string} sessionId
 * @param {string|null} newStatus
 * @param {string} method - 'manual' | 'qr' | 'gps'
 * @param {{ pushUndo?: boolean }} [opts]
 */
export function applyStatus(sessionId, newStatus, method = 'manual', { pushUndo = true } = {}) {
  const session = getSession(sessionId);
  if (!session) return;

  const oldStatus = session.status;

  // Cập nhật session
  session.status = newStatus;

  // Ghi vào history (tối đa 100 bản ghi để không phình quá to)
  const entry = {
    id: `h${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sessionId,
    from: oldStatus,
    to: newStatus,
    at: new Date().toISOString(),
    method,
  };
  _data.history.push(entry);
  if (_data.history.length > 100) _data.history.shift();

  // Đẩy vào undo stack
  if (pushUndo) {
    _undoStack.push({ sessionId, from: oldStatus, to: newStatus });
    if (_undoStack.length > MAX_STACK) _undoStack.shift();
    _redoStack.length = 0; // xoá redo khi có hành động mới
  }

  // Lưu và thông báo
  saveData(_data);
  _notifyAll({ sessionId, status: newStatus, method });
}

// ─── Undo / Redo ─────────────────────────────────────────────────────────────

/** Có thể Undo? */
export function canUndo() { return _undoStack.length > 0; }
/** Có thể Redo? */
export function canRedo() { return _redoStack.length > 0; }

/**
 * Hoàn tác thao tác cuối.
 * @returns {{ sessionId:string, status:string|null }|null} Thông tin session vừa hoàn tác
 */
export function undo() {
  if (!canUndo()) return null;
  const { sessionId, from, to } = _undoStack.pop();
  _redoStack.push({ sessionId, from, to });
  applyStatus(sessionId, from, 'manual', { pushUndo: false });
  return { sessionId, status: from };
}

/**
 * Làm lại thao tác vừa undo.
 * @returns {{ sessionId:string, status:string|null }|null}
 */
export function redo() {
  if (!canRedo()) return null;
  const { sessionId, from, to } = _redoStack.pop();
  _undoStack.push({ sessionId, from, to });
  applyStatus(sessionId, to, 'manual', { pushUndo: false });
  return { sessionId, status: to };
}

// ─── Observer ────────────────────────────────────────────────────────────────

/**
 * Đăng ký callback khi state thay đổi.
 * @param {Function} fn
 * @returns {() => void} Hàm huỷ đăng ký
 */
export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Thông báo tất cả listener.
 * @param {object} [detail]
 */
function _notifyAll(detail = {}) {
  _listeners.forEach((fn) => fn(detail));
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Kiểm tra session có trong tương lai không.
 * @param {Session} session
 * @returns {boolean}
 */
export function isFuture(session) {
  const today = new Date().toISOString().slice(0, 10);
  return session.date > today;
}

/**
 * Xoay vòng trạng thái: null → present → late → absent → excused → null
 * @param {string|null} current
 * @returns {string|null}
 */
export function cycleStatus(current) {
  const cycle = [null, 'present', 'late', 'absent', 'excused'];
  const idx = cycle.indexOf(current);
  return cycle[(idx + 1) % cycle.length];
}
