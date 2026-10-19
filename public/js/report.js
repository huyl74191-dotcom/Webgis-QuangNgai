// =====================================================
// TRANG BÁO CÁO — Lọc dữ liệu, đánh giá QCVN, xuất Excel / in
// Quy tắc đánh giá lấy từ water-quality-rules.js (window.WQ),
// dùng chung với trang Cảnh báo.
// =====================================================

const tableBody = document.getElementById("reportTableBody");
const alertBox = document.getElementById("reportAlert");
const maMauSelect = document.getElementById("maMau");

let currentRecords = [];

document.getElementById("reportDate").textContent =
    new Date().toLocaleDateString("vi-VN");

function showAlert(message, type = "danger") {
    alertBox.innerHTML = `<div class="alert alert-${type} py-2">${message}</div>`;
}
function clearAlert() {
    alertBox.innerHTML = "";
}
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderTable(records) {
    currentRecords = records || [];

    const exportBtn = document.getElementById("btnExportExcel");
    const printBtn = document.getElementById("btnPrint");

    if (currentRecords.length === 0) {
        tableBody.innerHTML = `
            <tr><td colspan="10" class="text-center text-muted py-4">Không có dữ liệu phù hợp</td></tr>
        `;
        renderSummary([]);
        exportBtn.disabled = true;
        printBtn.disabled = true;
        return;
    }

    exportBtn.disabled = false;
    printBtn.disabled = false;

    tableBody.innerHTML = currentRecords.map(function (r) {
        const ngay = r.ngay_quan_trac
            ? new Date(r.ngay_quan_trac).toLocaleDateString("vi-VN")
            : "--";
        const result = WQ.evaluateRecord(r);

        // Ô trạng thái: huy hiệu + liệt kê chỉ tiêu vượt
        // (vì bảng chỉ hiện 6 cột, nhưng đánh giá xét đủ 12 chỉ tiêu)
        const statusCell = result.isExceeded
            ? `<span class="badge bg-danger">Vượt ngưỡng</span>
               <div class="small text-danger mt-1">${result.violations.map(v => v.text).join("<br>")}</div>`
            : '<span class="badge bg-success">Đạt chuẩn</span>';

        return `
            <tr class="${result.isExceeded ? 'table-danger' : ''}">
                <td><b>${r.ma_mau ?? "--"}</b></td>
                <td>${r.dot ?? "--"}</td>
                <td>${ngay}</td>
                <td>${r.ph ?? "--"}</td>
                <td>${r.do_mgl ?? "--"}</td>
                <td>${r.bod5 ?? "--"}</td>
                <td>${r.cod ?? "--"}</td>
                <td>${r.tss ?? "--"}</td>
                <td>${r.coliform ?? "--"}</td>
                <td>${statusCell}</td>
            </tr>
        `;
    }).join("");

    renderSummary(currentRecords);
}

// -----------------------------------------------------
// Tóm tắt đánh giá + câu kết luận tự động
// -----------------------------------------------------
function renderSummary(records) {
    const s = WQ.summarize(records);

    setText("sumTotal", s.totalSamples);
    setText("sumPass", s.passedSamples);
    setText("sumFail", s.exceededSamples);
    setText("sumRate", s.totalSamples ? WQ.fmtPercent(s.passedRate) : "--");

    // Các phần tử tùy chọn (chỉ cập nhật nếu Huy đã thêm vào report.ejs)
    setText("sumViolations", s.totalViolations);
    setText("sumFailRate", s.totalSamples ? WQ.fmtPercent(s.exceededRate) : "--");

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

    const conclusionBox = document.getElementById("reportConclusion");

    if (s.totalSamples === 0) {
        conclusionBox.textContent = "Không có dữ liệu phù hợp với bộ lọc hiện tại để đánh giá.";
        return;
    }

    if (s.exceededSamples === 0) {
        conclusionBox.innerHTML =
            `<b>Kết luận:</b> Toàn bộ ${s.totalSamples} mẫu quan trắc đều đạt QCVN 08-MT:2015/BTNMT (cột B1) ở tất cả chỉ tiêu được đo.`;
        return;
    }

    // Chỉ tiêu vượt nhiều nhất
    const worst = Object.values(s.byParameter)
        .filter(p => p.exceeded > 0)
        .sort((a, b) => b.rate - a.rate)[0];

    conclusionBox.innerHTML =
        `<b>Kết luận:</b> Trong tổng số ${s.totalSamples} mẫu quan trắc, có ` +
        `<b>${s.passedSamples} mẫu (${WQ.fmtPercent(s.passedRate)})</b> đạt QCVN 08-MT:2015/BTNMT (cột B1) ở tất cả chỉ tiêu; ` +
        `<b>${s.exceededSamples} mẫu (${WQ.fmtPercent(s.exceededRate)})</b> có ít nhất một chỉ tiêu vượt ngưỡng ` +
        `(tổng cộng ${s.totalViolations} lượt chỉ tiêu vượt). ` +
        `Chỉ tiêu vượt nhiều nhất là <b>${worst.label}</b> (${worst.exceeded}/${worst.measured} mẫu, ${WQ.fmtPercent(worst.rate)}). ` +
        `Cần lưu ý theo dõi và có biện pháp xử lý phù hợp.`;
}

// -----------------------------------------------------
// Cập nhật tiêu đề báo cáo theo bộ lọc đang chọn
// -----------------------------------------------------
function updateReportTitle() {
    const maMau = maMauSelect.value;
    const dot = document.getElementById("dot").value;

    let suffix = "TẤT CẢ CÁC ĐỢT";
    if (dot !== "all") suffix = `ĐỢT ${dot}`;
    if (maMau !== "all") suffix += ` — ĐIỂM ${maMau}`;

    document.getElementById("reportTitle").textContent =
        `BÁO CÁO TỔNG HỢP CHẤT LƯỢNG NƯỚC MẶT — ${suffix}`;
}

function populateMaMauOptions(records) {
    maMauSelect.innerHTML = '<option value="all">Tất cả điểm</option>';
    const set = new Set();
    records.forEach(r => { if (r.ma_mau) set.add(r.ma_mau); });
    [...set].sort().forEach(function (ma) {
        const opt = document.createElement("option");
        opt.value = ma;
        opt.textContent = ma;
        maMauSelect.appendChild(opt);
    });
}

function loadAll() {
    tableBody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-4">Đang tải dữ liệu...</td></tr>`;

    fetch("/api/chi-so-quan-trac")
        .then(res => {
            if (!res.ok) throw new Error("Không tải được dữ liệu");
            return res.json();
        })
        .then(json => {
            if (!json.success) throw new Error(json.error || "Lỗi không xác định");
            clearAlert();
            populateMaMauOptions(json.data || []);
            renderTable(json.data || []);
        })
        .catch(err => {
            console.error(err);
            showAlert("Không tải được dữ liệu: " + err.message);
        });
}

function applyFilters() {
    const maMau = maMauSelect.value;
    const dot = document.getElementById("dot").value;
    const tuNgay = document.getElementById("tuNgay").value;
    const denNgay = document.getElementById("denNgay").value;

    if (tuNgay && denNgay && tuNgay > denNgay) {
        showAlert('"Từ ngày" phải nhỏ hơn hoặc bằng "Đến ngày".', "warning");
        return;
    }

    updateReportTitle();

    const params = new URLSearchParams();
    if (maMau !== "all") params.append("ma_mau", maMau);
    if (dot !== "all") params.append("dot", dot);
    if (tuNgay) params.append("tu_ngay", tuNgay);
    if (denNgay) params.append("den_ngay", denNgay);

    tableBody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-4">Đang lọc dữ liệu...</td></tr>`;

    fetch("/api/loc?" + params.toString())
        .then(res => {
            if (!res.ok) throw new Error("Không lọc được dữ liệu");
            return res.json();
        })
        .then(json => {
            if (!json.success) throw new Error(json.error || "Lỗi không xác định");
            clearAlert();
            renderTable(json.data || []);
        })
        .catch(err => {
            console.error(err);
            showAlert("Không lọc được dữ liệu: " + err.message);
        });
}

document.getElementById("btnLoc").addEventListener("click", applyFilters);

document.getElementById("btnResetReport").addEventListener("click", function () {
    maMauSelect.value = "all";
    document.getElementById("dot").value = "all";
    document.getElementById("tuNgay").value = "";
    document.getElementById("denNgay").value = "";
    clearAlert();
    updateReportTitle();
    loadAll();
});

// -----------------------------------------------------
// Xuất Excel (dùng SheetJS, làm hoàn toàn phía trình duyệt)
// -----------------------------------------------------
document.getElementById("btnExportExcel").addEventListener("click", function () {
    if (!currentRecords.length) {
        showAlert("Không có dữ liệu để xuất.", "warning");
        return;
    }

    const rows = currentRecords.map(function (r) {
        const result = WQ.evaluateRecord(r);
        return {
            "Ký hiệu mẫu": r.ma_mau,
            "Đợt": r.dot,
            "Ngày quan trắc": r.ngay_quan_trac
                ? new Date(r.ngay_quan_trac).toLocaleDateString("vi-VN")
                : "",
            "pH": r.ph,
            "DO (mg/l)": r.do_mgl,
            "BOD5 (mg/l)": r.bod5,
            "COD (mg/l)": r.cod,
            "TSS (mg/l)": r.tss,
            "Coliform (MPN/100ml)": r.coliform,
            "Amoni (mg/l)": r.amoni,
            "Clorua (mg/l)": r.clorua,
            "Fe (mg/l)": r.fe,
            "NO2- (mg/l)": r.no2,
            "Tổng dầu mỡ (mg/l)": r.tong_dau,
            "E.coli (MPN/100ml)": r.ecoli,
            "TOC (mg/l)": r.toc,
            "Tổng P (mg/l)": r.tong_p,
            "Tổng N (mg/l)": r.tong_n,
            "Trạng thái": result.isExceeded ? "Vượt ngưỡng" : "Đạt chuẩn",
            "Chỉ tiêu vượt ngưỡng": result.violations.map(v => v.text).join("; "),
            "Ghi chú": r.ghi_chu
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "BaoCao");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `BaoCao_ChatLuongNuoc_${today}.xlsx`);
});

// -----------------------------------------------------
// In báo cáo
// -----------------------------------------------------
document.getElementById("btnPrint").addEventListener("click", function () {
    window.print();
});

// -----------------------------------------------------
// Khởi động
// -----------------------------------------------------
loadAll();