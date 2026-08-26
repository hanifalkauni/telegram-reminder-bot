import { Bot, InlineKeyboard } from 'grammy';
import { supabase } from '../db/supabase.js';
import { env } from '../config/env.js';
import { APP_CONSTANTS } from '../config/constants.js';
import {
  formatDateID,
  getDaysDifference,
  getUrgencyBadge,
  calculateNextRecurringDate,
  formatHijriDate
} from '../utils/dateHelper.js';
import { escapeHTML, generateGoogleCalendarUrl } from '../utils/telegramHelper.js';
import { RecurringType } from '../types/database.js';

interface DailyReminderCandidate {
  reminder_id: number;
  title: string;
  notes: string | null;
  due_date: string;
  estimated_cost: number;
  photo_file_id: string | null;
  is_recurring: boolean;
  recurring_type: RecurringType;
  user_id: number;
  telegram_id: number;
  first_name: string | null;
  is_activated: boolean;
  active_until: string | null;
  is_admin: boolean;
  category_name: string | null;
  category_icon: string | null;
  days_before: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Eksekusi pengiriman notifikasi pengingat harian (Vercel Cron Worker)
 */
export async function executeDailyReminderWorker(): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const bot = new Bot(env.BOT_TOKEN_USER);
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  let stats = { processed: 0, sent: 0, skipped: 0, failed: 0 };

  // 1. Ambil seluruh reminder aktif yang belum selesai
  const { data: items, error } = await supabase
    .from('reminder_items')
    .select(`
      id,
      title,
      notes,
      due_date,
      estimated_cost,
      photo_file_id,
      is_recurring,
      recurring_type,
      reminder_intervals,
      user_id,
      users!inner (
        id,
        telegram_id,
        first_name,
        is_activated,
        active_until,
        is_admin
      ),
      categories (
        name,
        icon
      )
    `)
    .eq('is_completed', false);

  if (error || !items) {
    console.error('Error fetching reminders for cron:', error);
    return stats;
  }

  const candidatesToSend: DailyReminderCandidate[] = [];

  for (const item of items) {
    stats.processed++;
    const daysLeft = getDaysDifference(item.due_date);
    const intervals: number[] = item.reminder_intervals || APP_CONSTANTS.DEFAULT_REMINDER_DAYS;

    // Cek apakah selisih hari ini cocok dengan salah satu interval reminder
    if (intervals.includes(daysLeft)) {
      const user = item.users as unknown as {
        id: number;
        telegram_id: number;
        first_name: string | null;
        is_activated: boolean;
        active_until: string | null;
        is_admin: boolean;
      };

      // Validasi hak akses pengiriman notifikasi:
      let hasAccess = false;
      if (user.is_admin) {
        hasAccess = true;
      } else if (user.is_activated) {
        if (user.active_until === null || new Date(user.active_until) > today) {
          hasAccess = true;
        }
      } else {
        // Free trial -> Cek total item
        const { count } = await supabase
          .from('reminder_items')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_completed', false);

        if ((count || 0) <= APP_CONSTANTS.FREE_TRIAL_MAX_ITEMS) {
          hasAccess = true;
        }
      }

      if (hasAccess) {
        // Cek Idempotency
        const { data: existingLog } = await supabase
          .from('reminder_delivery_logs')
          .select('id')
          .eq('reminder_item_id', item.id)
          .eq('days_before', daysLeft)
          .eq('delivery_date', todayStr)
          .maybeSingle();

        if (!existingLog) {
          const cat = item.categories as unknown as { name: string; icon: string } | null;
          candidatesToSend.push({
            reminder_id: item.id,
            title: item.title,
            notes: item.notes,
            due_date: item.due_date,
            estimated_cost: Number(item.estimated_cost) || 0,
            photo_file_id: item.photo_file_id,
            is_recurring: item.is_recurring || false,
            recurring_type: item.recurring_type || 'NONE',
            user_id: user.id,
            telegram_id: user.telegram_id,
            first_name: user.first_name,
            is_activated: user.is_activated,
            active_until: user.active_until,
            is_admin: user.is_admin,
            category_name: cat?.name || 'Umum',
            category_icon: cat?.icon || '📌',
            days_before: daysLeft,
          });
        } else {
          stats.skipped++;
        }
      } else {
        stats.skipped++;
      }
    }
  }

  // 2. Kirim pesan secara batch rate-limited
  for (const candidate of candidatesToSend) {
    try {
      const urgency = getUrgencyBadge(candidate.days_before);
      const nameGreeting = candidate.first_name ? `Halo <b>${escapeHTML(candidate.first_name)}</b>, ` : 'Halo, ';
      const isBirthday = candidate.category_icon === '🎂' || candidate.category_name?.toLowerCase().includes('ulang tahun');
      const isSpiritual = candidate.category_icon === '🕌' || candidate.recurring_type === 'HIJRI_YEARLY';
      const hijriStr = formatHijriDate(candidate.due_date);

      let caption = '';
      if (isBirthday) {
        if (candidate.days_before === 0) {
          caption = `🎉 <b>HARI INI ULANG TAHUN SPESIAL! 🎂</b>\n\n` +
            `${nameGreeting}hari ini adalah hari spesial untuk:\n` +
            `🎂 <b>${escapeHTML(candidate.title)}</b>!\n\n` +
            `🎁 <i>Jangan lupa beri ucapan selamat terbaik atau kejutan spesial hari ini!</i> ✨`;
        } else {
          caption = `🎂 <b>PENGINGAT HARI SPESIAL / ULANG TAHUN! (${urgency.badge} ${urgency.status})</b>\n\n` +
            `${nameGreeting}hari ulang tahun/spesial berikut akan tiba:\n` +
            `🎂 <b>${escapeHTML(candidate.title)}</b>\n` +
            `📅 Tanggal: <b>${formatDateID(candidate.due_date)}</b>\n`;
          if (candidate.estimated_cost > 0) {
            const costStr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(candidate.estimated_cost);
            caption += `💵 Estimasi Dana Kado/Acara: <b>${costStr}</b>\n`;
          }
          if (candidate.notes) {
            caption += `📝 Catatan: <code>${escapeHTML(candidate.notes)}</code>\n`;
          }
          caption += `\n💡 <i>Siapkan kado, reservasi, atau ucapan spesial dari sekarang!</i>`;
        }
      } else if (isSpiritual) {
        caption = `🕊️ <b>PENGINGAT IBADAH & HARI RAYA KEAGAMAAN! (${urgency.badge} ${urgency.status})</b>\n\n` +
          `${nameGreeting}jadwal ibadah, donasi, atau hari suci berikut akan segera tiba:\n\n` +
          `🕊️ <b>${escapeHTML(candidate.title)}</b>\n` +
          `📅 Tanggal: <b>${formatDateID(candidate.due_date)}</b>\n` +
          (candidate.recurring_type === 'HIJRI_YEARLY' && hijriStr ? `🌙 Kalender Hijriyah: <b>${hijriStr}</b>\n` : '');
        if (candidate.estimated_cost > 0) {
          const costStr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(candidate.estimated_cost);
          caption += `💵 Estimasi Dana / Donasi: <b>${costStr}</b>\n`;
        }
        if (candidate.notes) {
          caption += `📝 Catatan: <code>${escapeHTML(candidate.notes)}</code>\n`;
        }
        caption += `\n💡 <i>Semoga persiapan dan niat tulus ibadah Anda berjalan lancar dan penuh berkah!</i> ✨`;
      } else {
        caption = `⏰ <b>PENGINGAT JATUH TEMPO! (${urgency.badge} ${urgency.status})</b>\n\n` +
          `${nameGreeting}item berikut mendekati masa kedaluwarsa:\n\n` +
          `<b>${candidate.category_icon} ${escapeHTML(candidate.title)}</b>\n` +
          `📂 Kategori: <i>${escapeHTML(candidate.category_name || '')}</i>\n` +
          `📅 Tanggal Jatuh Tempo: <b>${formatDateID(candidate.due_date)}</b>\n`;
        if (candidate.estimated_cost > 0) {
          const costStr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(candidate.estimated_cost);
          caption += `💵 Estimasi Biaya yang Disiapkan: <b>${costStr}</b>\n`;
        }
        if (candidate.notes) {
          caption += `📝 Catatan: <code>${escapeHTML(candidate.notes)}</code>\n`;
        }
        caption += `\n💡 <i>Segera lakukan perpanjangan, servis atau pembayaran sebelum batas waktu berakhir!</i>`;
      }

      const gcalUrl = generateGoogleCalendarUrl(candidate.title, candidate.due_date, candidate.notes);
      const keyboard = new InlineKeyboard()
        .url('📅 Google Calendar', gcalUrl)
        .text('🔄 Perpanjang (+1 Thn)', `action:renew_months:${candidate.reminder_id}:12`)
        .row()
        .text('📋 Lihat Daftar', 'action:list_reminders');

      if (candidate.photo_file_id) {
        await bot.api.sendPhoto(candidate.telegram_id, candidate.photo_file_id, {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      } else {
        await bot.api.sendMessage(candidate.telegram_id, caption, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      }

      // Catat log sukses
      await supabase.from('reminder_delivery_logs').insert({
        reminder_item_id: candidate.reminder_id,
        days_before: candidate.days_before,
        delivery_date: todayStr,
        status: 'SENT',
      });

      // Jika item recurring dan sudah Hari H (days_before === 0), majukan otomatis sesuai siklus!
      if (candidate.is_recurring && candidate.recurring_type !== 'NONE' && candidate.days_before === 0) {
        const nextCycleDate = calculateNextRecurringDate(candidate.due_date, candidate.recurring_type);

        await supabase
          .from('reminder_items')
          .update({
            due_date: nextCycleDate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', candidate.reminder_id);
      }

      stats.sent++;
      await sleep(40);
    } catch (err: unknown) {
      console.error(`Failed to send reminder to ${candidate.telegram_id}:`, err);
      stats.failed++;

      await supabase.from('reminder_delivery_logs').insert({
        reminder_item_id: candidate.reminder_id,
        days_before: candidate.days_before,
        delivery_date: todayStr,
        status: 'FAILED',
      });
    }
  }

  return stats;
}

/**
 * Notifikasi Peringatan Langganan Akan Berakhir (H-3 dan H-1)
 */
export async function sendSubscriptionExpiryWarnings(): Promise<number> {
  const bot = new Bot(env.BOT_TOKEN_USER);
  const now = new Date();
  let countSent = 0;

  // Cari user subscriber yang active_until jatuh tempo dalam 3 hari atau 1 hari
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('is_activated', true)
    .not('active_until', 'is', null);

  if (error || !users) return 0;

  for (const user of users) {
    if (!user.active_until) continue;
    const expiry = new Date(user.active_until);
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 3 || diffDays === 1) {
      try {
        const text = `⚠️ <b>Peringatan: Masa Langganan Segera Berakhir!</b>\n\nHalo <b>${escapeHTML(user.first_name || 'Kak')}</b>, masa berlangganan TempoGuard Pro Anda akan berakhir dalam <b>${diffDays} hari lagi</b> (${formatDateID(user.active_until)}).\n\nPerpanjang sekarang agar pengingat otomatis Anda tidak tertunda:`;
        const keyboard = new InlineKeyboard().text('💳 Perpanjang Langganan (/subscribe)', 'action:subscribe');
        
        await bot.api.sendMessage(user.telegram_id, text, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
        countSent++;
        await sleep(50);
      } catch (err) {
        console.error(`Failed to send sub expiry warning to ${user.telegram_id}:`, err);
      }
    }
  }

  return countSent;
}
