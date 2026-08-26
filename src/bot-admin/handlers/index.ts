import { Bot, Context } from 'grammy';
import { extendUserByTelegramId } from '../../services/subscriptionService.js';
import { supabase } from '../../db/supabase.js';
import { env } from '../../config/env.js';
import { escapeHTML } from '../../utils/telegramHelper.js';

export function registerAdminHandlers(bot: Bot<Context>): void {
  // 1. One-Tap Approve Payment Handler (adm_app:<telegram_id>:<duration_days>)
  bot.callbackQuery(/^adm_app:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetTelegramId = parseInt(ctx.match[1], 10);
    const durationDays = parseInt(ctx.match[2], 10);
    const adminFrom = ctx.from;

    const updated = await extendUserByTelegramId(targetTelegramId, durationDays);

    if (!updated) {
      await ctx.reply(`❌ Gagal memperpanjang user ${targetTelegramId}. User mungkin belum pernah mengetik /start.`);
      return;
    }

    const durationText = durationDays === 0 ? 'Seumur Hidup (Lifetime) ♾️' : `${durationDays} Hari`;

    // 1. Edit pesan di Admin Bot menjadi status Approved
    const currentCaption = ctx.callbackQuery.message?.caption || ctx.callbackQuery.message?.text || '';
    const adminStatusUpdate = `\n\n✅ <b>STATUS: DISETUJUI / APPROVED</b>\n` +
      `👤 Disetujui oleh: <b>${escapeHTML(adminFrom?.first_name || 'Admin')}</b>\n` +
      `⏳ Paket: <b>${durationText}</b>\n` +
      `📅 Waktu: <b>${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</b>`;

    if (ctx.callbackQuery.message?.caption) {
      await ctx.editMessageCaption({
        caption: currentCaption + adminStatusUpdate,
        parse_mode: 'HTML',
      }).catch(() => {});
    } else {
      await ctx.editMessageText(currentCaption + adminStatusUpdate, {
        parse_mode: 'HTML',
      }).catch(() => {});
    }

    // 2. Kirim notifikasi sukses aktivasi secara Real-Time ke User di User Bot
    try {
      const userBot = new Bot(env.BOT_TOKEN_USER);
      const userSuccessMsg = `🎉 <b>PEMBAYARAN ANDA TELAH DISETUJUI!</b>\n\n` +
        `Selamat! Akun Ingatin Pro Anda kini telah <b>Aktif</b>.\n` +
        `⏳ <b>Masa Aktif:</b> <b>${durationText}</b>\n\n` +
        `Sekarang Anda dapat menyimpan pengingat garansi, STNK, SIM, dan dokumen lainnya tanpa batas.\n\n` +
        `Ketik /add untuk mulai mencatat pengingat baru!`;

      await userBot.api.sendMessage(targetTelegramId, userSuccessMsg, { parse_mode: 'HTML' });
    } catch (err) {
      console.warn('Could not send confirmation to user bot:', err);
    }
  });

  // 2. One-Tap Reject Payment Handler (adm_rej:<telegram_id>)
  bot.callbackQuery(/^adm_rej:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetTelegramId = parseInt(ctx.match[1], 10);
    const adminFrom = ctx.from;

    const currentCaption = ctx.callbackQuery.message?.caption || ctx.callbackQuery.message?.text || '';
    const adminStatusUpdate = `\n\n❌ <b>STATUS: DITOLAK / REJECTED</b>\n` +
      `👤 Ditolak oleh: <b>${escapeHTML(adminFrom?.first_name || 'Admin')}</b>\n` +
      `📅 Waktu: <b>${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</b>`;

    if (ctx.callbackQuery.message?.caption) {
      await ctx.editMessageCaption({
        caption: currentCaption + adminStatusUpdate,
        parse_mode: 'HTML',
      }).catch(() => {});
    } else {
      await ctx.editMessageText(currentCaption + adminStatusUpdate, {
        parse_mode: 'HTML',
      }).catch(() => {});
    }

    // Kirim notifikasi penolakan ke user di User Bot
    try {
      const userBot = new Bot(env.BOT_TOKEN_USER);
      const userRejectMsg = `⚠️ <b>Konfirmasi Pembayaran Ditolak</b>\n\n` +
        `Mohon maaf, bukti pembayaran yang Anda kirimkan tidak dapat diverifikasi oleh admin kami (mutasi tidak ditemukan atau bukti tidak jelas).\n\n` +
        `Silakan periksa kembali transfer Anda atau hubungi admin dengan perintah <code>/contact</code>.`;

      await userBot.api.sendMessage(targetTelegramId, userRejectMsg, { parse_mode: 'HTML' });
    } catch (err) {
      console.warn('Could not send reject message to user bot:', err);
    }
  });

  // 3. Upload QRIS Barcode dengan caption /add_qris
  bot.on('message:photo', async (ctx, next) => {
    const caption = ctx.message.caption?.trim() || '';
    if (!caption.startsWith('/add_qris')) {
      return next();
    }

    const rawArgs = caption.replace('/add_qris', '').trim();
    const parts = rawArgs.split('|').map((s) => s.trim());
    const name = parts[0] || 'QRIS All Payment';
    const accountName = parts[1] || 'Ingatin Official';

    const photos = ctx.message.photo;
    const highestRes = photos[photos.length - 1];

    const { error } = await supabase.from('payment_methods').insert({
      name,
      account_number: 'QRIS Barcode',
      account_name: accountName,
      image_url: highestRes.file_id,
      is_active: true,
    });

    if (error) {
      await ctx.reply(`❌ Gagal menyimpan QRIS: ${error.message}`);
    } else {
      await ctx.reply(`✅ <b>Barcode QRIS Berhasil Disimpan!</b>\nNama: <b>${escapeHTML(name)}</b>\nAtas Nama: <b>${escapeHTML(accountName)}</b>`, { parse_mode: 'HTML' });
    }
  });
}
