/**
 * WEBGIS QUẢNG NGÃI - IMPORT DỮ LIỆU MONITORING 2023 + 2025 (V2)
 *
 * Viết lại dựa trên cấu trúc THẬT của file (xem dump ngày ...):
 * - Không có cột "Mã điểm/Năm/Đợt" -> dùng "Kí hiệu mẫu" + tên sheet
 * - Header ở row 0 (tên thông số), row 1 là đơn vị (bỏ qua), data từ row 2
 * - 2023 và 2025 có thứ tự cột và bộ thông số khác nhau -> map theo TÊN cột, không theo vị trí
 * - Giá trị KPH nằm lồng trong ô dạng "KPH (<0,004)"
 * - "Đợt 1 2023": Ngày lấy mẫu trống, Từ ngày/Đến ngày là ngày rác (epoch ~1899) -> lọc bỏ
 * - Thêm cột DB cho NO3-, PO43- (2023) và Pb, Cu, Cr VI (2025) - dữ liệu thật, không được bỏ
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
  EXPECTED_COUNTS: { 2023: 93, 2025: 31 }, // tổng cả 3 đợt 2023 = 93, 2025 (1 đợt) = 31
  TARGET_SHEETS: [
    'Đợt 1 2023',
    'Đợt 2 2023',
    'Đợt 3 2023',
    'Đợt 1 2025'
  ],
  BATCH_SIZE: 50,
  DEBUG: process.argv.includes('--debug')
};

// Cột định danh mẫu + dòng lấy mẫu
const CODE_COLUMN = 'Kí hiệu mẫu';
const DATE_COLUMN = 'Ngày lấy mẫu';
const DATE_FALLBACK_COLUMN = 'Từ ngày';

// Ánh xạ: tên cột Excel (đã chuẩn hóa) -> field trong DB
// Gộp cả 2 bộ thông số của 2023 và 2025 vào 1 bảng map duy nhất
const COLUMN_TO_DB_FIELD = {
  'pH': 'ph',
  'DO': 'do_mgl',
  'BOD': 'bod5',
  'COD': 'cod',
  'TSS': 'tss',
  'Coliforms': 'coliform',
  'COLIFORM': 'coliform',
  'NH4+': 'amoni',
  'AMONI': 'amoni',
  'Cl-': 'clorua',
  'CLORUA': 'clorua',
  'Fe': 'fe',
  'NO2-': 'no2',
  'TỔNG DẦU': 'tong_dau',
  'E.COLI': 'ecoli',
  'TOC': 'toc',
  'TỔNG P': 'tong_p',
  'TỔNG N': 'tong_n',
  // Thông số CHỈ có ở 2023, DB gốc chưa có cột -> sẽ tự ALTER TABLE thêm
  'NO3-': 'no3',
  'PO43-': 'po4',
  // Thông số CHỈ có ở 2025, DB gốc chưa có cột -> sẽ tự ALTER TABLE thêm
  'Pb': 'pb',
  'Cu': 'cu',
  'Cr VI': 'cr_vi'
};

// Các field DB không có sẵn trong bảng gốc, cần ALTER TABLE ADD COLUMN
const EXTRA_DB_FIELDS = ['no3', 'po4', 'pb', 'cu', 'cr_vi'];

// Toàn bộ field số liệu (dùng để build câu SQL theo thứ tự cố định)
const ALL_VALUE_FIELDS = [
  'ph', 'do_mgl', 'bod5', 'cod', 'tss', 'coliform',
  'amoni', 'clorua', 'fe', 'no2', 'tong_dau',
  'ecoli', 'toc', 'tong_p', 'tong_n',
  'no3', 'po4', 'pb', 'cu', 'cr_vi'
];

// ============================================================
// UTILITIES
// ============================================================

function normalizeColName(name) {
  if (name === null || name === undefined) return '';
  return String(name)
    .normalize('NFC')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const Utils = {
  parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;

    const str = String(value).trim();
    if (!str) return null;
    // Bất kỳ giá trị nào bắt đầu bằng KPH đều không phải số -> null (cờ KPH xử lý riêng)
    if (/^KPH/i.test(str) || ['--', '-'].includes(str)) return null;

    let normalized = str
      .replace(/\s+/g, '')
      .replace(/\.(?=\d{1,3},)/, '')
      .replace(',', '.');

    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  },

  // Nhận diện KPH dù có kèm ngưỡng trong ngoặc: "KPH (<0,004)", "KPH(<4)"...
  isKPH(value) {
    return value !== null && value !== undefined && /^KPH/i.test(String(value).trim());
  },

  parseDate(value) {
    if (!value) return null;

    let date = null;

    if (value instanceof Date) {
      date = !Number.isNaN(value.getTime()) ? value : null;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      try {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) {
          date = new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
        }
      } catch (e) { /* ignore */ }
    } else {
      const str = String(value).trim();
      const match = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      if (match) {
        const [, day, month, year, hour = '0', minute = '0', second = '0'] = match;
        const d = new Date(year, month - 1, day, hour, minute, second);
        if (d.getFullYear() == year && d.getMonth() == month - 1 && d.getDate() == day) {
          date = d;
        }
      }
    }

    // Lọc ngày rác kiểu epoch Excel (~1899-1900), coi như không có dữ liệu
    if (date && date.getFullYear() < 2000) return null;

    return date;
  }
};

// ============================================================
// EXCEL READER - dựa trên cấu trúc thật (header row 0, data từ row 2)
// ============================================================

class SheetBasedReader {
  constructor(filePath) {
    this.filePath = filePath;
    this.workbook = null;
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
  }

  /**
   * Parse tên sheet "Đợt 1 2023" -> { wave: 1, year: 2023 }
   */
  _parseSheetName(sheetName) {
    const m = sheetName.match(/Đợt\s*(\d+)\s*(\d{4})/i);
    if (!m) throw new Error(`❌ Không parse được năm/đợt từ tên sheet: "${sheetName}"`);
    return { wave: Number(m[1]), year: Number(m[2]) };
  }

  read() {
    const allRecords = [];
    console.log('\n📊 Reading data:\n');

    for (const sheetName of CONFIG.TARGET_SHEETS) {
      const sheet = this.workbook.Sheets[sheetName];
      const { wave, year } = this._parseSheetName(sheetName);

      const range = XLSX.utils.decode_range(sheet['!ref']);

      // Đọc header (row 0) -> mảng tên cột theo vị trí
      const headerNames = [];
      for (let C = 0; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: C });
        const cell = sheet[addr];
        headerNames[C] = normalizeColName(cell ? cell.v : '');
      }

      const codeColIndex = headerNames.indexOf(CODE_COLUMN);
      if (codeColIndex === -1) {
        throw new Error(`❌ [${sheetName}] Không tìm thấy cột "${CODE_COLUMN}". Cột thấy được: ${headerNames.join(', ')}`);
      }

      // Data bắt đầu từ row 2 (row 0 = tên cột, row 1 = đơn vị)
      let sheetCount = 0;
      for (let R = 2; R <= range.e.r; R++) {
        const codeAddr = XLSX.utils.encode_cell({ r: R, c: codeColIndex });
        const codeCell = sheet[codeAddr];
        const code = codeCell ? String(codeCell.v).trim() : '';
        if (!code) continue; // dòng trống -> bỏ qua

        const rawRecord = { __sheet: sheetName, __year: year, __wave: wave, __code: code };
        for (let C = 0; C <= range.e.c; C++) {
          const colName = headerNames[C];
          if (!colName) continue; // cột không có tên (ví dụ cột thừa/lỗi nhập liệu) -> bỏ qua
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = sheet[addr];
          rawRecord[colName] = cell ? cell.v : null;
        }

        allRecords.push(rawRecord);
        sheetCount++;
      }

      console.log(`   ✓ ${sheetName}: ${sheetCount} records (năm ${year}, đợt ${wave})`);
    }

    return allRecords;
  }
}

// ============================================================
// VALIDATION
// ============================================================

const Validator = {
  validateCounts(rows) {
    const counts = { 2023: 0, 2025: 0 };
    rows.forEach(row => {
      if (counts.hasOwnProperty(row.__year)) counts[row.__year]++;
    });

    Object.entries(counts).forEach(([year, count]) => {
      const expected = CONFIG.EXPECTED_COUNTS[year];
      if (count !== expected) {
        throw new Error(`❌ Năm ${year}: kỳ vọng ${expected} bản ghi, đọc được ${count}`);
      }
    });

    return counts;
  }
};

// ============================================================
// RECORD TRANSFORMER
// ============================================================

function transformRecord(rawRecord) {
  const values = {};
  const kphFlags = {};

  for (const [excelCol, dbField] of Object.entries(COLUMN_TO_DB_FIELD)) {
    const cellValue = rawRecord[excelCol];
    if (cellValue === undefined) continue; // sheet này không có cột đó (bình thường, VD 2023 không có Pb)

    if (Utils.isKPH(cellValue)) {
      kphFlags[dbField] = String(cellValue).trim();
      values[dbField] = null;
    } else {
      values[dbField] = Utils.parseNumber(cellValue);
    }
  }

  // Ngày lấy mẫu: ưu tiên "Ngày lấy mẫu", fallback "Từ ngày" nếu không hợp lệ
  let sampleDate = Utils.parseDate(rawRecord[DATE_COLUMN]);
  if (!sampleDate) {
    sampleDate = Utils.parseDate(rawRecord[DATE_FALLBACK_COLUMN]);
  }

  const orderedValues = ALL_VALUE_FIELDS.map(f => (values[f] !== undefined ? values[f] : null));

  return [
    rawRecord.__code,
    rawRecord.__year,
    rawRecord.__wave,
    sampleDate,
    ...orderedValues,
    JSON.stringify(kphFlags),
    `Đợt ${rawRecord.__wave}/${rawRecord.__year} - ${rawRecord.__sheet}`
  ];
}

// ============================================================
// MAIN IMPORT
// ============================================================

async function runImport() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  WEBGIS QUẢNG NGÃI - IMPORT 2023+2025  ║');
  console.log('╚════════════════════════════════════════╝');

  const excelFiles = fs.readdirSync(__dirname).filter(f => f.toLowerCase().endsWith('.xlsx'));
  if (excelFiles.length === 0) throw new Error('❌ Không tìm thấy file .xlsx trong thư mục project');

  const excelPath = path.join(__dirname, excelFiles[0]);
  console.log(`\n✓ Sẽ đọc file: ${excelFiles[0]}`);
  if (excelFiles.length > 1) {
    console.log(`⚠️  Có ${excelFiles.length} file .xlsx, đang dùng: ${excelFiles[0]}`);
  }

  const reader = new SheetBasedReader(excelPath);
  reader.load();
  const rawData = reader.read();

  console.log(`\nTổng số bản ghi đọc được: ${rawData.length}\n`);

  console.log('🔍 Kiểm tra số lượng...\n');
  const counts = Validator.validateCounts(rawData);
  console.log(`   ✓ Năm 2023: ${counts[2023]} bản ghi`);
  console.log(`   ✓ Năm 2025: ${counts[2025]} bản ghi\n`);

  console.log('⚙️  Chuyển đổi dữ liệu...\n');
  const records = rawData.map(transformRecord);

  const client = await pool.connect();

  try {
    console.log('📥 Đang import vào database...\n');
    await client.query('BEGIN');

    await client.query(`ALTER TABLE chi_so_quan_trac ADD COLUMN IF NOT EXISTS nam INTEGER;`);
    await client.query(`ALTER TABLE chi_so_quan_trac ALTER COLUMN ngay_quan_trac DROP NOT NULL;`);
    for (const field of EXTRA_DB_FIELDS) {
      await client.query(`ALTER TABLE chi_so_quan_trac ADD COLUMN IF NOT EXISTS ${field} NUMERIC;`);
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      uq_chi_so_quan_trac_ma_nam_dot
      ON chi_so_quan_trac (ma_mau, nam, dot);
    `);

    const columnList = ['ma_mau', 'nam', 'dot', 'ngay_quan_trac', ...ALL_VALUE_FIELDS, 'kph_flags', 'ghi_chu'];
    const placeholders = columnList.map((_, i) => `$${i + 1}`).join(', ');

    const sql = `
      INSERT INTO chi_so_quan_trac (${columnList.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (ma_mau, nam, dot) DO NOTHING
      RETURNING id;
    `;

    let inserted = 0;
    let skipped = 0;

    for (const record of records) {
      const result = await client.query(sql, record);
      const [code, year, wave] = record;
      if (result.rows.length > 0) {
        inserted++;
        console.log(`   ✓ ${code} | ${year} | Đợt ${wave}`);
      } else {
        skipped++;
        console.log(`   → Skip (đã tồn tại): ${code} | ${year} | Đợt ${wave}`);
      }
    }

    await client.query('COMMIT');

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║         ✓ IMPORT THÀNH CÔNG             ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log(`Đã thêm mới: ${inserted} bản ghi`);
    console.log(`Đã tồn tại (bỏ qua): ${skipped} bản ghi`);
    console.log(`\n✓ Dữ liệu năm 2024 không bị ảnh hưởng`);

  } catch (error) {
    try {
      await client.query('ROLLBACK');
      console.log('\n→ ROLLBACK - không có gì bị ghi vào DB');
    } catch (rollbackErr) {
      console.error('Lỗi rollback:', rollbackErr);
    }
    throw error;
  } finally {
    client.release();
  }
}

runImport()
  .catch(error => {
    console.error('\n❌ ERROR:');
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });