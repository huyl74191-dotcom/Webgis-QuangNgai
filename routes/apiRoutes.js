// =====================================================
// API ROUTES — Toàn bộ API backend cho hệ thống WebGIS
// =====================================================

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const pool = require('../database/db');

// =====================================================
// 1. ĐĂNG NHẬP / ĐĂNG XUẤT
// =====================================================

// POST /api/dang-nhap
router.post('/dang-nhap', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
    }

    try {
        const result = await pool.query(
            'SELECT id, username, password_hash, full_name, role FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Tài khoản không tồn tại' });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.status(401).json({ success: false, error: 'Sai mật khẩu' });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            role: user.role
        };

        res.json({ success: true, user: req.session.user });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/dang-xuat
router.post('/dang-xuat', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Không đăng xuất được' });
        }
        res.json({ success: true });
    });
});

// GET /api/kiem-tra-dang-nhap
router.get('/kiem-tra-dang-nhap', (req, res) => {
    if (req.session.user) {
        res.json({ success: true, loggedIn: true, user: req.session.user });
    } else {
        res.json({ success: true, loggedIn: false });
    }
});

// =====================================================
// 2. TRUY VẤN DỮ LIỆU
// =====================================================

router.get('/chi-so-quan-trac', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, ma_mau, nam, ngay_quan_trac, dot, ph, do_mgl, bod5, cod, tss, coliform,
                    amoni, clorua, fe, no2, tong_dau, ecoli, toc, tong_p, tong_n, ghi_chu
             FROM chi_so_quan_trac
             ORDER BY nam DESC, dot ASC, ma_mau ASC`
        );
        res.json({ success: true, total: result.rows.length, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// 3. LỌC DỮ LIỆU
// GET /api/loc?ma_mau=NM1&tu_ngay=2026-01-01&den_ngay=2026-12-31
// =====================================================

router.get('/loc', async (req, res) => {
    const { ma_mau, tu_ngay, den_ngay, dot, nam } = req.query;

    let sql = 'SELECT * FROM chi_so_quan_trac WHERE 1=1';
    const params = [];

    if (ma_mau) {
        params.push(ma_mau);
        sql += ` AND ma_mau = $${params.length}`;
    }
    if (nam) {
        params.push(nam);
        sql += ` AND nam = $${params.length}`;
    }
    if (tu_ngay) {
        params.push(tu_ngay);
        sql += ` AND ngay_quan_trac >= $${params.length}`;
    }
    if (den_ngay) {
        params.push(den_ngay);
        sql += ` AND ngay_quan_trac <= $${params.length}`;
    }
    if (dot) {
        params.push(dot);
        sql += ` AND dot = $${params.length}`;
    }

    sql += ' ORDER BY nam DESC, dot ASC, ma_mau ASC';

    try {
        const result = await pool.query(sql, params);
        res.json({ success: true, total: result.rows.length, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// 4. THỐNG KÊ
// =====================================================

router.get('/thong-ke', async (req, res) => {
    try {
        const tongDiem = await pool.query(
            'SELECT COUNT(DISTINCT ma_mau) AS so_diem FROM chi_so_quan_trac'
        );

        const trungBinh = await pool.query(
            `SELECT
                ROUND(AVG(ph)::numeric, 2)        AS ph_trung_binh,
                ROUND(AVG(do_mgl)::numeric, 2)     AS do_trung_binh,
                ROUND(AVG(bod5)::numeric, 2)       AS bod5_trung_binh,
                ROUND(AVG(cod)::numeric, 2)        AS cod_trung_binh,
                ROUND(AVG(coliform)::numeric, 0)   AS coliform_trung_binh
             FROM chi_so_quan_trac`
        );

        const theoDiem = await pool.query(
            `SELECT ma_mau, COUNT(*) AS so_lan_do,
                    ROUND(AVG(ph)::numeric, 2) AS ph_trung_binh
             FROM chi_so_quan_trac
             GROUP BY ma_mau
             ORDER BY ma_mau`
        );

        res.json({
            success: true,
            tong_so_diem_co_du_lieu: parseInt(tongDiem.rows[0].so_diem, 10),
            trung_binh_toan_tinh: trungBinh.rows[0],
            theo_diem: theoDiem.rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// 5. API BẢN ĐỒ — trả GeoJSON (ranh giới + điểm quan trắc)
// =====================================================

router.get('/ranh-gioi', (req, res) => {
    const filePath = path.join(__dirname, '..', 'public', 'data', 'geojson', 'quangngai.geojson');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Không đọc được file ranh giới' });
        }
        res.type('application/json').send(data);
    });
});

router.get('/diem-quan-trac', (req, res) => {
    const filePath = path.join(__dirname, '..', 'public', 'data', 'geojson', 'DiemQuanTrac.geojson');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Không đọc được file điểm quan trắc' });
        }

        const geojson = JSON.parse(data);
        geojson.features = (geojson.features || []).filter(f => f.geometry);

        res.json(geojson);
    });
});

module.exports = router;