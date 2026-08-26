const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Format string tanggal YYYY-MM-DD menjadi format bahasa Indonesia
 * Contoh: "2026-09-15" -> "15 September 2026"
 */
export function formatDateID(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return String(dateInput);
  
  const day = d.getDate();
  const month = MONTH_NAMES_ID[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Menghitung selisih hari dari hari ini ke tanggal jatuh tempo
 * Positif = sisa hari di masa depan
 * 0 = Hari ini
 * Negatif = Sudah lewat / expired
 */
export function getDaysDifference(targetDateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parsing target date YYYY-MM-DD
  const parts = targetDateStr.split('-');
  if (parts.length !== 3) return 0;
  
  const target = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Parse input tanggal fleksibel dari user:
 * - YYYY-MM-DD (2026-12-31)
 * - DD/MM/YYYY (31/12/2026)
 * - DD-MM-YYYY (31-12-2026)
 * Return: string "YYYY-MM-DD" atau null jika tidak valid
 */
export function parseDateInput(input: string): string | null {
  const cleaned = input.trim();
  
  // Format YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (isValidDate(year, month, day)) {
      return `${year}-${padZero(month)}-${padZero(day)}`;
    }
  }

  // Format DD-MM-YYYY atau DD/MM/YYYY
  const idMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (idMatch) {
    const day = parseInt(idMatch[1], 10);
    const month = parseInt(idMatch[2], 10);
    const year = parseInt(idMatch[3], 10);
    if (isValidDate(year, month, day)) {
      return `${year}-${padZero(month)}-${padZero(day)}`;
    }
  }

  return null;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

/**
 * Format visual status urgensi
 */
export function getUrgencyBadge(daysLeft: number): { badge: string; status: string } {
  if (daysLeft < 0) {
    return { badge: '🔴', status: `Expired (${Math.abs(daysLeft)} hari lalu)` };
  } else if (daysLeft === 0) {
    return { badge: '🚨', status: 'HARI INI JATUH TEMPO!' };
  } else if (daysLeft <= 3) {
    return { badge: '🔴', status: `${daysLeft} hari lagi (Kritis)` };
  } else if (daysLeft <= 14) {
    return { badge: '🟡', status: `${daysLeft} hari lagi` };
  } else {
    return { badge: '🟢', status: `${daysLeft} hari lagi` };
  }
}
