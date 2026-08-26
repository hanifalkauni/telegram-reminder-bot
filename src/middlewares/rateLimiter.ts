import { Context, NextFunction } from 'grammy';
import { APP_CONSTANTS } from '../config/constants.js';

interface RateLimitBucket {
  count: number;
  lastReset: number;
}

interface SupportDailyBucket {
  count: number;
  dateKey: string; // YYYY-MM-DD
}

// In-memory buckets for serverless invocation window
const userRequestBuckets = new Map<number, RateLimitBucket>();
const userSupportBuckets = new Map<number, SupportDailyBucket>();
const userMediaBuckets = new Map<number, number>();

/**
 * General Chat Anti-Spam Middleware (Max 3 req / 2s)
 */
export async function generalRateLimiter(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const now = Date.now();
  let bucket = userRequestBuckets.get(userId);

  if (!bucket || now - bucket.lastReset > APP_CONSTANTS.RATE_LIMIT.WINDOW_MS) {
    bucket = { count: 1, lastReset: now };
    userRequestBuckets.set(userId, bucket);
  } else {
    bucket.count += 1;
    if (bucket.count > APP_CONSTANTS.RATE_LIMIT.MAX_REQUESTS) {
      if (bucket.count === APP_CONSTANTS.RATE_LIMIT.MAX_REQUESTS + 1) {
        await ctx.reply('⚠️ <b>Terlalu Cepat!</b> Mohon tunggu 2 detik sebelum mengirim pesan berikutnya.', { parse_mode: 'HTML' });
      }
      return; // Drop message
    }
  }

  // Media throttling
  if (ctx.message?.photo || ctx.message?.document) {
    const lastMediaTime = userMediaBuckets.get(userId) || 0;
    if (now - lastMediaTime < APP_CONSTANTS.RATE_LIMIT.MEDIA_WINDOW_MS) {
      await ctx.reply('⚠️ Mohon tunggu 15 detik sebelum mengunggah foto/media berikutnya.', { parse_mode: 'HTML' });
      return;
    }
    userMediaBuckets.set(userId, now);
  }

  return next();
}

/**
 * Check & Consume Daily Contact Quota (Max 3 messages per 24 hours per user)
 */
export function checkAndConsumeContactQuota(userId: number): boolean {
  const todayKey = new Date().toISOString().split('T')[0];
  let bucket = userSupportBuckets.get(userId);

  if (!bucket || bucket.dateKey !== todayKey) {
    bucket = { count: 1, dateKey: todayKey };
    userSupportBuckets.set(userId, bucket);
    return true;
  }

  if (bucket.count >= APP_CONSTANTS.SUPPORT_MAX_DAILY_MESSAGES) {
    return false;
  }

  bucket.count += 1;
  return true;
}
