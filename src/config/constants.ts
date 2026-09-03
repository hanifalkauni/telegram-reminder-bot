export const APP_CONSTANTS = {
  APP_NAME: 'Ingatin',
  FREE_TRIAL_MAX_ITEMS: 2,
  DEFAULT_REMINDER_DAYS: [30, 7, 3, 1, 0],
  TELEGRAM_BATCH_LIMIT_PER_SECOND: 25, // safe limit under 30
  SUPPORT_MAX_DAILY_MESSAGES: 3,
  RATE_LIMIT: {
    MAX_REQUESTS: 5,
    WINDOW_MS: 2000, // 5 requests per 2 seconds
    MEDIA_WINDOW_MS: 2000, // 2 seconds media window (safe burst, prevents 15s lockouts)
  }
};

export const CATEGORY_ICONS: Record<string, string> = {
  birthday: '🎂',
  vehicle: '🚗',
  maintenance: '🛠️',
  health: '💊',
  financial: '💳',
  spiritual: '🕊️',
  career: '👔',
  education: '🎓',
  electronics: '💻',
  document: '📄',
  travel: '✈️',
  digital: '🌐',
  property: '🏠',
  plant: '🪴',
  pet: '🐾',
  custom: '📌',
};

export const RECURRING_LABELS: Record<string, string> = {
  NONE: 'Sekali Saja',
  MONTHLY: 'Tiap 1 Bulan',
  QUARTERLY: 'Tiap 3 Bulan',
  SEMI_ANNUAL: 'Tiap 6 Bulan',
  YEARLY: 'Tiap 1 Tahun',
  FIVE_YEARS: 'Tiap 5 Tahun',
  HIJRI_YEARLY: 'Tiap 1 Tahun Hijriyah (~354 Hari)',
};
