const ExcelJS = require('exceljs');

// Exportación genérica a CSV y XLSX. Se usa desde cualquier módulo con permiso
// "<modulo>.exportar". No se exponen columnas sensibles (passwords, tokens,
// secretos MFA, notas privadas de salud) salvo que se pase explícitamente.
function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.header)).join(',');
  const body = rows
    .map((row) => columns.map((c) => csvEscape(row[c.key])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  // Previene "CSV injection" (fórmulas maliciosas abiertas en Excel/Sheets)
  // anteponiendo comilla simple si el valor comienza con caracteres de fórmula.
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

async function toXlsxBuffer(rows, columns, sheetName = 'Datos') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DITASH Human+';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: 25 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));
  return workbook.xlsx.writeBuffer();
}

module.exports = { toCsv, toXlsxBuffer };
