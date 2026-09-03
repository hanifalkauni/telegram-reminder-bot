import { Context, NextFunction } from 'grammy';
import { APP_CONSTANTS } from '../config/constants.js';

interface RateLimitBucket {
  count: number;
  lastReset: number;
}

interface MediaLimitBucket {
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
const userMediaBuckets = new Map<number, MediaLimitBucket>();
const processedUpdates = new Map<number, number>();

/**
 * Deduplicate Telegram Webhook Updates (Cegah re-entry saat Telegram retry webhook timeout)
 */
export async function updateDeduplicator(ctx: Context, next: NextFunction): Promise<void> {
  const updateId = ctx.update?.update_id;
  if (updateId) {
    const now = Date.now();
    // Bersihkan cache jika ukuran melebihi batas (hapus entri > 60 detik)
    if (processedUpdates.size > 500) {
      for (const [id, time] of processedUpdates.entries()) {
        if (now - time > 60000) processedUpdates.delete(id);
      }
    }
    if (processedUpdates.has(updateId)) {
      // Update ini sudah/sedang diproses oleh invocation sebelumnya (Telegram retry)
      return;
    }
    processedUpdates.set(updateId, now);
  }
  return next();
}

/**
 * General Chat Anti-Spam Middleware (Max 5 req / 2s & Max 3 media / 5s)
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
        await ctx.reply('⚠️ <b>Terlalu Cepat!</b> Mohon tunggu sebentar sebelum mengirim pesan berikutnya.', { parse_mode: 'HTML' });
      }
      return; // Drop message
    }
  }

  // Media throttling (Bucket-based: Maksimal 3 media / 5 detik untuk mencegah spam tanpa memblokir upload wajar)
  if (ctx.message?.photo || ctx.message?.document) {
    let mediaBucket = userMediaBuckets.get(userId);
    const mediaWindow = 5000; // 5 detik window

    if (!mediaBucket || now - mediaBucket.lastReset > mediaWindow) {
      mediaBucket = { count: 1, lastReset: now };
      userMediaBuckets.set(userId, mediaBucket);
    } else {
      mediaBucket.count += 1;
      if (mediaBucket.count > 3) {
        if (mediaBucket.count === 4) {
          await ctx.reply('⚠️ <b>Terlalu Cepat!</b> Mohon tunggu beberapa detik sebelum mengunggah foto/media berikutnya.', { parse_mode: 'HTML' });
        }
        return;
      }
    }
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
