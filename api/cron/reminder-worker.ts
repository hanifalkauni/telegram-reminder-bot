import { executeDailyReminderWorker, sendSubscriptionExpiryWarnings } from '../../src/services/notificationService.js';
import { env } from '../../src/config/env.js';

export default async function handler(req: Request): Promise<Response> {
  // 1. Verifikasi Vercel Cron Secret (Mencegah eksekusi publik tidak sah)
  const authHeader = req.headers.get('authorization');
  if (env.NODE_ENV === 'production' && env.CRON_SECRET) {
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
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

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('❌ Error executing daily reminder cron worker:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message || 'Internal Server Error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
