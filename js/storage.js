/**
 * @file storage.js
 * Quản lý localStorage: load, save, seed data và đồng bộ nhiều tab.
 * @module storage
 */

/** Key lưu trên localStorage */
const STORAGE_KEY = 'classpulse.v1';

/** Dữ liệu mẫu – dùng khi chưa có dữ liệu hoặc dữ liệu hỏng */
export const SEED_DATA = {
  version: 1,
  courses: [
    { id: 'c1', name: 'Toán Giải Tích',      color: '#3b82f6', totalSessions: 30, room: 'A101' },
    { id: 'c2', name: 'Vật Lý Đại Cương',    color: '#f59e0b', totalSessions: 25, room: 'B203' },
    { id: 'c3', name: 'Lập Trình Web',        color: '#6366f1', totalSessions: 20, room: 'Lab3' },
    { id: 'c4', name: 'Tiếng Anh Chuyên Ngành', color: '#8b5cf6', totalSessions: 20, room: 'C105' },
    { id: 'c5', name: 'Hóa Học Hữu Cơ',      color: '#10b981', totalSessions: 25, room: 'D302' },
  ],
  sessions: [
    // Tuần hiện tại – lấy ngày theo offset từ hôm nay
    { id: 's01', courseId: 'c1', date: _offsetDate(-3), startTime: '07:30', endTime: '09:00', status: 'present',  note: '' },
    { id: 's02', courseId: 'c2', date: _offsetDate(-3), startTime: '09:15', endTime: '10:45', status: 'late',     note: 'Đến muộn 10 phút' },
    { id: 's03', courseId: 'c3', date: _offsetDate(-2), startTime: '07:30', endTime: '09:00', status: 'absent',   note: '' },
    { id: 's04', courseId: 'c4', date: _offsetDate(-2), startTime: '13:30', endTime: '15:00', status: 'excused',  note: 'Có giấy phép' },
    { id: 's05', courseId: 'c5', date: _offsetDate(-1), startTime: '07:30', endTime: '09:00', status: 'present',  note: '' },
    { id: 's06', courseId: 'c1', date: _offsetDate(-1), startTime: '09:15', endTime: '10:45', status: null,       note: '' },
    { id: 's07', courseId: 'c2', date: _offsetDate(0),  startTime: '07:30', endTime: '09:00', status: null,       note: '' },
    { id: 's08', courseId: 'c3', date: _offsetDate(0),  startTime: '13:30', endTime: '15:00', status: null,       note: '' },
    { id: 's09', courseId: 'c4', date: _offsetDate(1),  startTime: '07:30', endTime: '09:00', status: null,       note: '' },
    { id: 's10', courseId: 'c5', date: _offsetDate(2),  startTime: '09:15', endTime: '10:45', status: null,       note: '' },
  ],
  history: [],
};

/**
 * Tính ngày offset từ hôm nay, trả về chuỗi YYYY-MM-DD.
 * @param {number} days - Số ngày cộng/trừ
 * @returns {string}
 */
function _offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Kiểm tra cấu trúc dữ liệu tối thiểu.
 * @param {unknown} data
 * @returns {boolean}
 */
function _isValid(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    data.version === 1 &&
    Array.isArray(data.courses) &&
    Array.isArray(data.sessions) &&
    Array.isArray(data.history)
  );
}

/**
 * Tải dữ liệu từ localStorage.
 * Nếu không có hoặc bị hỏng → trả về seed data.
 * @returns {import('./state.js').AppData}
 */
export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(SEED_DATA);
    const parsed = JSON.parse(raw);
    if (!_isValid(parsed)) {
      console.warn('[storage] Dữ liệu hỏng, dùng seed data');
      return structuredClone(SEED_DATA);
    }
    return parsed;
  } catch (err) {
    console.error('[storage] Lỗi khi load:', err);
    return structuredClone(SEED_DATA);
  }
}

/**
 * Lưu dữ liệu vào localStorage.
 * @param {import('./state.js').AppData} data
 */
export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('[storage] Lỗi khi save:', err);
  }
}

/**
 * Lắng nghe sự kiện 'storage' để đồng bộ khi tab khác thay đổi.
 * @param {(data: import('./state.js').AppData) => void} onSync - Callback khi có thay đổi từ tab khác
 */
export function watchStorage(onSync) {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || e.newValue === null) return;
    try {
      const parsed = JSON.parse(e.newValue);
      if (_isValid(parsed)) {
        onSync(parsed);
      }
    } catch (err) {
      console.error('[storage] Lỗi khi đồng bộ tab:', err);
    }
  });
}
