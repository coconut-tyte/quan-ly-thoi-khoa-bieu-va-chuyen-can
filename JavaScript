/* =====================================================================
   VIỆC SỐ 4 - JS: LOGIC THỐNG KÊ VÀ CẢNH BÁO
   ---------------------------------------------------------------------
   Dữ liệu đầu vào (thống nhất với TV3, TV5):
     subjects = [{ id, name, color }]
     sessions = [{ id, subjectId, date, status }]
     status   = 'present' | 'late' | 'absent' | 'excused' | ''  ('' = chưa điểm danh)

   Cách dùng trong project:
     <script src="thongke.js"></script>
     ThongKe.refresh(subjects, sessions);   // gọi sau mỗi lần điểm danh
   ===================================================================== */
const ThongKe = (() => {
  const CONFIG = {
    LIMIT: 20, // nghỉ > 20% => đỏ
    WARN_FROM: 10, // nghỉ từ 10% => cam
    COUNT_LATE_AS_PRESENT: true, // đi trễ vẫn tính có mặt
    COUNT_EXCUSED_AS_ABSENT: false, // nghỉ có phép không tính vào buổi nghỉ
  };

  /* ---------------- 1. LOGIC TÍNH TOÁN ---------------- */

  // Mức cảnh báo: ok (xanh) -> warn (cam) -> danger (đỏ)
  function getLevel(absentRate) {
    if (absentRate > CONFIG.LIMIT) return "danger";
    if (absentRate >= CONFIG.WARN_FROM) return "warn";
    return "ok";
  }

  // Tính thống kê cho 1 danh sách buổi học
  function calcStats(list) {
    let present = 0,
      absent = 0;
    list
      .filter((s) => s.status !== "")
      .forEach((s) => {
        if (s.status === "present") present++;
        else if (s.status === "late")
          CONFIG.COUNT_LATE_AS_PRESENT ? present++ : absent++;
        else if (s.status === "absent") absent++;
        else if (s.status === "excused")
          CONFIG.COUNT_EXCUSED_AS_ABSENT ? absent++ : present++;
      });
    const total = present + absent;
    const absentRate = total ? (absent / total) * 100 : 0;
    return {
      total,
      present,
      absent,
      presentRate: +(100 - absentRate).toFixed(1),
      absentRate: +absentRate.toFixed(1),
      level: getLevel(absentRate),
    };
  }

  // % đi học theo từng môn
  function calcBySubject(subjects, sessions) {
    return subjects.map((sub) => ({
      subject: sub,
      ...calcStats(sessions.filter((s) => s.subjectId === sub.id)),
    }));
  }

  // % đi học tổng tất cả môn
  function calcOverall(sessions) {
    return calcStats(sessions);
  }

  /* ---------------- 2. CẢNH BÁO (toast / banner / modal) ---------------- */

  const COLORS = { ok: "#16a34a", warn: "#f59e0b", danger: "#dc2626" };
  const alerted = new Set(); // tránh báo toast lặp lại

  function el(tag, css, text) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text) e.textContent = text;
    return e;
  }

  function showToast(msg, level = "warn", ms = 4500) {
    let box = document.getElementById("tk-toast-box");
    if (!box) {
      box = el(
        "div",
        "position:fixed;right:16px;bottom:16px;display:flex;flex-direction:column;gap:8px;z-index:9999",
      );
      box.id = "tk-toast-box";
      document.body.appendChild(box);
    }
    const t = el(
      "div",
      `background:${COLORS[level]};color:#fff;padding:12px 16px;border-radius:10px;` +
        "box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:320px;font-family:sans-serif",
      msg,
    );
    box.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // Banner đổi màu cam -> đỏ theo mức nặng nhất
  function updateBanner(bySubject) {
    let b = document.getElementById("tk-banner");
    if (!b) {
      b = el(
        "div",
        "padding:12px 16px;color:#fff;font-weight:600;font-family:sans-serif;transition:background .4s",
      );
      b.id = "tk-banner";
      b.setAttribute("role", "alert");
      document.body.prepend(b);
    }
    const bad = bySubject.filter((r) => r.level === "danger");
    const warn = bySubject.filter((r) => r.level === "warn");
    if (bad.length) {
      b.style.display = "block";
      b.style.background = COLORS.danger;
      b.textContent =
        "🚨 Vượt ngưỡng nghỉ " +
        CONFIG.LIMIT +
        "%: " +
        bad.map((r) => r.subject.name).join(", ");
    } else if (warn.length) {
      b.style.display = "block";
      b.style.background = COLORS.warn;
      b.textContent =
        "⚠️ Sắp chạm ngưỡng: " + warn.map((r) => r.subject.name).join(", ");
    } else {
      b.style.display = "none";
    }
  }

  function showModal(bySubject) {
    const bad = bySubject.filter((r) => r.level !== "ok");
    const overlay = el(
      "div",
      "position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;" +
        "align-items:center;justify-content:center;z-index:10000",
    );
    const box = el(
      "div",
      "background:#fff;color:#222;padding:20px;border-radius:12px;max-width:420px;" +
        "width:90%;font-family:sans-serif;border-top:6px solid " +
        COLORS.danger,
    );
    box.appendChild(el("h3", "margin-top:0", "⚠️ Cảnh báo chuyên cần"));
    if (bad.length) {
      const ul = el("ul", "padding-left:18px");
      bad.forEach((r) =>
        ul.appendChild(
          el(
            "li",
            "",
            r.subject.name +
              ": nghỉ " +
              r.absentRate +
              "% (" +
              r.absent +
              "/" +
              r.total +
              " buổi) - " +
              (r.level === "danger" ? "đã vượt ngưỡng" : "sắp vượt ngưỡng"),
          ),
        ),
      );
      box.appendChild(ul);
    } else {
      box.appendChild(el("p", "", "🎉 Chưa có môn nào bị cảnh báo."));
    }
    const btn = el("button", "padding:8px 14px;cursor:pointer", "Đóng");
    btn.onclick = () => overlay.remove();
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function checkAlerts(bySubject) {
    updateBanner(bySubject);
    bySubject.forEach((r) => {
      const id = r.subject.id;
      if (r.level === "ok") {
        alerted.delete(id + ":warn");
        alerted.delete(id + ":danger");
        return;
      }
      const key = id + ":" + r.level;
      if (alerted.has(key)) return;
      alerted.add(key);
      showToast(
        (r.level === "danger" ? "🚨 " : "⚠️ ") +
          r.subject.name +
          ": nghỉ " +
          r.absentRate +
          "% (" +
          r.absent +
          "/" +
          r.total +
          " buổi)",
        r.level,
      );
    });
  }

  /* ---------------- 3. BẢNG THỐNG KÊ ---------------- */

  const LEVEL_TEXT = { ok: "Tốt", warn: "Cảnh báo", danger: "Vượt ngưỡng" };

  // container: phần tử HTML sẽ chứa bảng (div)
  function renderTable(container, bySubject, overall) {
    const row = (name, r, bold) => `
      <tr style="${bold ? "font-weight:700" : ""}">
        <td>${name}</td><td>${r.total}</td><td>${r.present}</td><td>${r.absent}</td>
        <td>${r.presentRate}%</td><td>${r.absentRate}%</td>
        <td style="color:${COLORS[r.level]};font-weight:600">${LEVEL_TEXT[r.level]}</td>
      </tr>`;
    container.innerHTML = `
      <table class="tk-table" style="width:100%;border-collapse:collapse">
        <thead><tr><th>Môn học</th><th>Đã học</th><th>Có mặt</th><th>Nghỉ</th>
        <th>% đi học</th><th>% nghỉ</th><th>Trạng thái</th></tr></thead>
        <tbody>${bySubject.map((r) => row(r.subject.name, r, false)).join("")}</tbody>
        <tfoot>${row("TỔNG", overall, true)}</tfoot>
      </table>`;
  }

  /* ---------------- 4. BIỂU ĐỒ BẰNG CANVAS ---------------- */

  // Biểu đồ tròn: có mặt / nghỉ (tổng)
  function drawPie(canvas, overall) {
    const ctx = canvas.getContext("2d"),
      W = canvas.width,
      H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const parts = [
      { label: "Có mặt", value: overall.present, color: COLORS.ok },
      { label: "Nghỉ", value: overall.absent, color: COLORS.danger },
    ];
    const sum = parts[0].value + parts[1].value;
    const cx = W / 2 - 50,
      cy = H / 2,
      r = Math.min(W, H) / 2 - 20;
    if (!sum) {
      ctx.font = "16px sans-serif";
      ctx.fillText("Chưa có dữ liệu", cx - 50, cy);
      return;
    }
    let start = -Math.PI / 2;
    parts.forEach((p) => {
      const a = (p.value / sum) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + a);
      ctx.closePath();
      ctx.fillStyle = p.color;
      ctx.fill();
      start += a;
    });
    ctx.font = "14px sans-serif";
    parts.forEach((p, i) => {
      const x = cx + r + 20,
        y = cy - 15 + i * 26;
      ctx.fillStyle = p.color;
      ctx.fillRect(x, y - 10, 12, 12);
      ctx.fillStyle = "#888";
      ctx.fillText(
        p.label + ": " + ((p.value / sum) * 100).toFixed(1) + "%",
        x + 18,
        y,
      );
    });
  }

  // Biểu đồ cột: % nghỉ từng môn + đường ngưỡng
  function drawBars(canvas, bySubject) {
    const ctx = canvas.getContext("2d"),
      W = canvas.width,
      H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const pad = { l: 36, r: 10, t: 16, b: 46 };
    const plotW = W - pad.l - pad.r,
      plotH = H - pad.t - pad.b;
    const maxY = Math.max(40, ...bySubject.map((r) => r.absentRate));
    const yOf = (v) => pad.t + plotH - (v / maxY) * plotH;

    ctx.font = "11px sans-serif";
    for (let v = 0; v <= maxY; v += 10) {
      ctx.strokeStyle = "#8884";
      ctx.beginPath();
      ctx.moveTo(pad.l, yOf(v));
      ctx.lineTo(W - pad.r, yOf(v));
      ctx.stroke();
      ctx.fillStyle = "#888";
      ctx.fillText(v + "%", 4, yOf(v) + 4);
    }
    const n = bySubject.length || 1,
      slot = plotW / n,
      bw = Math.min(50, slot * 0.6);
    ctx.textAlign = "center";
    bySubject.forEach((r, i) => {
      const x = pad.l + i * slot + (slot - bw) / 2,
        y = yOf(r.absentRate);
      ctx.fillStyle = COLORS[r.level];
      ctx.fillRect(x, y, bw, yOf(0) - y);
      ctx.fillStyle = "#888";
      ctx.fillText(r.absentRate + "%", x + bw / 2, y - 4);
      const name =
        r.subject.name.length > 9
          ? r.subject.name.slice(0, 8) + "…"
          : r.subject.name;
      ctx.fillText(name, x + bw / 2, H - pad.b + 16);
    });
    ctx.textAlign = "start";
    ctx.strokeStyle = COLORS.danger;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.l, yOf(CONFIG.LIMIT));
    ctx.lineTo(W - pad.r, yOf(CONFIG.LIMIT));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.danger;
    ctx.fillText("Ngưỡng " + CONFIG.LIMIT + "%", W - 80, yOf(CONFIG.LIMIT) - 4);
  }

  /* ---------------- 5. HÀM CHÍNH ---------------- */

  // ids: id của 3 phần tử trong HTML (TV1 tạo sẵn). Không có thì bỏ qua phần đó.
  function refresh(subjects, sessions, ids = {}) {
    const { tableId = "tk-table", pieId = "tk-pie", barId = "tk-bar" } = ids;
    const bySubject = calcBySubject(subjects, sessions);
    const overall = calcOverall(sessions);

    const tbl = document.getElementById(tableId);
    const pie = document.getElementById(pieId);
    const bar = document.getElementById(barId);
    if (tbl) renderTable(tbl, bySubject, overall);
    if (pie) drawPie(pie, overall);
    if (bar) drawBars(bar, bySubject);

    checkAlerts(bySubject);
    return { bySubject, overall };
  }

  return {
    CONFIG,
    getLevel,
    calcStats,
    calcBySubject,
    calcOverall,
    showToast,
    showModal,
    checkAlerts,
    refresh,
  };
})();
