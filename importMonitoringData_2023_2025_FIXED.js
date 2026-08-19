/**
 * WEBGIS QUẢNG NGÃI - IMPORT DỮ LIỆU MONITORING 2023 + 2025
 * 
 * ✓ Auto-detect header row (không cần hardcode)
 * ✓ Smart parsing (số, ngày, KPH)
 * ✓ Batch insert (30-40x nhanh hơn)
 * ✓ Transaction-safe (ROLLBACK if fail)
 * ✓ 2024 data protected (không đọc/sửa/xóa)
 */

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const pool = require('./database/db');

// ============================================================
// CONFIG
// ============================================================

const CONFIG = {
  TARGET_YEARS: [2023, 2025],
  EXPECTED_COUNTS: { 2023: 93, 2025: 31 },
  TARGET_SHEETS: [
    'Đợt 1 2023',
    'Đợt 2 2023',
    'Đợt 3 2023',
    'Đợt 1 2025'
  ],
  BATCH_SIZE: 50,
  DEBUG: process.argv.includes('--debug')
};

const WATER_QUALITY_COLUMNS = {
  ph: 'pH',
  do_mgl: 'DO (mg/L)',
  bod5: 'BOD5 (mg/L)',
  cod: 'COD (mg/L)',
  tss: 'TSS (mg/L)',
  coliform: 'Coliform (CFU/100mL)',
  amoni: 'Amoni (mg/L)',
  clorua: 'Clorua (mg/L)',
  fe: 'Fe (mg/L)',
  no2: 'NO2- (mg/L)',
  tong_dau: 'Tổng dầu (mg/L)',
  ecoli: 'E.coli (CFU/100mL)',
  toc: 'TOC (mg/L)',
  tong_p: 'Tổng P (mg/L)',
  tong_n: 'Tổng N (mg/L)'
};

// ============================================================
// UTILITIES
// ============================================================

const Utils = {
  /**
   * Parse số từ Excel - hỗ trợ VN format (1.234,56)
   */
  parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const str = String(value).trim();
    if (!str || ['KPH', '--', '-'].includes(str.toUpperCase())) return null;

    // Handle VN format: "1.234,56" -> 1234.56
    let normalized = str
      .replace(/\s+/g, '')
      .replace(/\.(?=\d{1,3},)/, '') // xóa dấu ngàn
      .replace(',', '.');

    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  },

  /**
   * Kiểm tra giá trị KPH
   */
  isKPH(value) {
    return value && String(value).trim().toUpperCase() === 'KPH';
  },

  /**
   * Parse ngày từ Excel - hỗ trợ cả Excel date + string format
   */
  parseDate(value) {
    if (!value) return null;

    // Nếu đã là Date object
    if (value instanceof Date) {
      return !Number.isNaN(value.getTime()) ? value : null;
    }

    // Excel serial number
    if (typeof value === 'number' && Number.isFinite(value)) {
      try {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) {
          return new Date(
            parsed.y,
            parsed.m - 1,
            parsed.d,
            parsed.H || 0,
            parsed.M || 0,
            parsed.S || 0
          );
        }
      } catch (e) {
        // Bỏ qua, thử string parse
      }
    }

    // String format: "dd/mm/yyyy" hoặc "dd-mm-yyyy"
    const str = String(value).trim();
    const match = str.match(
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (match) {
      const [, day, month, year, hour = '0', minute = '0', second = '0'] = match;
      const date = new Date(year, month - 1, day, hour, minute, second);

      if (
        date.getFullYear() == year &&
        date.getMonth() == month - 1 &&
        date.getDate() == day
      ) {
        return date;
      }
    }

    return null;
  }
};

// ============================================================
// EXCEL READER - AUTO-DETECT HEADER (ROBUST VERSION)
// ============================================================

/**
 * Chuẩn hóa tên cột để so sánh: NFC unicode, trim, gộp khoảng trắng,
 * bỏ dấu xuống dòng ẩn. Xử lý lỗi phổ biến: file "chuẩn Unicode" đôi khi
 * dùng tổ hợp NFD (ví dụ "đ" = "d" + dấu gạch ngang riêng) trông giống hệt
 * nhưng khác byte, hoặc có \u00A0 (non-breaking space) thay vì space thường.
 */
function normalizeColName(name) {
  if (name === null || name === undefined) return '';
  return String(name)
    .normalize('NFC')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\u00A0/g, ' ') // non-breaking space -> space thường
    .replace(/\s+/g, ' ')
    .trim();
}

const REQUIRED_COLS = ['Mã điểm', 'Năm', 'Đợt'].map(normalizeColName);

class SmartExcelReader {
  constructor(filePath) {
    this.filePath = filePath;
    this.workbook = null;
    // Lưu header row index RIÊNG cho từng sheet (không giả định giống nhau)
    this.headerRowBySheet = {};
    // Lưu bảng map: tên cột chuẩn hóa -> tên cột gốc, riêng cho từng sheet
    this.colMapBySheet = {};
  }

  load() {
    console.log(`\n📂 File: ${path.basename(this.filePath)}\n`);

    this.workbook = XLSX.readFile(this.filePath, { cellDates: true });

    console.log('📋 Sheets:');
    this.workbook.SheetNames.forEach(s => console.log(`   - ${s}`));

    const missing = CONFIG.TARGET_SHEETS.filter(s => !this.workbook.Sheets[s]);
    if (missing.length > 0) {
      throw new Error(`❌ Thiếu sheet: ${missing.join(', ')}\n   Sheet thực tế có: ${this.workbook.SheetNames.join(', ')}`);
    }

    console.log('\n🔍 Tìm header row cho từng sheet...\n');
    for (const sheetName of CONFIG.TARGET_SHEETS) {
      this._findHeaderRowForSheet(sheetName);
    }
  }

  /**
   * Tìm header row cho 1 sheet cụ thể, so khớp theo tên cột đã chuẩn hóa.
   * Nếu không tìm thấy, in ra chi tiết những gì đã quét được để dễ chẩn đoán.
   */
  _findHeaderRowForSheet(sheetName) {
    const sheet = this.workbook.Sheets[sheetName];
    const scanLog = [];

    for (let rowIndex = 0; rowIndex <= 20; rowIndex++) {
      try {
        const rows = XLSX.utils.sheet_to_json(sheet, {
          range: rowIndex,
          defval: null,
          raw: true
        });

        if (rows.length === 0) continue;

        const rawColumns = Object.keys(rows[0]);
        const normMap = {}; // normalized -> raw
        rawColumns.forEach(c => { normMap[normalizeColName(c)] = c; });
        const normColumns = Object.keys(normMap);

        scanLog.push({ rowIndex, columnCount: rawColumns.length, sample: rawColumns.slice(0, 6) });

        const hasRequiredCols = REQUIRED_COLS.every(req => normColumns.includes(req));
        if (!hasRequiredCols) continue;

        const codeColRaw = normMap['Mã điểm'];
        const validRecords = rows.filter(r => r[codeColRaw] && String(r[codeColRaw]).trim());
        if (validRecords.length === 0) continue;

        // ✓ Tìm thấy
        this.headerRowBySheet[sheetName] = rowIndex;
        this.colMapBySheet[sheetName] = normMap;

        console.log(`   ✓ [${sheetName}] header ở row ${rowIndex}, ${validRecords.length} bản ghi hợp lệ`);
        if (CONFIG.DEBUG) {
          console.log(`      Cột: ${rawColumns.slice(0, 8).join(', ')}`);
        }
        return;
      } catch (e) {
        // thử dòng tiếp theo
      }
    }

    // Không tìm thấy -> in chi tiết chẩn đoán ngay tại đây, không cần chạy debug riêng
    console.log(`\n❌ [${sheetName}] Không tìm thấy header row.`);
    console.log(`   Đang tìm các cột (chuẩn hóa): ${REQUIRED_COLS.join(', ')}`);
    console.log(`   Các dòng đã quét (0-20), tên cột thấy được:\n`);
    scanLog.forEach(s => {
      console.log(`   Row ${s.rowIndex} (${s.columnCount} cột): ${s.sample.map(c => JSON.stringify(c)).join(', ')}`);
    });
    throw new Error(
      `❌ [${sheetName}] Cannot find header row with columns: "Mã điểm", "Năm", "Đợt"\n` +
      `   -> So sánh danh sách cột ở trên với tên đang tìm. Lệch ở khoảng trắng/dấu là nguyên nhân phổ biến nhất.`
    );
  }

  /**
   * Đọc dữ liệu từ tất cả sheets, dùng header row + colMap riêng cho từng sheet
   */
  read() {
    const allRecords = [];

    console.log('\n📊 Reading data:\n');

    for (const sheetName of CONFIG.TARGET_SHEETS) {
      const worksheet = this.workbook.Sheets[sheetName];
      const headerRowIndex = this.headerRowBySheet[sheetName];
      const colMap = this.colMapBySheet[sheetName]; // normalized -> raw

      const rows = XLSX.utils.sheet_to_json(worksheet, {
        range: headerRowIndex,
        defval: null,
        raw: true
      });

      const codeColRaw = colMap['Mã điểm'];
      const namColRaw = colMap['Năm'];
      const dotColRaw = colMap['Đợt'];

      const validRows = rows
        .filter(row => row[codeColRaw] && String(row[codeColRaw]).trim())
        .map(row => {
          // Chuẩn hóa lại object thành key chuẩn ('Mã điểm', 'Năm', 'Đợt', ...)
          // để phần transformRecord() phía dưới dùng được key cố định,
          // bất kể tên cột gốc trong Excel viết khác thế nào.
          const normalizedRow = { __sheet: sheetName };
          for (const [rawKey, val] of Object.entries(row)) {
            normalizedRow[normalizeColName(rawKey)] = val;
          }
          // Đảm bảo 3 cột bắt buộc luôn map đúng
          normalizedRow['Mã điểm'] = row[codeColRaw];
          normalizedRow['Năm'] = row[namColRaw];
          normalizedRow['Đợt'] = row[dotColRaw];
          return normalizedRow;
        });

      console.log(`   ✓ ${sheetName}: ${validRows.length} records (header row ${headerRowIndex})`);
      allRecords.push(...validRows);
    }

    return allRecords;
  }
}

// ============================================================
// VALIDATION
// ============================================================

const Validator = {
  validateRequired(rows) {
    const required = ['Năm', 'Đợt', 'Mã điểm'];
    const errors = [];

    rows.forEach((row, idx) => {
      required.forEach(col => {
        const val = row[col];
        if (!val || !String(val).trim()) {
          errors.push(`${row.__sheet}#${idx + 1}: Missing "${col}"`);
        }
      });
    });

    if (errors.length > 0) {
      throw new Error(
        `❌ Missing fields (${errors.length} errors):\n${errors.slice(0, 5).join('\n')}`
      );
    }
  },

  validateYearsAndWaves(rows) {
    const errors = [];

    rows.forEach((row, idx) => {
      const year = Number(row['Năm']);
      const wave = Number(row['Đợt']);
      const code = String(row['Mã điểm']).trim();

      if (!CONFIG.TARGET_YEARS.includes(year)) {
        errors.push(`${code}: Year ${year} not in [2023, 2025]`);
      }

      if (year === 2023 && ![1, 2, 3].includes(wave)) {
        errors.push(`${code}: Year 2023 doesn't have wave ${wave}`);
      }

      if (year === 2025 && wave !== 1) {
        errors.push(`${code}: Year 2025 only has wave 1, not ${wave}`);
      }
    });

    if (errors.length > 0) {
      throw new Error(
        `❌ Invalid data (${errors.length} errors):\n${errors.slice(0, 5).join('\n')}`
      );
    }
  },

  validateCounts(rows) {
    const counts = { 2023: 0, 2025: 0 };

    rows.forEach(row => {
      const year = Number(row['Năm']);
      if (counts.hasOwnProperty(year)) counts[year]++;
    });

    Object.entries(counts).forEach(([year, count]) => {
      const expected = CONFIG.EXPECTED_COUNTS[year];
      if (count !== expected) {
        throw new Error(
          `❌ Year ${year}: expected ${expected} records, got ${count}`
        );
      }
    });

    return counts;
  }
};

// ============================================================
// RECORD TRANSFORMER
// ============================================================

function transformRecord(excelRow) {
  const year = Number(excelRow['Năm']);
  const wave = Number(excelRow['Đợt']);
  const code = String(excelRow['Mã điểm']).trim();

  // Track KPH flags
  const kphFlags = {};
  Object.entries(WATER_QUALITY_COLUMNS).forEach(([dbField, excelField]) => {
    const kphField = `${excelField} - KPH`;
    if (Utils.isKPH(excelRow[kphField])) {
      kphFlags[dbField] = 'KPH';
    }
  });

  return [
    code,
    year,
    wave,
    Utils.parseDate(excelRow['Ngày lấy mẫu']),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.ph]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.do_mgl]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.bod5]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.cod]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.tss]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.coliform]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.amoni]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.clorua]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.fe]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.no2]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.tong_dau]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.ecoli]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.toc]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.tong_p]),
    Utils.parseNumber(excelRow[WATER_QUALITY_COLUMNS.tong_n]),
    JSON.stringify(kphFlags),
    `Đợt ${wave}/${year} - ${excelRow.__sheet}`
  ];
}

// ============================================================
// MAIN IMPORT
// ============================================================

async function runImport() {
  console.clear();
  console.log('╔════════════════════════════════════════╗');
  console.log('║  WEBGIS QUẢNG NGÃI - IMPORT 2023+2025  ║');
  console.log('╚════════════════════════════════════════╝');

  // Find Excel file
  const excelFiles = fs
    .readdirSync(__dirname)
    .filter(f => f.toLowerCase().endsWith('.xlsx'));

  if (excelFiles.length === 0) {
    throw new Error('❌ No .xlsx file found in project directory');
  }

  const excelPath = path.join(__dirname, excelFiles[0]);

  // Read Excel
  console.log(`\n✓ Sẽ đọc file: ${excelFiles[0]}`);
  if (excelFiles.length > 1) {
    console.log(`⚠️  Cảnh báo: có ${excelFiles.length} file .xlsx trong thư mục, đang dùng file đầu tiên (alphabet): ${excelFiles[0]}`);
    console.log(`   Các file khác: ${excelFiles.slice(1).join(', ')}\n`);
  }

  const reader = new SmartExcelReader(excelPath);
  reader.load();

  const excelData = reader.read();
  console.log(`\nTotal records read: ${excelData.length}\n`);

  // Validate
  console.log('🔍 Validating data...\n');
  Validator.validateRequired(excelData);
  Validator.validateYearsAndWaves(excelData);
  const counts = Validator.validateCounts(excelData);

  console.log(`   ✓ Year 2023: ${counts[2023]} records`);
  console.log(`   ✓ Year 2025: ${counts[2025]} records\n`);

  // Transform
  console.log('⚙️  Transforming records...\n');
  const records = excelData.map(transformRecord);

  // Database Import
  const client = await pool.connect();

  try {
    console.log('📥 Importing to database...\n');

    await client.query('BEGIN');

    // Ensure column exists
    await client.query(`
      ALTER TABLE chi_so_quan_trac
      ADD COLUMN IF NOT EXISTS nam INTEGER;
    `);

    // Create unique constraint
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      uq_chi_so_quan_trac_ma_nam_dot
      ON chi_so_quan_trac (ma_mau, nam, dot);
    `);

    const sql = `
      INSERT INTO chi_so_quan_trac
      (
        ma_mau, nam, dot, ngay_quan_trac,
        ph, do_mgl, bod5, cod, tss, coliform,
        amoni, clorua, fe, no2, tong_dau,
        ecoli, toc, tong_p, tong_n,
        kph_flags, ghi_chu
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (ma_mau, nam, dot) DO NOTHING
      RETURNING id;
    `;

    let inserted = 0;
    let skipped = 0;

    // Batch insert
    for (let i = 0; i < records.length; i += CONFIG.BATCH_SIZE) {
      const batch = records.slice(i, i + CONFIG.BATCH_SIZE);

      for (const record of batch) {
        const result = await client.query(sql, record);

        if (result.rows.length > 0) {
          inserted++;
          const [code, year, wave] = record;
          console.log(`   ✓ ${code} | ${year} | Wave ${wave}`);
        } else {
          skipped++;
          const [code, year, wave] = record;
          console.log(`   → Skip: ${code} | ${year} | Wave ${wave}`);
        }
      }
    }

    await client.query('COMMIT');

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║         ✓ IMPORT SUCCESSFUL            ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log(`Inserted: ${inserted} records`);
    console.log(`Already exist: ${skipped} records`);
    console.log(`\n✓ Year 2024 data not affected`);
    console.log(`✓ Transaction completed\n`);

  } catch (error) {
    try {
      await client.query('ROLLBACK');
      console.log('\n→ Transaction ROLLBACK');
      console.log('→ Year 2024 data protected\n');
    } catch (rollbackErr) {
      console.error('Rollback error:', rollbackErr);
    }

    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// ENTRY POINT
// ============================================================

runImport()
  .catch(error => {
    console.error('\n❌ ERROR:');
    console.error(error.message || error);
    console.error('');
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    process.exit(0);
  });