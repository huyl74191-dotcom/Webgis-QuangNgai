// =====================================================
// 1. Khởi tạo bản đồ tập trung vào Quảng Ngãi
// =====================================================
const map = L.map('map').setView([15.12, 108.80], 10);

// Các biến toàn cục
let boundaryLayer;
let monitoringLayer;
let monitoringData;
let layerControl;

// =====================================================
// Hàm tiện ích: lấy giá trị field trong properties dù key
// có khoảng trắng thừa / khác hoa-thường / khác dấu
// (ví dụ dữ liệu đang lưu key là "Huyện " chứ không phải "Huyện")
// =====================================================
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

function getHuyen(properties) {
    return getProp(properties, "Huyện");
}

// =====================================================
// 2. Thêm lớp bản đồ nền OpenStreetMap
// =====================================================
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// =====================================================
// Hàm dựng lớp điểm quan trắc từ dữ liệu GeoJSON
// =====================================================
function buildMonitoringLayer(data) {
    return L.geoJSON(data, {
        pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, {
                radius: 7,
                fillColor: "#ff7800",
                color: "#ffffff",
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            });
        },
        onEachFeature: function (feature, layer) {
            let html = "";
            for (let key in feature.properties) {
                html += `<b>${key}</b>: ${feature.properties[key]}<br>`;
            }
            layer.bindPopup(html);
        }
    });
}

// Style cho Layer Control: nền trong suốt + căn lề checkbox/label thẳng hàng
function styleLayerControl() {
    const style = document.createElement("style");
    style.textContent = `
        .leaflet-control-layers {
            background: rgba(255, 255, 255, 0.75) !important;
            backdrop-filter: blur(2px);
            border: 1px solid rgba(0, 0, 0, 0.15);
            border-radius: 8px;
            box-shadow: 0 0 6px rgba(0, 0, 0, 0.25);
            padding: 8px 10px;
        }
        .leaflet-control-layers-list {
            margin: 0;
        }
        .leaflet-control-layers label {
            display: flex;
            align-items: center;
            gap: 6px;
            margin: 4px 0;
            font-size: 13px;
            white-space: nowrap;
        }
        .leaflet-control-layers-selector {
            margin: 0;
        }
    `;
    document.head.appendChild(style);
}

// Nạp danh sách huyện vào dropdown, dựa trên toàn bộ dữ liệu gốc
function populateDistrictOptions() {
    const districtSelect = document.getElementById("district");
    districtSelect.innerHTML = '<option value="all">Tất cả huyện</option>';

    const districts = new Set();
    monitoringData.features.forEach(function (feature) {
        const huyen = getHuyen(feature.properties);
        if (huyen) districts.add(huyen);
    });

    [...districts].sort().forEach(function (district) {
        const option = document.createElement("option");
        option.value = district;
        option.textContent = district;
        districtSelect.appendChild(option);
    });
}

// =====================================================
// 3 & 4. Đọc song song file ranh giới tỉnh và file điểm quan trắc
// =====================================================
Promise.all([
    fetch('/api/ranh-gioi')
        .then(res => {
            if (!res.ok) throw new Error('Lỗi khi tải file ranh giới!');
            return res.json();
        }),
    fetch('/api/diem-quan-trac')
        .then(res => {
            if (!res.ok) throw new Error("Không đọc được file GeoJSON!");
            return res.json();
        })
])
.then(([boundaryData, pointsData]) => {

    // ---- Ranh giới tỉnh ----
    boundaryLayer = L.geoJSON(boundaryData, {
        style: {
            color: "#0055ff",
            weight: 2,
            fillColor: "#6fbf73",
            fillOpacity: 0.2
        }
    }).addTo(map);

    map.fitBounds(boundaryLayer.getBounds());

    // ---- Điểm quan trắc ----
    // Lọc bỏ các dòng dữ liệu rỗng (không có geometry/thuộc tính) trong file gốc
    monitoringData = {
        type: "FeatureCollection",
        features: (pointsData.features || []).filter(f => f.geometry)
    };
    monitoringLayer = buildMonitoringLayer(monitoringData).addTo(map);

    // ---- Dropdown huyện ----
    populateDistrictOptions();

    // ---- Layer control (bật/tắt lớp) ----
    layerControl = L.control.layers(null, {
        "Ranh giới tỉnh": boundaryLayer,
        "Điểm quan trắc": monitoringLayer
    }, { collapsed: false, position: "topleft" }).addTo(map);

    styleLayerControl();

    // ---- Thống kê ----
    updateStatistics();

    console.log("Đã load xong dữ liệu bản đồ!");
})
.catch(err => console.error(err));

// =====================================================
// 5. Hiển thị tọa độ chuột
// =====================================================
map.on("mousemove", function (e) {
    document.getElementById("coordinates").innerHTML =
        "Kinh độ: " + e.latlng.lng.toFixed(6) +
        " | Vĩ độ: " + e.latlng.lat.toFixed(6);
});

// =====================================================
// 6. Thêm thước tỷ lệ (Scale Bar)
// =====================================================
L.control.scale({
    position: "bottomleft",
    metric: true,
    imperial: false
}).addTo(map);

// =====================================================
// 7. Thêm chú giải bản đồ (Legend)
// =====================================================
const legend = L.control({ position: "bottomright" });

legend.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend");
    div.innerHTML = `
        <div style="
            background: white;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 6px;
            box-shadow: 0 0 6px rgba(0,0,0,0.3);
            font-size: 14px;
        ">
            <strong>CHÚ GIẢI</strong>
            <hr style="margin:6px 0;">
            <div style="margin-bottom:6px;">
                <span style="
                    display:inline-block;
                    width:12px;
                    height:12px;
                    background:#ff7800;
                    border:2px solid white;
                    border-radius:50%;
                    margin-right:8px;
                "></span>
                Điểm quan trắc
            </div>
            <div>
                <span style="
                    display:inline-block;
                    width:20px;
                    border-top:3px solid #0055ff;
                    margin-right:8px;
                    vertical-align:middle;
                "></span>
                Ranh giới tỉnh
            </div>
        </div>
    `;
    return div;
};

legend.addTo(map);

// =====================================================
// 8. Tìm kiếm điểm quan trắc
// =====================================================
const searchInput = document.getElementById("searchPoint");

searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
        const keyword = this.value.trim().toUpperCase();
        let found = false;

        monitoringLayer.eachLayer(function (layer) {
            const properties = layer.feature.properties;
            const maMau = String(properties["Ký hiệu mẫu"]).toUpperCase();

            if (maMau === keyword) {
                map.setView(layer.getLatLng(), 15);
                layer.openPopup();
                found = true;
            }
        });

        if (!found) {
            alert("Không tìm thấy điểm quan trắc!");
        }
    }
});

// =====================================================
// 9. Lọc theo huyện + Loại nguồn nước (gộp chung 1 hàm lọc)
// =====================================================

// Bảng ánh xạ value của <select id="waterType"> sang giá trị thật trong dữ liệu
const WATER_TYPE_MAP = {
    song: "Sông",
    suoi: "Suối",
    ho: "Hồ chứa",
    kenh: "Kênh",
    dam: "Đầm",
    cuabien: "Cửa biển"
};

function getWaterType(properties) {
    return getProp(properties, "Loại nguồn nước");
}

function applyFilters() {
    const selectedDistrict = document.getElementById("district").value;
    const selectedWaterType = document.getElementById("waterType").value;

    // Lọc dữ liệu gốc theo điều kiện hiện tại
    const filteredFeatures = monitoringData.features.filter(function (feature) {
        const matchDistrict =
            selectedDistrict === "all" ||
            getHuyen(feature.properties) === selectedDistrict;

        const matchWaterType =
            selectedWaterType === "all" ||
            getWaterType(feature.properties) === WATER_TYPE_MAP[selectedWaterType];

        return matchDistrict && matchWaterType;
    });

    // Cập nhật lại lớp điểm (dùng lại đúng 1 layer để layer control không bị lỗi)
    monitoringLayer.clearLayers();
    monitoringLayer.addData({
        type: "FeatureCollection",
        features: filteredFeatures
    });

    updateStatistics();

    // Nếu còn điểm thì zoom tới khu vực đó, không thì giữ nguyên view
    if (monitoringLayer.getLayers().length > 0) {
        map.fitBounds(monitoringLayer.getBounds(), { padding: [30, 30] });
    }
}

// Khi đổi huyện hoặc loại nguồn nước -> lọc lại
document.getElementById("district").addEventListener("change", applyFilters);
document.getElementById("waterType").addEventListener("change", applyFilters);

// =====================================================
// 10. Đặt lại bộ lọc
// =====================================================
const btnReset = document.getElementById("btnReset");

if (btnReset) {
    btnReset.addEventListener("click", function () {
        document.getElementById("district").value = "all";
        document.getElementById("waterType").value = "all";
        searchInput.value = "";

        applyFilters();

        // Đưa bản đồ về lại toàn tỉnh
        if (boundaryLayer) {
            map.fitBounds(boundaryLayer.getBounds());
        }
    });
}

// =====================================================
// Cập nhật thống kê tổng số điểm
// =====================================================
function updateStatistics() {
    document.getElementById("totalPoint").textContent =
        monitoringLayer.getLayers().length;
}
