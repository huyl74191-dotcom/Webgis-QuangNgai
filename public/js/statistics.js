// =====================================================
// TRANG THỐNG KÊ
// Phần 1: Phân bố điểm quan trắc (theo huyện / loại nguồn nước)
// Phần 2: Chất lượng nước trung bình thực tế (từ Neon, qua /api/thong-ke)
// =====================================================

// ---- Hàm tiện ích: lấy field bất kể khoảng trắng / hoa-thường dư ----
function normalizeKey(str) {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

function getProp(properties, targetName) {
    const target = normalizeKey(targetName);
    for (const key in properties) {
        if (normalizeKey(key) === target) {
            return properties[key];
        }
    }
    return undefined;
}

function showStatsAlert(message, type = "danger") {
    document.getElementById("statsAlert").innerHTML =
        `<div class="alert alert-${type} py-2">${message}</div>`;
}

// Bảng màu dùng chung cho các biểu đồ (đồng bộ tông xanh của site)
const CHART_COLORS = [
    "#0066cc", "#9f96f1", "#5290c3", "#91b9b1",
    "#8942e0", "#d0a58b", "#bda768", "#c96e78"
];

// =====================================================
// PHẦN 1 — Phân bố điểm quan trắc (gọi qua API, không đọc file tĩnh nữa)
// =====================================================
fetch('/api/diem-quan-trac')
    .then(res => {
        if (!res.ok) throw new Error("Không tải được điểm quan trắc");
        return res.json();
    })
    .then(data => {
        const features = (data.features || []).filter(f => f.geometry);
        renderSummary(features);
        renderDistrictChart(features);
        renderWaterTypeChart(features);
        renderTable(features);
    })
    .catch(err => {
        console.error(err);
        showStatsAlert("Không tải được dữ liệu điểm quan trắc: " + err.message);
    });

function renderSummary(features) {
    const districts = new Set();
    const waterTypes = new Set();

    features.forEach(f => {
        const huyen = getProp(f.properties, "Huyện");
        const loaiNuoc = getProp(f.properties, "Loại nguồn nước");
        if (huyen) districts.add(huyen);
        if (loaiNuoc) waterTypes.add(loaiNuoc);
    });

    document.getElementById("statTotal").textContent = features.length;
    document.getElementById("statDistricts").textContent = districts.size;
    document.getElementById("statWaterTypes").textContent = waterTypes.size;

    const countByDistrict = countBy(features, "Huyện");
    const topDistrict = Object.entries(countByDistrict).sort((a, b) => b[1] - a[1])[0];
    document.getElementById("statTopDistrict").textContent = topDistrict ? topDistrict[0] : "--";
}

function countBy(features, fieldName) {
    const result = {};
    features.forEach(f => {
        const value = getProp(f.properties, fieldName) || "Không xác định";
        result[value] = (result[value] || 0) + 1;
    });
    return result;
}

function renderDistrictChart(features) {
    const counts = countBy(features, "Huyện");
    const labels = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const values = labels.map(l => counts[l]);

    new Chart(document.getElementById("districtChart"), {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Số điểm quan trắc",
                data: values,
                backgroundColor: "#134b84",
                borderRadius: 6,
                maxBarThickness: 34
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

function renderWaterTypeChart(features) {
    const counts = countBy(features, "Loại nguồn nước");
    const labels = Object.keys(counts);
    const values = labels.map(l => counts[l]);

    new Chart(document.getElementById("waterTypeChart"), {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: CHART_COLORS,
                borderWidth: 2,
                borderColor: "#fff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "bottom", labels: { boxWidth: 14, padding: 14 } }
            }
        }
    });
}

function renderTable(features) {
    const counts = countBy(features, "Huyện");
    const total = features.length;
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    const tbody = document.getElementById("districtTableBody");
    tbody.innerHTML = rows.map(([district, count]) => {
        const percent = total ? ((count / total) * 100).toFixed(1) : "0.0";
        return `<tr>
            <td>${district}</td>
            <td>${count}</td>
            <td>${percent}%</td>
        </tr>`;
    }).join("");
}

// =====================================================
// PHẦN 2 — Chất lượng nước trung bình thực tế (Neon, qua /api/thong-ke)
// =====================================================
fetch('/api/thong-ke')
    .then(res => {
        if (!res.ok) throw new Error("Không tải được số liệu thống kê chất lượng nước");
        return res.json();
    })
    .then(json => {
        if (!json.success) throw new Error(json.error || "Lỗi không xác định");
        renderQualityAverages(json.trung_binh_toan_tinh);
        renderPointTable(json.theo_diem);
    })
    .catch(err => {
        console.error(err);
        showStatsAlert("Không tải được số liệu chất lượng nước: " + err.message);
    });

function renderQualityAverages(avg) {
    if (!avg) return;
    document.getElementById("avgPh").textContent = avg.ph_trung_binh ?? "--";
    document.getElementById("avgDo").textContent = avg.do_trung_binh ?? "--";
    document.getElementById("avgBod").textContent = avg.bod5_trung_binh ?? "--";
    document.getElementById("avgCod").textContent = avg.cod_trung_binh ?? "--";
}

function renderPointTable(rows) {
    const tbody = document.getElementById("pointTableBody");

    if (!rows || rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-3">Chưa có dữ liệu</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => `
        <tr>
            <td><b>${r.ma_mau}</b></td>
            <td>${r.so_lan_do}</td>
            <td>${r.ph_trung_binh ?? "--"}</td>
        </tr>
    `).join("");
}