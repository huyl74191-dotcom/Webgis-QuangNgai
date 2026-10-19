// Trang canh bao - QCVN 08:2023/BTNMT
// Quy tắc lấy từ water-quality-rules.js (window.WQ)
// =====================================================
 
const tableBody = document.getElementById("warningTableBody");
const alertBox = document.getElementById("warningAlert");
 
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
 
function showAlert(message, type = "danger") {
    alertBox.innerHTML = `<div class="alert alert-${type} py-2">${message}</div>`;
}
 
function renderSummary(records) {
    const s = WQ.summarize(records);
 
    setText("totalChecked", s.totalSamples);
    setText("totalExceeded", s.exceededSamples);
    setText("exceededRate", WQ.fmtPercent(s.exceededRate));
    setText("passedRate", WQ.fmtPercent(s.passedRate));
    setText("totalViolations", s.totalViolations);
    setText("healthFailSamples", s.healthFailSamples);
    setText("levelA", s.levelCounts.A);
    setText("levelB", s.levelCounts.B);
    setText("levelC", s.levelCounts.C);
    setText("levelD", s.levelCounts.D);
 
    const paramBody = document.getElementById("paramRateBody");
    if (paramBody) {
        paramBody.innerHTML = Object.values(s.byParameter)
            .filter(p => p.measured > 0)
            .sort((a, b) => b.rate - a.rate)
            .map(p => `
                <tr>
                    <td>${p.label}</td>
                    <td class="text-end">${p.exceeded}/${p.measured}</td>
                    <td class="text-end">${WQ.fmtPercent(p.rate)}</td>
                </tr>`)
            .join("");
    }
 
    // Cảnh báo về chất lượng dữ liệu đầu vào
    const notes = [];
    if (s.unknownTypeSamples > 0) {
        notes.push(`${s.unknownTypeSamples} mẫu chưa xác định được loại nguồn nước, tạm đối chiếu theo Bảng 2 (sông, suối, kênh).`);
    }
    if (s.outOfScopeSamples > 0) {
        notes.push(`${s.outOfScopeSamples} mẫu thuộc cửa biển, nằm ngoài phạm vi ${WQ.STANDARD_NAME}; kết quả chỉ mang tính tham khảo.`);
    }
    if (notes.length) showAlert(notes.join("<br>"), "warning");
}
 
function renderTable(records) {
    if (!records || records.length === 0) {
        tableBody.innerHTML = `
            <tr><td colspan="4" class="text-center text-muted py-4">Không có dữ liệu</td></tr>`;
        renderSummary([]);
        return;
    }
 
    tableBody.innerHTML = records.map(function (r) {
        const result = WQ.evaluateRecord(r);
        const ngay = r.ngay_quan_trac
            ? new Date(r.ngay_quan_trac).toLocaleDateString("vi-VN")
            : "--";
 
        if (result.isExceeded) {
            const levelText = result.worstLevel ? ` (Mức ${result.worstLevel})` : "";
            return `
                <tr class="table-danger">
                    <td><b>${r.ma_mau ?? "--"}</b></td>
                    <td>${ngay}</td>
                    <td><span class="badge bg-danger">Vượt ngưỡng${levelText}</span></td>
                    <td>${result.violations.map(v => v.text).join("<br>")}</td>
                </tr>`;
        }
        const levelText = result.worstLevel ? ` (Mức ${result.worstLevel})` : "";
        return `
            <tr>
                <td><b>${r.ma_mau ?? "--"}</b></td>
                <td>${ngay}</td>
                <td><span class="badge bg-success">Đạt${levelText}</span></td>
                <td>—</td>
            </tr>`;
    }).join("");
 
    renderSummary(records);
}
 
fetch("/api/chi-so-quan-trac")
    .then(res => {
        if (!res.ok) throw new Error("Không tải được dữ liệu quan trắc");
        return res.json();
    })
    .then(json => {
        if (!json.success) throw new Error(json.error || "Lỗi không xác định");
        renderTable(json.data || []);
    })
    .catch(err => {
        console.error(err);
        showAlert("Không tải được dữ liệu: " + err.message);
        tableBody.innerHTML = `
            <tr><td colspan="4" class="text-center text-danger py-4">Lỗi tải dữ liệu</td></tr>`;
    });