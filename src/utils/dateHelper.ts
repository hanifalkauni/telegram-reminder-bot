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

const MONTH_MAP_ID: Record<string, number> = {
  januari: 1, jan: 1,
  februari: 2, feb: 2, pebruari: 2,
  maret: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  agustus: 8, agu: 8, ags: 8, agt: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, oct: 10,
  november: 11, nov: 11, nopember: 11,
  desember: 12, des: 12, dec: 12,
};

/**
 * Parse input tanggal fleksibel dari user:
 * - YYYY-MM-DD (2026-12-31, 1996-06-01)
 * - DD/MM/YYYY atau DD-MM-YYYY (01/06/1996, 1/6/1996, 31/12/2026)
 * - DD/MM atau DD-MM (01/06, 15/10) -> Otomatis tahun saat ini
 * - Format teks Indonesia: "1 Juni 1996", "15 Oktober", "31 Des 2026"
 * Return: string "YYYY-MM-DD" atau null jika tidak valid
 */
export function parseDateInput(input: string): string | null {
  const cleaned = input.trim().toLowerCase();
  const currentYear = new Date().getFullYear();
  
  // 1. Format YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (isValidDate(year, month, day)) {
      return `${year}-${padZero(month)}-${padZero(day)}`;
    }
  }

  // 2. Format DD-MM-YYYY atau DD/MM/YYYY (contoh: 01/06/1996, 1/6/1996)
  const idFullMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (idFullMatch) {
    const day = parseInt(idFullMatch[1], 10);
    const month = parseInt(idFullMatch[2], 10);
    const year = parseInt(idFullMatch[3], 10);
    if (isValidDate(year, month, day)) {
      return `${year}-${padZero(month)}-${padZero(day)}`;
    }
  }

  // 3. Format DD/MM atau DD-MM tanpa tahun (contoh: 01/06, 15/10)
  const idShortMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (idShortMatch) {
    const day = parseInt(idShortMatch[1], 10);
    const month = parseInt(idShortMatch[2], 10);
    if (isValidDate(currentYear, month, day)) {
      return `${currentYear}-${padZero(month)}-${padZero(day)}`;
    }
  }

  // 4. Format teks Indonesia (contoh: "1 Juni 1996", "15 Oktober", "31 Des 2026")
  const textMatch = cleaned.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
  if (textMatch) {
    const day = parseInt(textMatch[1], 10);
    const monthStr = textMatch[2];
    const year = textMatch[3] ? parseInt(textMatch[3], 10) : currentYear;
    const month = MONTH_MAP_ID[monthStr];
    if (month && isValidDate(year, month, day)) {
      return `${year}-${padZero(month)}-${padZero(day)}`;
    }
  }

  return null;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

/**
 * Menghitung tanggal perulangan tahunan berikutnya (Next Annual Occurrence)
 * Sangat berguna untuk Ulang Tahun & Anniversary agar jika user input tahun lahir (misal 1995),
 * bot otomatis mengarahkan ke tanggal ulang tahun terdekat (tahun ini atau tahun depan).
 */
export function getNextUpcomingOccurrence(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentYear = today.getFullYear();
  let target = new Date(currentYear, month, day);
  target.setHours(0, 0, 0, 0);

  // Jika tanggal di tahun ini sudah lewat, jadwalkan untuk tahun depan
  if (target < today) {
    target = new Date(currentYear + 1, month, day);
  }

  const targetYear = target.getFullYear();
  const targetMonth = padZero(target.getMonth() + 1);
  const targetDay = padZero(target.getDate());

  return `${targetYear}-${targetMonth}-${targetDay}`;
}

/**
 * Menambahkan sejumlah bulan ke tanggal YYYY-MM-DD
 */
export function addMonthsToDate(dateStr: string, monthsToAdd: number): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const d = new Date(year, month, day);
  d.setMonth(d.getMonth() + monthsToAdd);

  const nextYear = d.getFullYear();
  const nextMonth = padZero(d.getMonth() + 1);
  const nextDay = padZero(d.getDate());

  return `${nextYear}-${nextMonth}-${nextDay}`;
}

/**
 * Menambahkan 1 Tahun Hijriyah (~354 hari) ke tanggal YYYY-MM-DD
 * Sangat presisi untuk perulangan Kurban Idul Adha (10 Dzulhijjah), Haul Zakat Maal, dan Ramadhan.
 */
export function addHijriYearToDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const d = new Date(year, month, day);
  // Tambahkan 354 hari (1 tahun lunar Hijriyah)
  d.setDate(d.getDate() + 354);

  const nextYear = d.getFullYear();
  const nextMonth = padZero(d.getMonth() + 1);
  const nextDay = padZero(d.getDate());

  return `${nextYear}-${nextMonth}-${nextDay}`;
}

/**
 * Format tanggal Masehi ke representasi Kalender Hijriyah
 * Contoh: "27 Mei 2026" -> "10 Dzulhijjah 1447 H"
 */
export function formatHijriDate(dateInput: string | Date): string {
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '';

    const formatter = new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const formatted = formatter.format(d);
    return `${formatted} H`;
  } catch {
    return '';
  }
}

/**
 * Menghitung tanggal siklus berikutnya berdasarkan recurring_type
 */
export function calculateNextRecurringDate(dateStr: string, recurringType: string): string {
  switch (recurringType) {
    case 'MONTHLY':
      return addMonthsToDate(dateStr, 1);
    case 'QUARTERLY':
      return addMonthsToDate(dateStr, 3);
    case 'SEMI_ANNUAL':
      return addMonthsToDate(dateStr, 6);
    case 'YEARLY':
      return addMonthsToDate(dateStr, 12);
    case 'FIVE_YEARS':
      return addMonthsToDate(dateStr, 60);
    case 'HIJRI_YEARLY':
      return addHijriYearToDate(dateStr);
    default:
      return dateStr;
  }
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
