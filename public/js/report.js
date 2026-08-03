// =====================================================
// TRANG BÁO CÁO — Lọc dữ liệu, đánh giá QCVN, xuất Excel / in
// =====================================================

// Ngưỡng B1 (dùng chung logic với trang cảnh báo, thu gọn 6 chỉ tiêu chính để hiển thị báo cáo)
const QCVN08_B1 = {
    ph: { min: 5.5, max: 9 },
    bod5: { max: 15 },
    cod: { max: 30 },
    do_mgl: { min: 4 },
    tss: { max: 50 },
    coliform: { max: 7500 }
};

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

function isExceeded(record) {
    return Object.keys(QCVN08_B1).some(function (key) {
        const rule = QCVN08_B1[key];
        const value = parseFloat(record[key]);
        if (isNaN(value)) return false;
        if (rule.min !== undefined && value < rule.min) return true;
        if (rule.max !== undefined && value > rule.max) return true;
        return false;
    });
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
        const exceeded = isExceeded(r);

        return `
            <tr class="${exceeded ? 'table-danger' : ''}">
                <td><b>${r.ma_mau ?? "--"}</b></td>
                <td>${r.dot ?? "--"}</td>
                <td>${ngay}</td>
                <td>${r.ph ?? "--"}</td>
                <td>${r.do_mgl ?? "--"}</td>
                <td>${r.bod5 ?? "--"}</td>
                <td>${r.cod ?? "--"}</td>
                <td>${r.tss ?? "--"}</td>
                <td>${r.coliform ?? "--"}</td>
                <td>${exceeded
                    ? '<span class="badge bg-danger">Vượt ngưỡng</span>'
                    : '<span class="badge bg-success">Đạt chuẩn</span>'}</td>
            </tr>
        `;
    }).join("");

    renderSummary(currentRecords);
}

// -----------------------------------------------------
// Tóm tắt đánh giá + câu kết luận tự động
// -----------------------------------------------------
function renderSummary(records) {
    const total = records.length;
    const failCount = records.filter(isExceeded).length;
    const passCount = total - failCount;
    const passRate = total ? ((passCount / total) * 100).toFixed(1) : "0.0";
    const failRate = total ? ((failCount / total) * 100).toFixed(1) : "0.0";

    document.getElementById("sumTotal").textContent = total;
    document.getElementById("sumPass").textContent = passCount;
    document.getElementById("sumFail").textContent = failCount;
    document.getElementById("sumRate").textContent = total ? passRate + "%" : "--";

    const conclusionBox = document.getElementById("reportConclusion");

    if (total === 0) {
        conclusionBox.textContent = "Không có dữ liệu phù hợp với bộ lọc hiện tại để đánh giá.";
        return;
    }

    if (failCount === 0) {
        conclusionBox.innerHTML =
            `<b>Kết luận:</b> Toàn bộ ${total} mẫu quan trắc đều đạt chuẩn theo QCVN 08-MT:2015/BTNMT (cột B1).`;
    } else {
        conclusionBox.innerHTML =
            `<b>Kết luận:</b> Trong tổng số ${total} mẫu quan trắc, có <b>${failCount} mẫu (${failRate}%)</b> ` +
            `vượt ngưỡng cho phép theo QCVN 08-MT:2015/BTNMT (cột B1), cần lưu ý theo dõi và có biện pháp xử lý phù hợp.`;
    }
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
            "Trạng thái": isExceeded(r) ? "Vượt ngưỡng" : "Đạt chuẩn",
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