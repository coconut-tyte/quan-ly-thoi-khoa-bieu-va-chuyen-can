# Quản lý thời khóa biểu & chuyên cần — nhóm 5 thành viên

M�� `index.html` bằng trình duyệt là chạy (không cần server, không cần cài gì).
Thêm `#test` vào cuối địa chỉ (`index.html#test`) để chạy bộ test case của TV5.

## 5 file – 5 vai trò

| TV | File | Phụ trách |
|----|------|-----------|
| 1 | `index.html` | HTML5: khung lịch tuần (CSS Grid, cột Thứ 2→CN, hàng theo giờ), lịch tháng (grid 7 cột), thẻ ngữ nghĩa, `aria-label` cho từng ô. Có kèm script dựng lịch ở cuối file |
| 2 | `style.css` | CSS3: giao diện, màu từng môn, badge, hiệu ứng chuyển tuần/tháng, responsive, dark mode |
| 3 | `attendance.js` | Điểm danh: event delegation, popup chọn trạng thái, undo/redo, toast, phím tắt, long-press mobile |
| 4 | `thongke.js` | Tính % nghỉ theo môn và tổng, cảnh báo > 20% (cam → đỏ), bảng + biểu đồ tròn/cột bằng Canvas |
| 5 | `data.js` | Dữ liệu (localStorage, dữ liệu mẫu), thêm/sửa/xóa môn và buổi học (lặp hàng tuần), export/import JSON, test case, "cổng" GPS/QR |

Thứ tự nạp script trong `index.html`: `data.js` → `attendance.js` → `thongke.js` → script dựng lịch (TV1).

## Hợp đồng kết nối (đừng đổi tên)

**Dữ liệu** (`DataStore.getData()`):
- `Course  { id, name, color, totalSessions, room }`
- `Session { id, courseId, date:'YYYY-MM-DD', startTime:'HH:MM', endTime:'HH:MM', status:null|'present'|'late'|'absent'|'excused', note }`

**Sự kiện trên `document`:**
- `attendance:changed` — `detail { id, status, method }` — TV3 phát khi đổi điểm danh; TV4 lắng nghe.
- `data:changed` — `detail { kind }` — TV5 phát khi thêm/sửa/xóa/nhập/đặt lại/đồng bộ tab (`kind:'status'` = chỉ đổi điểm danh, lịch tự cập nhật tại chỗ).

**Hàm dùng chung:**
- `DataStore`: `getData, getCourse, getSession, addCourse, updateCourse, deleteCourse, addSession(p, repeatWeeks), updateSession, deleteSession, exportJSON, importJSON, resetToSeed, subscribe, commit, date.{iso,parse,addDays,startOfWeek,today}`
- `Attendance.setStatus(sessionId, status, method)` — `method` = `'manual' | 'qr' | 'gps'`
- `CheckIn.byQR(sessionId)`, `CheckIn.byGPS(sessionId)`, `CheckIn.currentSession()` — "cổng" cho GPS/QR (TV5)
- `ThongKe.refresh(subjects, sessions)` — TV4 (đã tự nối, không cần gọi tay)

**Móc HTML:** `#calendar`, `.session[data-session-id][data-status]`, `.badge`, `#btn-undo`, `#btn-redo`, `#tk-table`, `#tk-pie`, `#tk-bar`, `#btn-tk-modal`, `#manage-overlay` và các form bên trong.

## Những gì đã thay đổi khi ghép (so với code từng người)

- **TV3:** gộp `attendance.js`, `popup.js`, `state.js`, `toast.js` thành 1 file, đổi từ ES module sang script thường (ES module không chạy khi mở file trực tiếp `file://`). `storage.js` (load/save, dữ liệu mẫu) chuyển sang `data.js` của TV5 cho đúng vai trò; `state.js` giờ dùng chung `DataStore` thay vì giữ bản dữ liệu riêng.
- **TV4:** file `JavaScript` đổi tên thành `thongke.js`; logic giữ nguyên, chỉ thêm khối nối cuối file (đổi `courses` → `subjects`, `null` → `''`, tự refresh khi dữ liệu đổi), thêm `esc()` để tên môn người dùng nhập không chèn được HTML, và gắn class `stats-table` cho bảng.
- **TV2:** `style.css` giữ nguyên, chỉ nối thêm một khối nhỏ ở cuối (hộp thoại quản lý, `[hidden]`, chấm trạng thái ở lịch tháng, canvas thống kê).
- **TV1:** `index.html` viết lại theo đúng cấu trúc `.week-grid / .cell / .session / .month-grid / .day` mà CSS của TV2 đã viết sẵn.
- **TV5:** thư mục `test2/` (3 file rỗng) thay bằng `data.js`.

**Lỗi đã sửa trong lúc ghép:**
- Ngày tính theo UTC (`toISOString`) nên lệch 1 ngày ở Việt Nam trước 7h sáng → dùng giờ địa phương toàn bộ.
- `Ctrl+Z` / `Ctrl+Y` bị bắt cả khi đang gõ trong ô nhập → bỏ qua khi đang ở input/textarea/select.
- Tên môn do người dùng nhập được chèn thẳng vào `innerHTML` ở bảng thống kê → đã escape.
- Undo/redo trỏ vào buổi đã bị xóa → bỏ qua; xóa stack khi nhập/đặt lại/xóa dữ liệu.

## Việc còn có thể làm tiếp (không bắt buộc)

- TV2: vòng viền cầu vồng quanh **mọi** ô của cột "hôm nay" khá rối mắt; có thể chỉ giữ ở tiêu đề cột.
- TV4: một môn mới có 1 buổi vắng sẽ ra 100% nghỉ; có thể thêm ngưỡng "tối thiểu N buổi mới cảnh báo".
- TV5: nối `CheckIn.byGPS` với `navigator.geolocation` và khoảng cách tới phòng học; sinh mã QR từ id buổi học; làm slide/demo.
