/* =====================================================================
   data.js — TV5: DỮ LIỆU, TÍCH HỢP, KIỂM THỬ
   ---------------------------------------------------------------------
   Gồm:
   1. DataStore  : nguồn dữ liệu DUY NHẤT (courses / sessions / history),
                   lưu localStorage, đồng bộ nhiều tab, dữ liệu mẫu
                   (chuyển từ storage.js của TV3 sang đây cho đúng vai trò)
   2. CRUD       : thêm / sửa / xóa môn học và buổi học (+ lặp hàng tuần)
   3. Export / Import JSON
   4. Giao diện "Quản lý" (form thêm / sửa / xóa)
   5. CheckIn    : "cổng" chuẩn bị cho GPS / QR (xem README mục 5)
   6. selfTest() : bộ test case chạy bằng  index.html#test

   Hợp đồng dữ liệu (cả nhóm dùng chung):
     Course  { id, name, color, totalSessions, room }
     Session { id, courseId, date:'YYYY-MM-DD', startTime:'HH:MM',
               endTime:'HH:MM', status:null|'present'|'late'|'absent'|'excused', note }
     Sự kiện trên document:
       'data:changed'  detail { kind }  kind = 'add'|'edit'|'delete'|'import'|'reset'|'sync'|'status'
                        (kind 'status' = chỉ đổi điểm danh → UI đã tự cập nhật tại chỗ)
   ===================================================================== */
(function () {
  'use strict';

  const STORAGE_KEY = 'classpulse.v1';
  const STATUSES = ['present', 'late', 'absent', 'excused'];

  /* ---------- Tiện ích ngày giờ (GIỜ ĐỊA PHƯƠNG, không dùng toISOString) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7)); // thứ 2 đầu tuần
  const today = () => iso(new Date());
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;
  const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  /* ---------- 1. DỮ LIỆU MẪU ---------- */
  function makeSeed() {
    const off = (n) => iso(addDays(new Date(), n));
    return {
      version: 1,
      courses: [
        { id: 'c1', name: 'Toán Giải Tích',         color: '#3b82f6', totalSessions: 30, room: 'A101' },
        { id: 'c2', name: 'Vật Lý Đại Cương',       color: '#f59e0b', totalSessions: 25, room: 'B203' },
        { id: 'c3', name: 'Lập Trình Web',          color: '#6366f1', totalSessions: 20, room: 'Lab3' },
        { id: 'c4', name: 'Tiếng Anh Chuyên Ngành', color: '#8b5cf6', totalSessions: 20, room: 'C105' },
        { id: 'c5', name: 'Hóa Học Hữu Cơ',         color: '#10b981', totalSessions: 25, room: 'D302' },
      ],
      sessions: [
        { id: 's01', courseId: 'c1', date: off(-3), startTime: '07:30', endTime: '09:00', status: 'present', note: '' },
        { id: 's02', courseId: 'c2', date: off(-3), startTime: '09:15', endTime: '10:45', status: 'late',    note: 'Đến muộn 10 phút' },
        { id: 's03', courseId: 'c3', date: off(-2), startTime: '07:30', endTime: '09:00', status: 'absent',  note: '' },
        { id: 's04', courseId: 'c4', date: off(-2), startTime: '13:30', endTime: '15:00', status: 'excused', note: 'Có giấy phép' },
        { id: 's05', courseId: 'c5', date: off(-1), startTime: '07:30', endTime: '09:00', status: 'present', note: '' },
        { id: 's06', courseId: 'c1', date: off(-1), startTime: '09:15', endTime: '10:45', status: null,      note: '' },
        { id: 's07', courseId: 'c2', date: off(0),  startTime: '07:30', endTime: '09:00', status: null,      note: '' },
        { id: 's08', courseId: 'c3', date: off(0),  startTime: '13:30', endTime: '15:00', status: null,      note: '' },
        { id: 's09', courseId: 'c4', date: off(1),  startTime: '07:30', endTime: '09:00', status: null,      note: '' },
        { id: 's10', courseId: 'c5', date: off(2),  startTime: '09:15', endTime: '10:45', status: null,      note: '' },
      ],
      history: [],
    };
  }

  /* ---------- Kiểm tra cấu trúc dữ liệu (dùng cho load + import) ---------- */
  function validate(data) {
    if (!data || typeof data !== 'object') return 'Không phải đối tượng JSON';
    if (data.version !== 1) return 'Sai version (cần version = 1)';
    if (!Array.isArray(data.courses) || !Array.isArray(data.sessions) || !Array.isArray(data.history))
      return 'Thiếu mảng courses / sessions / history';
    const ids = new Set();
    for (const c of data.courses) {
      if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || !c.name.trim()) return 'Có môn học thiếu id hoặc tên';
      if (ids.has(c.id)) return 'Trùng id môn học: ' + c.id;
      ids.add(c.id);
    }
    const sids = new Set();
    for (const s of data.sessions) {
      if (!s || typeof s.id !== 'string') return 'Có buổi học thiếu id';
      if (sids.has(s.id)) return 'Trùng id buổi học: ' + s.id;
      sids.add(s.id);
      if (!ids.has(s.courseId)) return `Buổi ${s.id} trỏ tới môn không tồn tại (${s.courseId})`;
      if (!isDate(s.date)) return `Buổi ${s.id} có ngày sai định dạng`;
      if (!isTime(s.startTime) || !isTime(s.endTime) || s.endTime <= s.startTime) return `Buổi ${s.id} có giờ không hợp lệ`;
      if (s.status !== null && !STATUSES.includes(s.status)) return `Buổi ${s.id} có trạng thái lạ (${s.status})`;
    }
    return null;
  }

  /* ---------- Lưu / tải localStorage ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return makeSeed();
      const parsed = JSON.parse(raw);
      const err = validate(parsed);
      if (err) { console.warn('[data] Dữ liệu hỏng (' + err + '), dùng dữ liệu mẫu'); return makeSeed(); }
      return parsed;
    } catch (e) {
      console.error('[data] Lỗi khi load:', e);
      return makeSeed();
    }
  }

  let _data = load();
  let _silent = false;               // true khi chạy selfTest: không lưu, không phát sự kiện
  const _listeners = new Set();

  function save() {
    if (_silent) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); }
    catch (e) { console.error('[data] Lỗi khi save:', e); }
  }

  /** Mọi thay đổi dữ liệu đều đi qua đây: lưu → báo listener → phát sự kiện document. */
  function commit(detail = { kind: 'edit' }) {
    if (_silent) return;
    save();
    _listeners.forEach((fn) => fn(detail));
    document.dispatchEvent(new CustomEvent('data:changed', { detail }));
  }

  function subscribe(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }

  // Đồng bộ khi tab khác thay đổi dữ liệu
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || e.newValue === null) return;
    try {
      const parsed = JSON.parse(e.newValue);
      if (!validate(parsed)) { _data = parsed; _listeners.forEach((fn) => fn({ kind: 'sync' })); document.dispatchEvent(new CustomEvent('data:changed', { detail: { kind: 'sync' } })); }
    } catch (err) { console.error('[data] Lỗi đồng bộ tab:', err); }
  });

  /* ---------- Getters ---------- */
  const getData = () => _data;
  const getCourse = (id) => _data.courses.find((c) => c.id === id);
  const getSession = (id) => _data.sessions.find((s) => s.id === id);
  const sortedSessions = () => _data.sessions.slice().sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

  /* ---------- 2. CRUD ---------- */
  const fail = (error) => ({ ok: false, error });

  function checkCourse(p) {
    if (!p.name || !String(p.name).trim()) return 'Tên môn học không được để trống';
    if (String(p.name).trim().length > 60) return 'Tên môn tối đa 60 ký tự';
    if (!/^#[0-9a-fA-F]{6}$/.test(p.color || '')) return 'Màu không hợp lệ';
    const n = Number(p.totalSessions);
    if (!Number.isInteger(n) || n < 1 || n > 200) return 'Tổng số buổi phải từ 1 đến 200';
    return null;
  }

  function addCourse(p) {
    const err = checkCourse(p); if (err) return fail(err);
    const c = { id: uid('c'), name: String(p.name).trim(), color: p.color, totalSessions: Number(p.totalSessions), room: String(p.room || '').trim() };
    _data.courses.push(c);
    commit({ kind: 'add', what: 'course', id: c.id });
    return { ok: true, course: c };
  }

  function updateCourse(id, p) {
    const c = getCourse(id); if (!c) return fail('Không tìm thấy môn học');
    const merged = { ...c, ...p };
    const err = checkCourse(merged); if (err) return fail(err);
    Object.assign(c, { name: String(merged.name).trim(), color: merged.color, totalSessions: Number(merged.totalSessions), room: String(merged.room || '').trim() });
    commit({ kind: 'edit', what: 'course', id });
    return { ok: true, course: c };
  }

  /** Xóa môn → xóa luôn các buổi học của môn đó. */
  function deleteCourse(id) {
    if (!getCourse(id)) return fail('Không tìm thấy môn học');
    const removed = _data.sessions.filter((s) => s.courseId === id).length;
    _data.courses = _data.courses.filter((c) => c.id !== id);
    _data.sessions = _data.sessions.filter((s) => s.courseId !== id);
    commit({ kind: 'delete', what: 'course', id });
    return { ok: true, removedSessions: removed };
  }

  function checkSession(p) {
    if (!getCourse(p.courseId)) return 'Hãy chọn môn học';
    if (!isDate(p.date)) return 'Ngày không hợp lệ';
    if (!isTime(p.startTime) || !isTime(p.endTime)) return 'Giờ không hợp lệ (HH:MM)';
    if (p.endTime <= p.startTime) return 'Giờ kết thúc phải sau giờ bắt đầu';
    return null;
  }

  /** Thêm buổi học; repeatWeeks = số tuần LẶP THÊM (0 = chỉ 1 buổi). */
  function addSession(p, repeatWeeks = 0) {
    const err = checkSession(p); if (err) return fail(err);
    const weeks = Math.max(0, Math.min(52, Math.floor(Number(repeatWeeks) || 0)));
    const created = [];
    for (let k = 0; k <= weeks; k++) {
      const date = iso(addDays(parse(p.date), 7 * k));
      const dup = _data.sessions.some((s) => s.courseId === p.courseId && s.date === date && s.startTime === p.startTime);
      if (dup) continue;                                   // bỏ qua buổi trùng, không tạo 2 lần
      created.push({ id: uid('s'), courseId: p.courseId, date, startTime: p.startTime, endTime: p.endTime, status: null, note: String(p.note || '').trim() });
    }
    if (!created.length) return fail('Buổi học này đã tồn tại');
    _data.sessions.push(...created);
    commit({ kind: 'add', what: 'session', ids: created.map((s) => s.id) });
    return { ok: true, sessions: created };
  }

  function updateSession(id, p) {
    const s = getSession(id); if (!s) return fail('Không tìm thấy buổi học');
    const merged = { ...s, ...p };
    const err = checkSession(merged); if (err) return fail(err);
    Object.assign(s, { courseId: merged.courseId, date: merged.date, startTime: merged.startTime, endTime: merged.endTime, note: String(merged.note || '').trim() });
    commit({ kind: 'edit', what: 'session', id });
    return { ok: true, session: s };
  }

  function deleteSession(id) {
    if (!getSession(id)) return fail('Không tìm thấy buổi học');
    _data.sessions = _data.sessions.filter((s) => s.id !== id);
    commit({ kind: 'delete', what: 'session', id });
    return { ok: true };
  }

  /* ---------- 3. EXPORT / IMPORT ---------- */
  function exportJSON() { return JSON.stringify(_data, null, 2); }

  function importJSON(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return fail('File không phải JSON hợp lệ'); }
    const err = validate(parsed); if (err) return fail(err);
    _data = parsed;
    commit({ kind: 'import' });
    return { ok: true, courses: parsed.courses.length, sessions: parsed.sessions.length };
  }

  function resetToSeed() { _data = makeSeed(); commit({ kind: 'reset' }); }

  function downloadExport() {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `diem-danh-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  window.DataStore = {
    getData, getCourse, getSession, sortedSessions, subscribe, commit, validate,
    addCourse, updateCourse, deleteCourse, addSession, updateSession, deleteSession,
    exportJSON, importJSON, resetToSeed, downloadExport,
    date: { iso, parse, addDays, startOfWeek, today, isDate, isTime },
  };

  /* ---------- 4. GIAO DIỆN QUẢN LÝ ---------- */
  const $ = (id) => document.getElementById(id);
  const say = (msg, type = 'info') => (window.Attendance ? window.Attendance.showToast(msg, type) : alert(msg));
  const fmtDate = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

  function openManage(tab) {
    renderCourseList(); renderSessionList(); fillCourseSelect(); switchTab(tab || 'courses');
    const ov = $('manage-overlay');
    ov.classList.add('open'); ov.setAttribute('aria-hidden', 'false');
    ($(tab === 'sessions' ? 'sf-course' : 'cf-name') || ov).focus();
  }
  function closeManage() {
    const ov = $('manage-overlay');
    ov.classList.remove('open'); ov.setAttribute('aria-hidden', 'true');
    $('btn-manage')?.focus();
  }
  function switchTab(tab) {
    const isC = tab === 'courses';
    $('panel-courses').hidden = !isC; $('panel-sessions').hidden = isC;
    $('tab-courses').setAttribute('aria-pressed', String(isC)); $('tab-sessions').setAttribute('aria-pressed', String(!isC));
  }

  function mkBtn(text, cls, fn, label) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn ' + cls; b.textContent = text;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  }

  function renderCourseList() {
    const ul = $('course-list'); ul.replaceChildren();
    if (!_data.courses.length) { const li = document.createElement('li'); li.textContent = 'Chưa có môn học nào.'; ul.appendChild(li); return; }
    _data.courses.forEach((c) => {
      const li = document.createElement('li');
      const dot = document.createElement('i'); dot.className = 'swatch'; dot.style.background = c.color;
      const txt = document.createElement('span'); txt.className = 'grow';
      txt.textContent = `${c.name}${c.room ? ' · ' + c.room : ''} · ${c.totalSessions} buổi`;
      li.append(dot, txt,
        mkBtn('Sửa', '', () => editCourse(c.id), 'Sửa môn ' + c.name),
        mkBtn('Xóa', 'btn-danger', () => {
          const n = _data.sessions.filter((s) => s.courseId === c.id).length;
          if (confirm(`Xóa môn "${c.name}"${n ? ` và ${n} buổi học của môn này` : ''}?`)) {
            deleteCourse(c.id); renderCourseList(); renderSessionList(); fillCourseSelect(); say('Đã xóa môn học', 'success');
          }
        }, 'Xóa môn ' + c.name));
      ul.appendChild(li);
    });
  }

  function editCourse(id) {
    const c = getCourse(id); if (!c) return;
    const f = $('course-form');
    f.elements.id.value = c.id; f.elements.name.value = c.name; f.elements.color.value = c.color;
    f.elements.room.value = c.room; f.elements.totalSessions.value = c.totalSessions;
    $('cf-submit').textContent = 'Lưu thay đổi'; $('cf-cancel').hidden = false;
    f.elements.name.focus();
  }
  function resetCourseForm() {
    const f = $('course-form'); f.reset(); f.elements.id.value = '';
    $('cf-submit').textContent = '+ Thêm môn'; $('cf-cancel').hidden = true;
  }

  function fillCourseSelect() {
    const sel = $('sf-course'); const keep = sel.value;
    sel.replaceChildren();
    _data.courses.forEach((c) => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.appendChild(o); });
    if (keep && getCourse(keep)) sel.value = keep;
  }

  function renderSessionList() {
    const ul = $('session-list'); ul.replaceChildren();
    const list = sortedSessions();
    if (!list.length) { const li = document.createElement('li'); li.textContent = 'Chưa có buổi học nào.'; ul.appendChild(li); return; }
    list.forEach((s) => {
      const c = getCourse(s.courseId);
      const li = document.createElement('li');
      const dot = document.createElement('i'); dot.className = 'swatch'; dot.style.background = c ? c.color : '#64748b';
      const txt = document.createElement('span'); txt.className = 'grow';
      txt.textContent = `${fmtDate(s.date)} · ${s.startTime}–${s.endTime} · ${c ? c.name : '(môn đã xóa)'}`;
      li.append(dot, txt,
        mkBtn('Sửa', '', () => editSession(s.id), 'Sửa buổi ngày ' + fmtDate(s.date)),
        mkBtn('Xóa', 'btn-danger', () => {
          if (confirm(`Xóa buổi học ngày ${fmtDate(s.date)}?`)) { deleteSession(s.id); renderSessionList(); say('Đã xóa buổi học', 'success'); }
        }, 'Xóa buổi ngày ' + fmtDate(s.date)));
      ul.appendChild(li);
    });
  }

  function editSession(id) {
    const s = getSession(id); if (!s) return;
    const f = $('session-form');
    f.elements.id.value = s.id; f.elements.courseId.value = s.courseId; f.elements.date.value = s.date;
    f.elements.startTime.value = s.startTime; f.elements.endTime.value = s.endTime; f.elements.note.value = s.note || '';
    f.elements.repeat.value = 0; f.elements.repeat.disabled = true;
    $('sf-submit').textContent = 'Lưu thay đổi'; $('sf-cancel').hidden = false;
    f.elements.date.focus();
  }
  function resetSessionForm() {
    const f = $('session-form'); f.reset(); f.elements.id.value = ''; f.elements.repeat.disabled = false;
    f.elements.date.value = today();
    $('sf-submit').textContent = '+ Thêm buổi học'; $('sf-cancel').hidden = true;
  }

  function bindUI() {
    $('btn-manage').addEventListener('click', () => openManage('courses'));
    $('manage-close').addEventListener('click', closeManage);
    $('manage-overlay').addEventListener('click', (e) => { if (e.target.id === 'manage-overlay') closeManage(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('manage-overlay').classList.contains('open')) closeManage(); });
    $('tab-courses').addEventListener('click', () => switchTab('courses'));
    $('tab-sessions').addEventListener('click', () => { fillCourseSelect(); switchTab('sessions'); });

    $('course-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target; if (!f.reportValidity()) return;
      const p = { name: f.elements.name.value, color: f.elements.color.value, room: f.elements.room.value, totalSessions: f.elements.totalSessions.value };
      const id = f.elements.id.value;
      const r = id ? updateCourse(id, p) : addCourse(p);
      if (!r.ok) { say(r.error, 'error'); return; }
      say(id ? 'Đã cập nhật môn học' : 'Đã thêm môn học', 'success');
      resetCourseForm(); renderCourseList(); fillCourseSelect(); renderSessionList();
    });
    $('cf-cancel').addEventListener('click', resetCourseForm);

    $('session-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target; if (!f.reportValidity()) return;
      const p = { courseId: f.elements.courseId.value, date: f.elements.date.value, startTime: f.elements.startTime.value, endTime: f.elements.endTime.value, note: f.elements.note.value };
      const id = f.elements.id.value;
      const r = id ? updateSession(id, p) : addSession(p, f.elements.repeat.value);
      if (!r.ok) { say(r.error, 'error'); return; }
      say(id ? 'Đã cập nhật buổi học' : `Đã thêm ${r.sessions.length} buổi học`, 'success');
      resetSessionForm(); renderSessionList();
    });
    $('sf-cancel').addEventListener('click', resetSessionForm);

    $('btn-export').addEventListener('click', downloadExport);
    $('btn-import').addEventListener('click', () => $('file-import').click());
    $('file-import').addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const r = importJSON(await file.text());
      say(r.ok ? `Đã nhập ${r.courses} môn, ${r.sessions} buổi học` : 'Nhập thất bại: ' + r.error, r.ok ? 'success' : 'error');
      e.target.value = '';
    });
    $('btn-reset').addEventListener('click', () => {
      if (confirm('Đặt lại về dữ liệu mẫu? Mọi dữ liệu hiện tại sẽ mất.')) { resetToSeed(); say('Đã đặt lại dữ liệu mẫu', 'success'); }
    });
    resetSessionForm();
  }

  /* ---------- 5. "CỔNG" GPS / QR (TV5 chuẩn bị, chưa nối phần cứng) ---------- */
  const CheckIn = {
    /** Buổi đang diễn ra tại thời điểm `now` (hoặc null). */
    currentSession(now = new Date()) {
      const d = iso(now), t = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      return _data.sessions.find((s) => s.date === d && s.startTime <= t && t <= s.endTime) || null;
    },
    /** Điểm danh từ QR: payload = id buổi học. Trả về true nếu thành công. */
    byQR(sessionId) { return CheckIn._mark(sessionId, 'qr'); },
    /** Điểm danh từ GPS: TODO nối navigator.geolocation + kiểm tra khoảng cách tới phòng học. */
    byGPS(sessionId /*, coords */) { return CheckIn._mark(sessionId, 'gps'); },
    _mark(sessionId, method) {
      if (!getSession(sessionId) || !window.Attendance) return false;
      window.Attendance.setStatus(sessionId, 'present', method); // method 'qr'|'gps' được bỏ qua bước hỏi buổi tương lai
      return true;
    },
  };
  window.CheckIn = CheckIn;

  /* ---------- 6. TEST CASE (index.html#test) ---------- */
  function selfTest() {
    const results = [];
    const t = (name, fn) => { try { results.push({ name, pass: !!fn() }); } catch (e) { results.push({ name: name + ' (lỗi: ' + e.message + ')', pass: false }); } };
    const backup = structuredClone(_data);
    _silent = true;
    try {
      _data = makeSeed();
      const course = addCourse({ name: 'Môn thử', color: '#112233', totalSessions: 10, room: 'X1' });
      t('Thêm môn hợp lệ', () => course.ok && getCourse(course.course.id));
      t('Từ chối môn tên rỗng', () => !addCourse({ name: '  ', color: '#112233', totalSessions: 5 }).ok);
      t('Từ chối màu sai', () => !addCourse({ name: 'A', color: 'red', totalSessions: 5 }).ok);
      const cid = course.course.id;
      const r = addSession({ courseId: cid, date: '2026-03-02', startTime: '07:30', endTime: '09:00' }, 3);
      t('Lặp hàng tuần: 1 + 3 = 4 buổi', () => r.ok && r.sessions.length === 4);
      t('Các buổi lặp cách nhau đúng 7 ngày', () => r.sessions.map((s) => s.date).join() === '2026-03-02,2026-03-09,2026-03-16,2026-03-23');
      t('Từ chối giờ kết thúc <= giờ bắt đầu', () => !addSession({ courseId: cid, date: '2026-03-02', startTime: '09:00', endTime: '09:00' }).ok);
      t('Từ chối ngày không tồn tại (30/02)', () => !addSession({ courseId: cid, date: '2026-02-30', startTime: '07:00', endTime: '08:00' }).ok);
      t('Không tạo trùng buổi', () => !addSession({ courseId: cid, date: '2026-03-02', startTime: '07:30', endTime: '09:00' }).ok);
      t('Sửa buổi học', () => updateSession(r.sessions[0].id, { endTime: '09:30' }).ok && getSession(r.sessions[0].id).endTime === '09:30');
      t('Xóa 1 buổi học', () => deleteSession(r.sessions[1].id).ok && !getSession(r.sessions[1].id));
      t('Export → Import giữ nguyên dữ liệu', () => { const j = exportJSON(); const before = JSON.stringify(_data); return importJSON(j).ok && JSON.stringify(_data) === before; });
      t('Import từ chối JSON hỏng', () => !importJSON('{oops').ok);
      t('Import từ chối buổi trỏ tới môn không có', () => { const bad = JSON.parse(exportJSON()); bad.sessions[0].courseId = 'zzz'; return !importJSON(JSON.stringify(bad)).ok; });
      t('Xóa môn kéo theo xóa buổi học của môn', () => deleteCourse(cid).ok && !_data.sessions.some((s) => s.courseId === cid));
      t('Ngày địa phương: iso(parse(x)) === x', () => iso(parse('2026-12-31')) === '2026-12-31');
      t('startOfWeek là thứ 2', () => startOfWeek(parse('2026-11-22')).getDay() === 1 && iso(startOfWeek(parse('2026-11-22'))) === '2026-11-16');
    } finally {
      _data = backup; _silent = false;
    }
    const failed = results.filter((x) => !x.pass);
    console.table(results);
    say(failed.length ? `Test: ${failed.length}/${results.length} lỗi (xem Console)` : `Test: ${results.length}/${results.length} đạt ✅`, failed.length ? 'error' : 'success');
    return results;
  }
  window.DataStore.selfTest = selfTest;

  bindUI();
  if (location.hash === '#test') window.addEventListener('load', () => setTimeout(selfTest, 300));
})();
