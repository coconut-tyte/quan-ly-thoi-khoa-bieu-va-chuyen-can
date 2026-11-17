# Lịch điểm danh — nhóm 5 thành viên

Mở `index.html` bằng trình duyệt là chạy (không cần server).

| TV | File sở hữu | Việc cần làm tiếp |
|----|-------------|-------------------|
| 1 | `index.html`, `js/app.js`, `js/calendar.js` | Khung lịch tuần/tháng, ngữ nghĩa, aria (XONG) |
| 2 | `css/style.css` | Màu theo môn, badge, hiệu ứng trượt tuần/tháng, responsive, dark mode |
| 3 | `js/attendance.js` | Popup chọn trạng thái thay vì xoay vòng |
| 4 | `js/stats.js` | Biểu đồ vào `#stats-chart`, tinh chỉnh công thức/cảnh báo |
| 5 | `js/data.js` | Sửa/xóa môn, lặp tuần, test case, tài liệu, slide, cổng GPS/QR |

## Hợp đồng kết nối
- Dữ liệu: `App.state.sessions` (mảng buổi học), `App.state.attendance` (`"idMôn|YYYY-MM-DD"` → trạng thái)
- Đổi trạng thái: `App.setStatus(sessionId, 'YYYY-MM-DD', 'present'|'absent'|'late'|'excused'|'none')`
- Đổi danh sách môn xong: `App.emit('sessions:changed')`
- Lắng nghe: `App.on('attendance:changed', fn)`, `App.on('sessions:changed', fn)`, `App.on('calendar:rendered', fn)`
- Móc HTML: `td.slot[data-date][data-period]`, `button.session[data-session-id][data-date][data-status]`, `.badge[data-status]`, `.month-day[data-date]`
- Thứ tự script: app → calendar → data → attendance → stats
