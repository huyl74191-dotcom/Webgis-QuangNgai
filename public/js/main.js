// =====================================================
// BẢN ĐỒ TRANG CHỦ
// =====================================================

// Khởi tạo bản đồ
var map = L.map('map').setView([15.1205, 108.7923], 9);

// Bản đồ nền OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

// ---- Ranh giới tỉnh Quảng Ngãi ----
fetch('data/geojson/quangngai.geojson')
    .then(res => res.json())
    .then(data => {
        L.geoJSON(data, {
            style: {
                color: "#0800ff",
                weight: 2,
                fillOpacity: 0.1
            }
        }).addTo(map);
    })
    .catch(err => console.error(err));

// ---- Điểm quan trắc ----
fetch('data/geojson/DiemQuanTrac.geojson')
    .then(res => res.json())
    .then(data => {
        // Bỏ các dòng dữ liệu rỗng (không geometry) trong file gốc
        const features = (data.features || []).filter(f => f.geometry);

        L.geoJSON({ type: "FeatureCollection", features: features }, {
            pointToLayer: function (feature, latlng) {
                return L.circleMarker(latlng, {
                    radius: 6,
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
        }).addTo(map);
    })
    .catch(err => console.error(err));

// ---- Hiển thị tọa độ kinh độ / vĩ độ khi di chuyển chuột ----
map.on("mousemove", function (e) {
    document.getElementById("coordinates").innerHTML =
        "Kinh độ: " + e.latlng.lng.toFixed(6) +
        " | Vĩ độ: " + e.latlng.lat.toFixed(6);
});

map.on("mouseout", function () {
    document.getElementById("coordinates").innerHTML = "Kinh độ: -- | Vĩ độ: --";
});
