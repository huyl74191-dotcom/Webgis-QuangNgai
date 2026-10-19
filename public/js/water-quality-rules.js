// QUY TẮC ĐÁNH GIÁ CHẤT LƯỢNG NƯỚC - DÙNG CHUNG CHO MỌI TRANG
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.WQ = factory();
    }
})(typeof self !== "undefined" ? self : this, function () {

    // Ngưỡng QCVN 08-MT:2015/BTNMT, cột B1
    const RULES = {
        ph:        { label: "pH",            min: 5.5, max: 9 },
        bod5:      { label: "BOD5",          max: 15 },
        cod:       { label: "COD",           max: 30 },
        do_mgl:    { label: "DO",            min: 4 },
        tss:       { label: "TSS",           max: 50 },
        coliform:  { label: "Coliform",      max: 7500 },
        amoni:     { label: "Amoni",         max: 0.9 },
        clorua:    { label: "Clorua",        max: 350 },
        no2:       { label: "Nitrit (NO2-)", max: 0.05 },
        fe:        { label: "Sắt (Fe)",      max: 1.5 },
        tong_dau:  { label: "Tổng dầu mỡ",   max: 1 },
        ecoli:     { label: "E.coli",        max: 100 }
    };

    function evaluateRecord(record) {
        const violations = [];
        let measuredCount = 0;

        Object.keys(RULES).forEach(function (key) {
            const rule = RULES[key];
            const value = parseFloat(record[key]);
            if (isNaN(value)) return;
            measuredCount++;

            if (rule.min !== undefined && value < rule.min) {
                violations.push({ key, label: rule.label, value,
                    text: `${rule.label} = ${value} (< ${rule.min})` });
            }
            if (rule.max !== undefined && value > rule.max) {
                violations.push({ key, label: rule.label, value,
                    text: `${rule.label} = ${value} (> ${rule.max})` });
            }
        });

        return { violations, measuredCount, isExceeded: violations.length > 0 };
    }

    function summarize(records) {
        const byParameter = {};
        Object.keys(RULES).forEach(function (key) {
            byParameter[key] = { label: RULES[key].label, measured: 0, exceeded: 0, rate: 0 };
        });

        let exceededSamples = 0;
        let totalViolations = 0;

        (records || []).forEach(function (r) {
            const result = evaluateRecord(r);

            Object.keys(RULES).forEach(function (key) {
                if (!isNaN(parseFloat(r[key]))) byParameter[key].measured++;
            });

            if (result.isExceeded) exceededSamples++;
            result.violations.forEach(function (v) {
                byParameter[v.key].exceeded++;
                totalViolations++;
            });
        });

        const totalSamples = (records || []).length;

        Object.keys(byParameter).forEach(function (key) {
            const p = byParameter[key];
            p.rate = p.measured > 0 ? (p.exceeded / p.measured) * 100 : 0;
        });

        const exceededRate = totalSamples > 0 ? (exceededSamples / totalSamples) * 100 : 0;

        return {
            totalSamples,
            exceededSamples,
            passedSamples: totalSamples - exceededSamples,
            exceededRate,
            passedRate: totalSamples > 0 ? 100 - exceededRate : 0,
            totalViolations,
            byParameter
        };
    }

    function fmtPercent(n) {
        return n.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
    }

    return { RULES, evaluateRecord, summarize, fmtPercent };
});