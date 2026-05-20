const XLSX = require('xlsx');

/**
 * Parses an uploaded Excel/CSV buffer into a deduplicated, lowercased array
 * of email addresses. The file is assumed to have NO headers — every row's
 * first cell is treated as an email candidate.
 */
function parseEmailsFromBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return { emails: [], skipped: 0 };

  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const seen = new Set();
  const emails = [];
  let skipped = 0;

  for (const row of rows) {
    // Look in every column of the row for a valid email — tolerates files
    // where the email is not strictly the first column.
    let found = null;
    for (const cell of row) {
      if (cell == null) continue;
      const candidate = String(cell).trim().toLowerCase();
      if (emailRe.test(candidate)) { found = candidate; break; }
    }
    if (found) {
      if (!seen.has(found)) {
        seen.add(found);
        emails.push(found);
      }
    } else if (row.some((c) => String(c || '').trim().length > 0)) {
      // Non-empty row but no email found — counts as skipped.
      skipped += 1;
    }
  }

  return { emails, skipped };
}

module.exports = { parseEmailsFromBuffer };
