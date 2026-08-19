// =====================================================
// TRANG QUAN TRẮC — Lấy & lọc dữ liệu chỉ số quan trắc từ Neon (qua API)
// =====================================================

const tableBody = document.getElementById("monitoringTableBody");
const totalRecordsEl = document.getElementById("totalRecords");
const alertBox = document.getElementById("monitoringAlert");
const maMauSelect = document.getElementById("maMau");
const namSelect = document.getElementById("nam");

let allRecords = [];

// -----------------------------------------------------
// Hiển thị thông báo lỗi/trạng thái phía trên bảng
// -----------------------------------------------------
function showAlert(message, type = "danger") {
    alertBox.innerHTML = `
        <div class="alert alert-${type} py-2">${message}</div>
    `;
}

function clearAlert() {
    alertBox.innerHTML = "";
}

// -----------------------------------------------------
// Vẽ dữ liệu ra bảng
// -----------------------------------------------------
function renderTable(records) {
    if (!records || records.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="20" class="text-center text-muted py-4">
                    Không có dữ liệu phù hợp
                </td>
            </tr>
        `;
        totalRecordsEl.textContent = 0;
        return;
    }

    tableBody.innerHTML = records.map(function (r) {
        const ngay = r.ngay_quan_trac
            ? new Date(r.ngay_quan_trac).toLocaleDateString("vi-VN")
            : "--";

        return `
            <tr>
                <td><b>${r.ma_mau ?? "--"}</b></td>
                <td>${r.nam ?? "--"}</td>
                <td>${r.dot ?? "--"}</td>
                <td>${ngay}</td>
                <td>${r.ph ?? "--"}</td>
                <td>${r.do_mgl ?? "--"}</td>
                <td>${r.bod5 ?? "--"}</td>
                <td>${r.cod ?? "--"}</td>
                <td>${r.tss ?? "--"}</td>
                <td>${r.coliform ?? "--"}</td>
                <td>${r.amoni ?? "--"}</td>
                <td>${r.clorua ?? "--"}</td>
                <td>${r.fe ?? "--"}</td>
                <td>${r.no2 ?? "--"}</td>
                <td>${r.tong_dau ?? "--"}</td>
                <td>${r.ecoli ?? "--"}</td>
                <td>${r.toc ?? "--"}</td>
                <td>${r.tong_p ?? "--"}</td>
                <td>${r.tong_n ?? "--"}</td>
                <td>${r.ghi_chu ?? ""}</td>
            </tr>
        `;
    }).join("");

    totalRecordsEl.textContent = records.length;
}

// -----------------------------------------------------
// Nạp danh sách ký hiệu mẫu vào dropdown (lấy từ dữ liệu đã tải)
// -----------------------------------------------------
function populateMaMauOptions(records) {
    maMauSelect.innerHTML = '<option value="all">Tất cả điểm</option>';

    const maMauSet = new Set();
    records.forEach(function (r) {
        if (r.ma_mau) maMauSet.add(r.ma_mau);
    });

    [...maMauSet].sort().forEach(function (ma) {
        const option = document.createElement("option");
        option.value = ma;
        option.textContent = ma;
        maMauSelect.appendChild(option);
    });
}

// -----------------------------------------------------
// Nạp danh sách năm vào dropdown (lấy động từ dữ liệu đã tải,
// tự động hiện đủ khi có năm mới được import thêm vào DB)
// -----------------------------------------------------
function populateNamOptions(records) {
    namSelect.innerHTML = '<option value="all">Tất cả năm</option>';

    const namSet = new Set();
    records.forEach(function (r) {
        if (r.nam) namSet.add(r.nam);
    });

    [...namSet].sort(function (a, b) { return b - a; }).forEach(function (nam) {
        const option = document.createElement("option");
        option.value = nam;
        option.textContent = "Năm " + nam;
        namSelect.appendChild(option);
    });
}

// -----------------------------------------------------
// Tải toàn bộ dữ liệu ban đầu từ API
// -----------------------------------------------------
function loadAllRecords() {
    tableBody.innerHTML = `
        <tr>
            <td colspan="20" class="text-center text-muted py-4">
                Đang tải dữ liệu...
            </td>
        </tr>
    `;

    fetch("/api/chi-so-quan-trac")
        .then(function (res) {
            if (!res.ok) throw new Error("Không tải được dữ liệu quan trắc");
            return res.json();
        })
        .then(function (json) {
            if (!json.success) throw new Error(json.error || "Lỗi không xác định");

            allRecords = json.data || [];
            clearAlert();
            populateMaMauOptions(allRecords);
            populateNamOptions(allRecords);
            renderTable(allRecords);
        })
        .catch(function (err) {
            console.error(err);
            showAlert("Không tải được dữ liệu quan trắc: " + err.message);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="20" class="text-center text-danger py-4">
                        Lỗi tải dữ liệu
                    </td>
                </tr>
            `;
        });
}

// -----------------------------------------------------
// Lọc dữ liệu theo mã mẫu / khoảng ngày qua API /api/loc
// -----------------------------------------------------
function applyMonitoringFilters() {
    const maMau = maMauSelect.value;
    const nam = namSelect.value;
    const dot = document.getElementById("dot").value;
    const tuNgay = document.getElementById("tuNgay").value;
    const denNgay = document.getElementById("denNgay").value;

    const params = new URLSearchParams();
    if (maMau !== "all") params.append("ma_mau", maMau);
    if (nam !== "all") params.append("nam", nam);
    if (dot !== "all") params.append("dot", dot);
    if (tuNgay) params.append("tu_ngay", tuNgay);
    if (denNgay) params.append("den_ngay", denNgay);

    tableBody.innerHTML = `
        <tr>
            <td colspan="20" class="text-center text-muted py-4">
                Đang lọc dữ liệu...
            </td>
        </tr>
    `;

    fetch("/api/loc?" + params.toString())
        .then(function (res) {
            if (!res.ok) throw new Error("Không lọc được dữ liệu");
            return res.json();
        })
        .then(function (json) {
            if (!json.success) throw new Error(json.error || "Lỗi không xác định");
            clearAlert();
            renderTable(json.data || []);
        })
        .catch(function (err) {
            console.error(err);
            showAlert("Không lọc được dữ liệu: " + err.message);
        });
}

// -----------------------------------------------------
// Gắn sự kiện
// -----------------------------------------------------
document.getElementById("btnLoc").addEventListener("click", applyMonitoringFilters);

document.getElementById("btnResetMonitoring").addEventListener("click", function () {
    maMauSelect.value = "all";
    namSelect.value = "all";
    document.getElementById("dot").value = "all";
    document.getElementById("tuNgay").value = "";
    document.getElementById("denNgay").value = "";
    clearAlert();
    renderTable(allRecords);
});

// -----------------------------------------------------
// Khởi động
// -----------------------------------------------------
loadAllRecords();