import { Bot } from 'grammy';
import { supabase } from '../db/supabase.js';
import { env } from '../config/env.js';
import { escapeHTML } from '../utils/telegramHelper.js';

export interface ErrorAlertContextInfo {
  userId?: number;
  username?: string;
  updateType?: string;
  messageText?: string;
}

/**
 * Mengirimkan notifikasi error sistem secara otomatis ke seluruh Admin terdaftar via Bot Admin
 */
export async function notifyAdminsOnError(params: {
  source: string;
  error: unknown;
  ctxInfo?: ErrorAlertContextInfo;
}): Promise<void> {
  try {
    // 1. Ambil seluruh user yang memiliki hak akses Admin
    const { data: admins } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('is_admin', true);

    if (!admins || admins.length === 0) {
      console.warn('⚠️ Tidak ada admin terdaftar di database untuk menerima notifikasi error.');
      return;
    }

    const bot = new Bot(env.BOT_TOKEN_ADMIN);
    const errorMessage = params.error instanceof Error ? params.error.stack || params.error.message : String(params.error);
    const timeStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    let alertText = `🚨 <b>SYSTEM ERROR ALERT!</b>\n\n` +
      `📍 <b>Sumber:</b> <code>${escapeHTML(params.source)}</code>\n` +
      `⏰ <b>Waktu:</b> ${timeStr} WIB\n`;

    if (params.ctxInfo?.userId) {
      alertText += `👤 <b>User:</b> ${params.ctxInfo.username ? `@${escapeHTML(params.ctxInfo.username)}` : '-'} (<code>${params.ctxInfo.userId}</code>)\n`;
    }
    if (params.ctxInfo?.messageText) {
      alertText += `💬 <b>Input:</b> <code>${escapeHTML(params.ctxInfo.messageText.substring(0, 100))}</code>\n`;
    }

    alertText += `\n⚠️ <b>Detail Error:</b>\n<pre><code>${escapeHTML(errorMessage.substring(0, 1500))}</code></pre>`;

    // 2. Kirim pesan alert ke masing-masing admin
    for (const admin of admins) {
      try {
        await bot.api.sendMessage(admin.telegram_id, alertText, { parse_mode: 'HTML' });
      } catch (sendErr) {
        console.error(`Failed to send error alert to admin ${admin.telegram_id}:`, sendErr);
      }
    }
  } catch (err) {
    console.error('Error executing notifyAdminsOnError:', err);
  }
}
