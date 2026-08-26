import type { IncomingMessage, ServerResponse } from 'http';
import { executeDailyReminderWorker, sendSubscriptionExpiryWarnings } from '../../src/services/notificationService.js';
import { notifyAdminsOnError } from '../../src/services/errorAlertService.js';
import { env } from '../../src/config/env.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json');

  // 1. Verifikasi Vercel Cron Secret (Mencegah eksekusi publik tidak sah)
  const authHeader = req.headers['authorization'];
  if (env.NODE_ENV === 'production' && env.CRON_SECRET) {
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
  }

  const startTime = Date.now();
  console.log('⏰ Starting Daily Reminder Cron Worker @ 07:00 WIB...');

  try {
    // 2. Eksekusi pengiriman notifikasi reminder jatuh tempo
    const reminderStats = await executeDailyReminderWorker();

    // 3. Eksekusi pengiriman notifikasi peringatan masa aktif langganan habis (H-3 dan H-1)
    const subWarningsSent = await sendSubscriptionExpiryWarnings();

    const duration = Date.now() - startTime;
    const responsePayload = {
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      reminders: reminderStats,
      subscription_warnings_sent: subWarningsSent,
    };

    console.log('✅ Daily Reminder Cron Worker completed:', responsePayload);

    res.statusCode = 200;
    res.end(JSON.stringify(responsePayload));
  } catch (error: unknown) {
    console.error('❌ Error executing daily reminder cron worker:', error);
    await notifyAdminsOnError({
      source: 'Cron Reminder Worker (07:00 WIB)',
      error,
    });

    res.statusCode = 500;
    res.end(
      JSON.stringify({
        success: false,
        error: (error as Error).message || 'Internal Server Error',
      })
    );
  }
}
