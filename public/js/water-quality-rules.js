// QUY TẮC ĐÁNH GIÁ CHẤT LƯỢNG NƯỚC - DÙNG CHUNG CHO MỌI TRANG
// Căn cứ: QCVN 08:2023/BTNMT 
//   - Bảng 1: thông số ảnh hưởng tới sức khỏe con người
//   - Bảng 2: sông, suối, kênh, mương, khe, rạch (mức A/B/C/D)
//   - Bảng 3: hồ, ao, đầm (mức A/B/C/D)
// Chỉ sửa ngưỡng và mục tiêu chất lượng tại file này.
// =====================================================
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.WQ = factory();
    }
})(typeof self !== "undefined" ? self : this, function () {

    const STANDARD_NAME = "QCVN 08:2023/BTNMT";
    const LEVELS = ["A", "B", "C", "D"];

    // -------------------------------------------------
    // MỤC TIÊU CHẤT LƯỢNG THEO LOẠI NGUỒN NƯỚC
    // Mẫu bị xếp "vượt ngưỡng" khi có thông số xấu hơn mức mục tiêu.
    // Đây là lựa chọn cần lập luận trong báo cáo (xem mục 2.1 của QCVN:
    // mức B dùng được cho sản xuất nông nghiệp, công nghiệp sau xử lý).
    // -------------------------------------------------
    const TARGET_LEVEL = {
        song: "B", suoi: "B", kenh: "B",
        ho_chua: "B", dam: "B",
        cua_bien: "B"
    };

    // table: 2 = Bảng 2 (sông/suối/kênh), 3 = Bảng 3 (hồ/đầm)
    // saline: vùng nhiễm mặn -> dùng TOC thay COD, bỏ qua Clorua
    // outOfScope: loại nước không nằm trong phạm vi QCVN 08:2023
    const TYPE_INFO = {
        song:     { label: "Sông",     table: 2 },
        suoi:     { label: "Suối",     table: 2 },
        kenh:     { label: "Kênh",     table: 2 },
        ho_chua:  { label: "Hồ chứa",  table: 3 },
        dam:      { label: "Đầm",      table: 3 },
        cua_bien: { label: "Cửa biển", table: 2, saline: true, outOfScope: true }
    };

    const LABELS = {
        ph: "pH", bod5: "BOD5", cod: "COD", toc: "TOC", tss: "TSS", do_mgl: "DO",
        tong_p: "Tổng P", tong_n: "Tổng N", coliform: "Coliform",
        no2: "Nitrit (NO2-)", amoni: "Amoni", clorua: "Clorua",
        fe: "Sắt (Fe)", tong_dau: "Tổng dầu mỡ", ecoli: "E.coli"
    };

    // Bảng 1: giá trị giới hạn tối đa (chỉ các thông số có trong CSDL)
    const HEALTH = {
        no2:      { max: 0.05 },
        amoni:    { max: 0.3 },
        clorua:   { max: 250 },
        fe:       { max: 0.5 },
        tong_dau: { max: 5 },
        ecoli:    { max: 20 }
    };

    // Bảng 2 / Bảng 3: lim = [giới hạn mức A, mức B, mức C]; vượt mức C là mức D
    function aquaticSpecs(info) {
        const lake = info.table === 3;
        const specs = {
            ph:       { type: "ph" },
            bod5:     { type: "max", lim: [4, 6, 10] },
            // TSS: mức C là ">100 (hồ: >15) và không có rác nổi", CSDL không có
            // thông tin rác nổi nên không phân biệt được mức D (để Infinity)
            tss:      { type: "max", lim: lake ? [5, 15, Infinity] : [25, 100, Infinity] },
            do_mgl:   { type: "min", lim: [6, 5, 4] },
            tong_p:   { type: "max", lim: [0.1, 0.3, 0.5] },
            tong_n:   { type: "max", lim: [0.6, 1.5, 2] },
            coliform: { type: "max", lim: [1000, 5000, 7500] }
        };
        // Vùng nhiễm mặn phải dùng TOC thay COD (mục 2.3 QCVN 08:2023)
        if (info.saline) specs.toc = { type: "max", lim: [4, 6, 8] };
        else specs.cod = { type: "max", lim: [10, 15, 20] };
        return specs;
    }

    // Trả về chỉ số mức: 0=A, 1=B, 2=C, 3=D
    function levelOf(spec, v) {
        if (spec.type === "ph") {
            if (v >= 6.5 && v <= 8.5) return 0;
            if (v >= 6 && v <= 8.5) return 1;
            return 3;
        }
        for (let i = 0; i < 3; i++) {
            if (spec.type === "min" ? v >= spec.lim[i] : v <= spec.lim[i]) return i;
        }
        return 3;
    }

    function limitText(spec, idx) {
        if (spec.type === "ph") return idx === 0 ? "6,5–8,5" : "6,0–8,5";
        const l = spec.lim[idx];
        if (!isFinite(l)) return "không giới hạn";
        return (spec.type === "min" ? "≥ " : "≤ ") + l;
    }

    // -------------------------------------------------
    // Nhận diện loại nguồn nước từ bản ghi
    // (thử nhiều tên cột; sửa danh sách này nếu CSDL dùng tên khác)
    // -------------------------------------------------
    function normalizeType(raw) {
        if (!raw) return null;
        const s = String(raw).toLowerCase().trim()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
        if (s.indexOf("cua bien") >= 0 || s.indexOf("cua_bien") >= 0) return "cua_bien";
        if (s.indexOf("ho") === 0) return "ho_chua";
        if (s.indexOf("dam") === 0) return "dam";
        if (s.indexOf("kenh") === 0) return "kenh";
        if (s.indexOf("suoi") === 0) return "suoi";
        if (s.indexOf("song") === 0) return "song";
        return null;
    }

    function getSourceType(record) {
        const keys = ["loai_nguon_nuoc", "loai_nguon", "loai_nuoc", "loai", "loai_hinh"];
        for (let i = 0; i < keys.length; i++) {
            const t = normalizeType(record[keys[i]]);
            if (t) return t;
        }
        return null;
    }

    // -------------------------------------------------
    // Đánh giá 1 bản ghi
    // -------------------------------------------------
    function evaluateRecord(record) {
        const type = getSourceType(record);
        const key = type || "song";                 // không rõ loại -> tạm dùng Bảng 2
        const info = TYPE_INFO[key];
        const target = LEVELS.indexOf(TARGET_LEVEL[key]);

        const violations = [];
        const evaluated = [];
        let worst = -1;
        let healthFail = false;

        Object.keys(HEALTH).forEach(function (k) {
            if (info.saline && k === "clorua") return;   // nước mặn: Cl- không phản ánh ô nhiễm
            const v = parseFloat(record[k]);
            if (isNaN(v)) return;
            evaluated.push(k);
            if (v > HEALTH[k].max) {
                healthFail = true;
                violations.push({
                    key: k, label: LABELS[k], value: v, kind: "health",
                    text: `${LABELS[k]} = ${v} (> ${HEALTH[k].max}, Bảng 1)`
                });
            }
        });

        const specs = aquaticSpecs(info);
        Object.keys(specs).forEach(function (k) {
            const v = parseFloat(record[k]);
            if (isNaN(v)) return;
            const idx = levelOf(specs[k], v);
            evaluated.push(k);
            if (idx > worst) worst = idx;
            if (idx > target) {
                violations.push({
                    key: k, label: LABELS[k], value: v, kind: "aquatic", level: LEVELS[idx],
                    text: `${LABELS[k]} = ${v} → Mức ${LEVELS[idx]} (mức ${LEVELS[target]}: ${limitText(specs[k], target)})`
                });
            }
        });

        return {
            violations,
            evaluated,
            measuredCount: evaluated.length,
            sourceType: type,
            typeKnown: !!type,
            outOfScope: !!info.outOfScope,
            worstLevel: worst >= 0 ? LEVELS[worst] : null,
            healthFail,
            isExceeded: violations.length > 0
        };
    }

    // -------------------------------------------------
    // Tổng hợp: 3 loại số liệu tách riêng
    //  (1) totalViolations  : số lượt chỉ tiêu vượt
    //  (2) exceededSamples  : số mẫu có ít nhất 1 chỉ tiêu vượt
    //  (3) byParameter[k].rate : tỷ lệ vượt của từng chỉ tiêu
    // kèm: số mẫu theo mức A/B/C/D và số mẫu không đạt Bảng 1
    // -------------------------------------------------
    function summarize(records) {
        const list = records || [];
        const byParameter = {};
        Object.keys(LABELS).forEach(function (k) {
            byParameter[k] = { label: LABELS[k], measured: 0, exceeded: 0, rate: 0 };
        });

        const levelCounts = { A: 0, B: 0, C: 0, D: 0, none: 0 };
        let exceededSamples = 0, totalViolations = 0;
        let healthFailSamples = 0, unknownTypeSamples = 0, outOfScopeSamples = 0;

        list.forEach(function (r) {
            const res = evaluateRecord(r);
            res.evaluated.forEach(function (k) { byParameter[k].measured++; });
            res.violations.forEach(function (v) { byParameter[v.key].exceeded++; totalViolations++; });

            if (res.isExceeded) exceededSamples++;
            if (res.healthFail) healthFailSamples++;
            if (!res.typeKnown) unknownTypeSamples++;
            if (res.outOfScope) outOfScopeSamples++;
            levelCounts[res.worstLevel || "none"]++;
        });

        Object.keys(byParameter).forEach(function (k) {
            const p = byParameter[k];
            p.rate = p.measured > 0 ? (p.exceeded / p.measured) * 100 : 0;
        });

        const total = list.length;
        const exceededRate = total > 0 ? (exceededSamples / total) * 100 : 0;

        return {
            totalSamples: total,
            exceededSamples,
            passedSamples: total - exceededSamples,
            exceededRate,
            passedRate: total > 0 ? 100 - exceededRate : 0,
            totalViolations,
            byParameter,
            levelCounts,
            healthFailSamples,
            unknownTypeSamples,
            outOfScopeSamples
        };
    }

    function fmtPercent(n) {
        return n.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
    }

    return {
        STANDARD_NAME, LEVELS, TARGET_LEVEL, TYPE_INFO, HEALTH, LABELS,
        normalizeType, getSourceType, evaluateRecord, summarize, fmtPercent
    };
});