// =====================================================
// TRANG CẢNH BÁO — So sánh dữ liệu với QCVN 08-MT:2015/BTNMT (cột B1)
// =====================================================

// Ngưỡng giới hạn cột B1 (dùng cho tưới tiêu, thủy lợi và mục đích tương đương)
const QCVN08_B1 = {
    ph: { min: 5.5, max: 9 },
    bod5: { max: 15 },
    cod: { max: 30 },
    do_mgl: { min: 4 },       // DO phải >= ngưỡng, thấp hơn là vi phạm
    tss: { max: 50 },
    coliform: { max: 7500 },
    amoni: { max: 0.9 },
    clorua: { max: 350 },
    no2: { max: 0.05 },
    fe: { max: 1.5 },
    tong_dau: { max: 1 },
    ecoli: { max: 100 }
};

const LABELS = {
    ph: "pH",
    bod5: "BOD5",
    cod: "COD",
    do_mgl: "DO",
    tss: "TSS",
    coliform: "Coliform",
    amoni: "Amoni",
    clorua: "Clorua",
    no2: "Nitrit (NO2-)",
    fe: "Sắt (Fe)",
    tong_dau: "Tổng dầu mỡ",
    ecoli: "E.coli"
};

const tableBody = document.getElementById("warningTableBody");
const alertBox = document.getElementById("warningAlert");
const totalCheckedEl = document.getElementById("totalChecked");
const totalExceededEl = document.getElementById("totalExceeded");

function showAlert(message, type = "danger") {
    alertBox.innerHTML = `<div class="alert alert-${type} py-2">${message}</div>`;
}

// -----------------------------------------------------
// Kiểm tra 1 bản ghi, trả về danh sách chỉ tiêu vi phạm
// -----------------------------------------------------
function checkViolations(record) {
    const violations = [];

    Object.keys(QCVN08_B1).forEach(function (key) {
        const rule = QCVN08_B1[key];
        const value = parseFloat(record[key]);

        if (isNaN(value)) return;

        if (rule.min !== undefined && value < rule.min) {
            violations.push(`${LABELS[key]} = ${value} (< ${rule.min})`);
        }
        if (rule.max !== undefined && value > rule.max) {
            violations.push(`${LABELS[key]} = ${value} (> ${rule.max})`);
        }
    });

    return violations;
}

// -----------------------------------------------------
// Vẽ bảng
// -----------------------------------------------------
function renderTable(records) {
    if (!records || records.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-muted py-4">
                    Không có dữ liệu
                </td>
            </tr>
        `;
        totalCheckedEl.textContent = 0;
        totalExceededEl.textContent = 0;
        return;
    }

    let exceededCount = 0;

    const rows = records.map(function (r) {
        const violations = checkViolations(r);
        const ngay = r.ngay_quan_trac
            ? new Date(r.ngay_quan_trac).toLocaleDateString("vi-VN")
            : "--";

        if (violations.length > 0) {
            exceededCount++;
            return `
                <tr class="table-danger">
                    <td><b>${r.ma_mau ?? "--"}</b></td>
                    <td>${ngay}</td>
                    <td><span class="badge bg-danger">Vượt ngưỡng</span></td>
                    <td>${violations.join("<br>")}</td>
                </tr>
            `;
        }

        return `
            <tr>
                <td><b>${r.ma_mau ?? "--"}</b></td>
                <td>${ngay}</td>
                <td><span class="badge bg-success">Đạt chuẩn</span></td>
                <td>—</td>
            </tr>
        `;
    });

    tableBody.innerHTML = rows.join("");
    totalCheckedEl.textContent = records.length;
    totalExceededEl.textContent = exceededCount;
}

// -----------------------------------------------------
// Tải dữ liệu từ API và đối chiếu
// -----------------------------------------------------
fetch("/api/chi-so-quan-trac")
    .then(function (res) {
        if (!res.ok) throw new Error("Không tải được dữ liệu quan trắc");
        return res.json();
    })
    .then(function (json) {
        if (!json.success) throw new Error(json.error || "Lỗi không xác định");
        renderTable(json.data || []);
    })
    .catch(function (err) {
        console.error(err);
        showAlert("Không tải được dữ liệu: " + err.message);
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-danger py-4">
                    Lỗi tải dữ liệu
                </td>
            </tr>
        `;
    });