export const APP_CONSTANTS = {
  APP_NAME: 'TempoGuard',
  FREE_TRIAL_MAX_ITEMS: 2,
  DEFAULT_REMINDER_DAYS: [30, 7, 3, 1, 0],
  TELEGRAM_BATCH_LIMIT_PER_SECOND: 25, // safe limit under 30
  SUPPORT_MAX_DAILY_MESSAGES: 3,
  RATE_LIMIT: {
    MAX_REQUESTS: 3,
    WINDOW_MS: 2000, // 3 requests per 2 seconds
    MEDIA_WINDOW_MS: 15000, // 1 media upload per 15 seconds
  }
};

export const CATEGORY_ICONS: Record<string, string> = {
  electronics: '💻',
  vehicle: '🚗',
  document: '📄',
  digital: '🌐',
  property: '🏠',
  custom: '📌',
};
