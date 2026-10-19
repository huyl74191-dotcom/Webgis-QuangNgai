// =====================================================
// 1. Khởi tạo bản đồ tập trung vào Quảng Ngãi
// =====================================================
const map = L.map('map').setView([15.12, 108.80], 10);

// Các biến toàn cục
let boundaryLayer;
let riverLayer;
let monitoringLayer;
let monitoringData = { type: "FeatureCollection", features: [] };
let layerControl;

// Tiện ích: lấy phần tử theo id (không báo lỗi nếu thiếu)
const $ = (id) => document.getElementById(id);

// =====================================================
// Hàm tiện ích: lấy giá trị field trong properties dù key
// có khoảng trắng thừa / khác hoa-thường / khác dấu
// =====================================================
function normalizeKey(str) {
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
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
// 2. Lớp bản đồ nền (chỉ thêm MỘT lớp mặc định, lớp còn lại chọn trong Layer Control)
// =====================================================
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

const cartoLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
});

const baseLayers = {
    "OpenStreetMap": osmLayer,
    "CARTO sáng": cartoLayer
};

// Layer Control tạo sẵn, các lớp dữ liệu sẽ được thêm vào khi tải xong
layerControl = L.control.layers(baseLayers, {}, { collapsed: false, position: "topleft" }).addTo(map);

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

// =====================================================
// Hàm dựng lớp Thủy hệ (sông, suối, kênh, hồ, hồ chứa, đầm...)
// =====================================================
function getWaterStyle(feature) {
    const props = feature.properties || {};
    const waterway = props.waterway;
    const water = props.water;
    const natural = props.natural;
    const landuse = props.landuse;

    if (water === "reservoir" || landuse === "reservoir") {
        return { color: "#0d6efd", weight: 1, fillColor: "#8ecae6", fillOpacity: 0.5 };
    }
    if (natural === "water" && water === "lake") {
        return { color: "#0d6efd", weight: 1, fillColor: "#8ecae6", fillOpacity: 0.5 };
    }
    if (natural === "wetland" || water === "lagoon") {
        return { color: "#0d6efd", weight: 1, fillColor: "#a8dadc", fillOpacity: 0.4 };
    }
    if (waterway === "river") {
        return { color: "#1e90ff", weight: 3, opacity: 0.9 };
    }
    if (waterway === "stream") {
        return { color: "#1e90ff", weight: 1.5, opacity: 0.75 };
    }
    if (waterway === "canal" || waterway === "ditch" || waterway === "drain") {
        return { color: "#3a86ff", weight: 1.5, opacity: 0.8, dashArray: "4,3" };
    }
    return { color: "#1e90ff", weight: 2, opacity: 0.85 };
}

function getWaterTypeLabel(props) {
    if (props.water === "reservoir" || props.landuse === "reservoir") return "Hồ chứa";
    if (props.natural === "water" && props.water === "lake") return "Hồ";
    if (props.natural === "wetland" || props.water === "lagoon") return "Đầm";
    if (props.waterway === "river") return "Sông";
    if (props.waterway === "stream") return "Suối";
    if (props.waterway === "canal") return "Kênh";
    if (props.waterway === "ditch" || props.waterway === "drain") return "Mương/Rãnh thoát nước";
    return "Thủy hệ";
}

function buildRiverLayer(data) {
    return L.geoJSON(data, {
        style: getWaterStyle,
        // Giữ nguyên hình dạng, tránh làm chậm khi dữ liệu lớn
        smoothFactor: 1.5,
        onEachFeature: function (feature, layer) {
            const props = feature.properties || {};
            const loai = getWaterTypeLabel(props);
            const ten = props.name || props["Tên"] || loai;
            layer.bindPopup(`<b>${ten}</b><br>Loại: ${loai}`);
        }
    });
}

// Style cho Layer Control
function styleLayerControl() {
    const style = document.createElement("style");
    style.textContent = `
        .leaflet-control-layers {
            background: rgba(255, 255, 255, 0.85) !important;
            border: 1px solid rgba(0, 0, 0, 0.15);
            border-radius: 8px;
            box-shadow: 0 0 6px rgba(0, 0, 0, 0.25);
            padding: 8px 10px;
        }
        .leaflet-control-layers-list { margin: 0; }
        .leaflet-control-layers label {
            display: flex;
            align-items: center;
            gap: 6px;
            margin: 4px 0;
            font-size: 13px;
            white-space: nowrap;
        }
        .leaflet-control-layers-selector { margin: 0; }
    `;
    document.head.appendChild(style);
}
styleLayerControl();

// Nạp danh sách huyện vào dropdown
function populateDistrictOptions() {
    const districtSelect = $("district");
    if (!districtSelect) return;

    districtSelect.innerHTML = '<option value="all">Tất cả huyện</option>';

    const districts = new Set();
    monitoringData.features.forEach(function (feature) {
        const huyen = getHuyen(feature.properties || {});
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
// Cập nhật thống kê tổng số điểm
// =====================================================
function updateStatistics() {
    const el = $("totalPoint");
    if (el && monitoringLayer) {
        el.textContent = monitoringLayer.getLayers().length;
    }
}

// =====================================================
// 3. Tải song song ranh giới tỉnh, thủy hệ, điểm quan trắc
//    (mỗi lớp độc lập: thiếu 1 file thì các lớp khác vẫn chạy)
// =====================================================
function fetchJSON(url, errMsg) {
    return fetch(url).then(res => {
        if (!res.ok) throw new Error(errMsg + " (HTTP " + res.status + ")");
        return res.json();
    });
}

// ---- Ranh giới tỉnh ----
fetchJSON('/api/ranh-gioi', 'Lỗi khi tải file ranh giới')
    .then(data => {
        boundaryLayer = L.geoJSON(data, {
            style: {
                color: "#0055ff",
                weight: 2,
                fillColor: "#6fbf73",
                fillOpacity: 0.2
            }
        }).addTo(map);

        map.fitBounds(boundaryLayer.getBounds());
        layerControl.addOverlay(boundaryLayer, "Ranh giới tỉnh");
        boundaryLayer.bringToBack();
    })
    .catch(err => console.error("Ranh giới tỉnh:", err));

// ---- Thủy hệ ----
fetchJSON('/api/song-suoi', 'Lỗi khi tải file thủy hệ')
    .then(data => {
        riverLayer = buildRiverLayer(data).addTo(map);
        layerControl.addOverlay(riverLayer, "Thủy hệ (sông, suối, kênh, hồ)");
        // Giữ điểm quan trắc luôn nằm trên cùng
        if (monitoringLayer) monitoringLayer.bringToFront();
        console.log("Đã tải xong lớp thủy hệ");
    })
    .catch(err => console.warn("Thủy hệ:", err));

// ---- Điểm quan trắc ----
fetchJSON('/api/diem-quan-trac', 'Không đọc được file điểm quan trắc')
    .then(data => {
        // Lọc bỏ các dòng không có geometry
        monitoringData = {
            type: "FeatureCollection",
            features: (data.features || []).filter(f => f.geometry)
        };

        monitoringLayer = buildMonitoringLayer(monitoringData).addTo(map);
        monitoringLayer.bringToFront();
        layerControl.addOverlay(monitoringLayer, "Điểm quan trắc");

        populateDistrictOptions();
        updateStatistics();
        console.log("Đã tải xong điểm quan trắc");
    })
    .catch(err => console.error("Điểm quan trắc:", err));

// =====================================================
// 4. Hiển thị tọa độ chuột
// =====================================================
map.on("mousemove", function (e) {
    const el = $("coordinates");
    if (el) {
        el.innerHTML =
            "Kinh độ: " + e.latlng.lng.toFixed(6) +
            " | Vĩ độ: " + e.latlng.lat.toFixed(6);
    }
});

// =====================================================
// 5. Thước tỷ lệ
// =====================================================
L.control.scale({
    position: "bottomleft",
    metric: true,
    imperial: false
}).addTo(map);

// =====================================================
// 6. Chú giải bản đồ
// =====================================================
const legend = L.control({ position: "bottomright" });

legend.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend");
    div.innerHTML = `
        <div style="background:white;padding:10px;border:1px solid #ccc;border-radius:6px;box-shadow:0 0 6px rgba(0,0,0,0.3);font-size:14px;">
            <strong>CHÚ GIẢI</strong>
            <hr style="margin:6px 0;">
            <div style="margin-bottom:6px;">
                <span style="display:inline-block;width:12px;height:12px;background:#ff7800;border:2px solid white;border-radius:50%;margin-right:8px;"></span>
                Điểm quan trắc
            </div>
            <div style="margin-bottom:6px;">
                <span style="display:inline-block;width:20px;border-top:3px solid #0055ff;margin-right:8px;vertical-align:middle;"></span>
                Ranh giới tỉnh
            </div>
            <div style="margin-bottom:6px;">
                <span style="display:inline-block;width:20px;border-top:3px solid #1e90ff;margin-right:8px;vertical-align:middle;"></span>
                Sông / suối / kênh
            </div>
            <div>
                <span style="display:inline-block;width:14px;height:10px;background:#8ecae6;border:1px solid #0d6efd;margin-right:8px;vertical-align:middle;"></span>
                Hồ / hồ chứa / đầm
            </div>
        </div>
    `;
    return div;
};

legend.addTo(map);

// =====================================================
// 7. Tìm kiếm điểm quan trắc theo "Ký hiệu mẫu"
// =====================================================
const searchInput = $("searchPoint");

if (searchInput) {
    searchInput.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" || !monitoringLayer) return;

        const keyword = this.value.trim().toUpperCase();
        let found = false;

        monitoringLayer.eachLayer(function (layer) {
            const maMau = String(getProp(layer.feature.properties, "Ký hiệu mẫu")).toUpperCase();

            if (maMau === keyword) {
                map.setView(layer.getLatLng(), 15);
                layer.openPopup();
                found = true;
            }
        });

        if (!found) {
            alert("Không tìm thấy điểm quan trắc!");
        }
    });
}

// =====================================================
// 8. Lọc theo huyện + loại nguồn nước
// =====================================================
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
    if (!monitoringLayer) return;

    const districtEl = $("district");
    const waterTypeEl = $("waterType");
    const selectedDistrict = districtEl ? districtEl.value : "all";
    const selectedWaterType = waterTypeEl ? waterTypeEl.value : "all";

    const filteredFeatures = monitoringData.features.filter(function (feature) {
        const props = feature.properties || {};

        const matchDistrict =
            selectedDistrict === "all" ||
            getHuyen(props) === selectedDistrict;

        const matchWaterType =
            selectedWaterType === "all" ||
            getWaterType(props) === WATER_TYPE_MAP[selectedWaterType];

        return matchDistrict && matchWaterType;
    });

    // Dùng lại đúng 1 layer để Layer Control không bị lỗi
    monitoringLayer.clearLayers();
    monitoringLayer.addData({
        type: "FeatureCollection",
        features: filteredFeatures
    });

    updateStatistics();

    if (monitoringLayer.getLayers().length > 0) {
        map.fitBounds(monitoringLayer.getBounds(), { padding: [30, 30] });
    }
}

if ($("district")) $("district").addEventListener("change", applyFilters);
if ($("waterType")) $("waterType").addEventListener("change", applyFilters);

// =====================================================
// 9. Đặt lại bộ lọc
// =====================================================
const btnReset = $("btnReset");

if (btnReset) {
    btnReset.addEventListener("click", function () {
        if ($("district")) $("district").value = "all";
        if ($("waterType")) $("waterType").value = "all";
        if (searchInput) searchInput.value = "";

        applyFilters();

        if (boundaryLayer) {
            map.fitBounds(boundaryLayer.getBounds());
        }
    });
}
