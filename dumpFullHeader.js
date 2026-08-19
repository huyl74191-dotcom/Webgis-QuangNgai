/**
 * DUMP ĐẦY ĐỦ HEADER - xem toàn bộ 19 cột + đơn vị + vài dòng dữ liệu mẫu
 * Chạy: node dumpFullHeader.js
 */
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const excelFiles = fs.readdirSync(__dirname).filter(f => f.toLowerCase().endsWith('.xlsx'));
const excelPath = path.join(__dirname, excelFiles[0]);
console.log('👉 File:', excelFiles[0], '\n');

const workbook = XLSX.readFile(excelPath, { cellDates: true });

const SHEETS = ['Đợt 1 2023', 'Đợt 2 2023', 'Đợt 3 2023', 'Đợt 1 2025'];

for (const sheetName of SHEETS) {
  console.log('\n' + '='.repeat(60));
  console.log(`SHEET: ${sheetName}`);
  console.log('='.repeat(60));

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.log('❌ Không tìm thấy sheet này');
    continue;
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  console.log(`Kích thước: ${range.e.r + 1} dòng x ${range.e.c + 1} cột\n`);

  // In raw 4 dòng đầu, TẤT CẢ các cột, theo địa chỉ ô (không qua parser)
  for (let R = 0; R <= Math.min(4, range.e.r); R++) {
    const rowCells = [];
    for (let C = 0; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = sheet[addr];
      rowCells.push(cell ? String(cell.v) : '·');
    }
    console.log(`Row ${R}:`, rowCells.map((v, i) => `[${i}]${v}`).join('  '));
  }
}