import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { UserBotContext } from '../conversations/addReminderWizard.js';
import { getOrCreateUser, checkUserAccess, promoteToAdmin } from '../../services/accessControl.js';
import { getUserReminders } from '../../services/reminderService.js';
import { getActivePackages, getActivePaymentMethods, redeemCode } from '../../services/subscriptionService.js';
import { checkAndConsumeContactQuota } from '../../middlewares/rateLimiter.js';
import { formatDateID, getDaysDifference, getUrgencyBadge } from '../../utils/dateHelper.js';
import { escapeHTML, getMainMenuKeyboard } from '../../utils/telegramHelper.js';
import { supabase } from '../../db/supabase.js';
import { env } from '../../config/env.js';

export function registerUserCommands(bot: Bot<UserBotContext>): void {
  // 1. /start
  bot.command('start', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    // Registrasi / Sync user
    await getOrCreateUser({
      id: from.id,
      username: from.username,
      first_name: from.first_name,
      last_name: from.last_name,
    });

    const name = from.first_name || 'Teman';
    const welcomeText = `👋 <b>Selamat datang di TempoGuard, ${escapeHTML(name)}!</b>\n\n` +
      `Platform asisten pengingat tanggal jatuh tempo otomatis untuk:\n` +
      `• 💻 <b>Garansi Gadget & Elektronik</b>\n` +
      `• 🚗 <b>Pajak STNK & SIM Kendaraan</b>\n` +
      `• 📄 <b>Paspor & Dokumen Legalitas</b>\n` +
      `• 🌐 <b>Domain, Server & Langganan</b>\n` +
      `• 🏠 <b>Sewa Rumah & Tagihan Berkala</b>\n\n` +
      `🎁 <b>Akun Free Trial:</b> Anda dapat menyimpan hingga <b>2 item pengingat gratis</b>.\n\n` +
      `Silakan pilih menu di bawah untuk memulai:`;

    await ctx.reply(welcomeText, {
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard(),
    });
  });

  // 2. /help
  bot.command('help', async (ctx) => {
    const helpText = `📖 <b>Panduan Penggunaan TempoGuard Bot</b>\n\n` +
      `<b>Perintah Utama:</b>\n` +
      `• /start - Menampilkan menu utama\n` +
      `• /add - Menambah pengingat baru (Wizard interaktif)\n` +
      `• /list atau /reminders - Melihat seluruh item pengingat aktif\n` +
      `• /profile atau /status - Cek status langganan & sisa kuota\n` +
      `• /subscribe - Berlangganan paket Pro (Unlimited item)\n` +
      `• /redeem <code> - Aktivasi kode voucher voucher\n` +
      `• /export - Download seluruh data reminder Anda (CSV)\n` +
      `• /contact <pesan> - Kirim pesan bantuan ke Admin (Maks 3x/hari)\n\n` +
      `💡 <i>Notifikasi akan otomatis dikirimkan ke chat ini setiap pukul 07:00 WIB saat item mendekati masa jatuh tempo.</i>`;

    await ctx.reply(helpText, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('➕ Tambah Reminder', 'action:add_reminder').text('📋 Lihat Daftar', 'action:list_reminders'),
    });
  });

  // 3. /profile & /status
  bot.command(['profile', 'status'], async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const access = await checkUserAccess(from.id);
    let statusLabel = '';
    let detailStatus = '';

    if (access.state === 'ADMIN') {
      statusLabel = '👑 <b>ADMINISTRATOR</b>';
      detailStatus = 'Akses penuh tanpa batas selamanya.';
    } else if (access.state === 'ACTIVE_SUBSCRIBER') {
      statusLabel = '💎 <b>PRO SUBSCRIBER (Aktif)</b>';
      if (access.daysRemaining === null) {
        detailStatus = 'Masa Aktif: <b>Seumur Hidup (Lifetime) ♾️</b>';
      } else {
        detailStatus = `Masa Aktif: <b>${access.daysRemaining} hari lagi</b> (${formatDateID(access.user.active_until!)})`;
      }
    } else if (access.state === 'FREE_TRIAL') {
      statusLabel = '🎁 <b>FREE TRIAL</b>';
      detailStatus = `Kuota: <b>${access.activeItemCount} / 2 item aktif</b>`;
    } else {
      statusLabel = '⚠️ <b>EXPIRED (Langganan Berakhir)</b>';
      detailStatus = `Anda memiliki <b>${access.activeItemCount} item</b>. Notifikasi otomatis dijeda sampai diperpanjang.`;
    }

    let text = `👤 <b>Profil Pengguna TempoGuard</b>\n\n`;
    text += `Nama: <b>${escapeHTML(from.first_name || 'User')}</b>\n`;
    text += `Telegram ID: <code>${from.id}</code>\n`;
    text += `Status Akun: ${statusLabel}\n`;
    text += `${detailStatus}\n`;

    const keyboard = new InlineKeyboard();
    if (access.state !== 'ACTIVE_SUBSCRIBER' && access.state !== 'ADMIN') {
      keyboard.text('💎 Berlangganan Pro (/subscribe)', 'action:subscribe').row();
    }
    keyboard.text('📋 Lihat Daftar Reminder', 'action:list_reminders');

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // 4. /list & /reminders
  bot.command(['list', 'reminders'], async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const access = await checkUserAccess(from.id);
    const items = await getUserReminders(access.user.id);

    if (items.length === 0) {
      const emptyText = `📭 <b>Belum Ada Pengingat</b>\n\nAnda belum mencatat pengingat apapun.\nKlik tombol di bawah untuk mencatat garansi, STNK, SIM, atau dokumen penting Anda sekarang!`;
      await ctx.reply(emptyText, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('➕ Tambah Reminder Baru', 'action:add_reminder'),
      });
      return;
    }

    let listText = `📋 <b>Daftar Pengingat Anda (${items.length} item)</b>\n`;
    listText += `<i>Diurutkan berdasarkan jatuh tempo terdekat:</i>\n\n`;

    const keyboard = new InlineKeyboard();

    items.forEach((item, index) => {
      const daysLeft = getDaysDifference(item.due_date);
      const urgency = getUrgencyBadge(daysLeft);
      const icon = item.category?.icon || '📌';

      listText += `<b>${index + 1}. ${icon} ${escapeHTML(item.title)}</b>\n`;
      listText += `   📅 ${formatDateID(item.due_date)} (${urgency.badge} <b>${urgency.status}</b>)\n\n`;

      keyboard.text(`${index + 1}. Detail: ${item.title.substring(0, 15)}...`, `action:view:${item.id}`).row();
    });

    keyboard.text('➕ Tambah Reminder', 'action:add_reminder').text('🔄 Refresh', 'action:list_reminders');

    await ctx.reply(listText, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // 5. /add
  bot.command('add', async (ctx) => {
    await ctx.conversation.enter('addReminderWizard');
  });

  // 6. /subscribe
  bot.command('subscribe', async (ctx) => {
    const packages = await getActivePackages();
    if (packages.length === 0) {
      await ctx.reply('⚠️ Saat ini belum ada paket langganan yang tersedia.');
      return;
    }

    let text = `💎 <b>PILIH PAKET LANGGANAN TEMPO GUARD PRO</b>\n\n`;
    text += `Dapatkan akses penuh:\n`;
    text += `✅ <b>Simpan Item Tanpa Batas</b> (Unlimited Reminders)\n`;
    text += `✅ <b>Notifikasi Berulang Lengkap</b> (H-30, H-14, H-7, H-3, H-1, Hari H)\n`;
    text += `✅ <b>Lampirkan Foto Nota & Kartu Garansi</b>\n`;
    text += `✅ <b>Fitur Ekspor CSV & Prioritas</b>\n\n`;
    text += `Silakan pilih paket di bawah ini:`;

    const keyboard = new InlineKeyboard();
    packages.forEach((pkg) => {
      const priceFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(pkg.price);
      const badge = pkg.badge ? ` [${pkg.badge}]` : '';
      keyboard.text(`📦 ${pkg.name} - ${priceFormatted}${badge}`, `action:select_pkg:${pkg.id}`).row();
    });
    keyboard.text('❌ Tutup', 'action:close');

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // 7. /redeem <KODE>
  bot.command('redeem', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const user = await getOrCreateUser({
      id: from.id,
      username: from.username,
      first_name: from.first_name,
      last_name: from.last_name,
    });

    const codeInput = ctx.match?.trim();
    if (!codeInput) {
      await ctx.reply(
        'ℹ️ <b>Format Perintah:</b>\nKetik <code>/redeem KODE_VOUCHER</code>\n\n<i>Contoh: <code>/redeem K7X9PQ2M</code></i>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const result = await redeemCode(codeInput, user.id);
    if (result.success) {
      await ctx.reply(`🎉 <b>Aktivasi Berhasil!</b>\n\n${result.message}\nAkun Anda kini dapat menyimpan reminder tanpa batas.`, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('➕ Tambah Reminder', 'action:add_reminder'),
      });
    } else {
      await ctx.reply(`❌ <b>Gagal:</b> ${result.message}`, { parse_mode: 'HTML' });
    }
  });

  // 8. /export (CSV Data Portability)
  bot.command('export', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const access = await checkUserAccess(from.id);
    const items = await getUserReminders(access.user.id, 500);

    if (items.length === 0) {
      await ctx.reply('📭 Anda belum memiliki data reminder untuk diekspor.');
      return;
    }

    // Format CSV string
    let csvContent = 'ID,Judul,Kategori,Jatuh Tempo,Catatan,Status\n';
    items.forEach((item) => {
      const daysLeft = getDaysDifference(item.due_date);
      const cat = item.category?.name || 'Umum';
      const cleanTitle = `"${(item.title || '').replace(/"/g, '""')}"`;
      const cleanNotes = `"${(item.notes || '').replace(/"/g, '""')}"`;
      csvContent += `${item.id},${cleanTitle},"${cat}",${item.due_date},${cleanNotes},"${daysLeft >= 0 ? `${daysLeft} hari lagi` : 'Expired'}"\n`;
    });

    const buffer = Buffer.from(csvContent, 'utf-8');
    await ctx.replyWithDocument(
      new InputFile(buffer, `TempoGuard_Reminders_${from.id}.csv`),
      { caption: `📄 <b>Export Data Selesai!</b>\nTotal ${items.length} item reminder berhasil diekspor.`, parse_mode: 'HTML' }
    );
  });

  // 9. /contact <pesan> (Daily Quota Protected Support Channel)
  bot.command('contact', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const messageText = ctx.match?.trim();
    if (!messageText) {
      await ctx.reply(
        'ℹ️ <b>Kirim Pesan ke Admin:</b>\nKetik <code>/contact pesan atau pertanyaan Anda</code>\n\n<i>Contoh: <code>/contact Halo min, mau tanya cara perpanjang STNK 5 tahunan</code></i>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Cek batas harian 3 pesan / 24 jam
    const allowed = checkAndConsumeContactQuota(from.id);
    if (!allowed) {
      await ctx.reply(
        '⚠️ <b>Batas Harian Tercapai:</b>\nAnda telah mengirim 3 pesan bantuan hari ini. Mohon tunggu balasan dari admin atau kirim kembali besok.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Teruskan pesan ke Admin Bot
    try {
      const adminBot = new Bot(env.BOT_TOKEN_ADMIN);
      const report = `📩 <b>Pesan Bantuan Pengguna Baru!</b>\n\n` +
        `👤 <b>Dari:</b> ${escapeHTML(from.first_name || 'User')} (@${from.username || 'tanpa_username'})\n` +
        `🆔 <b>Telegram ID:</b> <code>${from.id}</code>\n\n` +
        `💬 <b>Isi Pesan:</b>\n<blockquote>${escapeHTML(messageText)}</blockquote>\n\n` +
        `💡 <i>Balas langsung dengan: <code>/reply ${from.id} pesan balasan</code></i>`;

      // Kirim ke admin utama atau channel admin
      const { data: admins } = await supabase.from('users').select('telegram_id').eq('is_admin', true);
      if (admins && admins.length > 0) {
        for (const adm of admins) {
          await adminBot.api.sendMessage(adm.telegram_id, report, { parse_mode: 'HTML' });
        }
      }

      await ctx.reply('✅ <b>Pesan Berhasil Terkirim!</b>\nTim admin kami telah menerima pesan Anda dan akan membalas secepatnya.', { parse_mode: 'HTML' });
    } catch (err) {
      console.error('Error forwarding contact message to admin:', err);
      await ctx.reply('⚠️ Terjadi kendala saat mengirim pesan ke admin. Silakan coba lagi nanti.');
    }
  });

  // 10. Master Admin Code Detection on Raw Text
  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (text === env.ADMIN_MASTER_CODE) {
      const from = ctx.from;
      if (!from) return;
      await promoteToAdmin(from.id);
      await ctx.reply(
        '🎉 <b>Selamat! Anda telah terverifikasi sebagai Admin Seumur Hidup!</b>\n\n👑 Buka <b>Admin Bot</b> dan ketik <code>/start</code> untuk mengakses panel manajemen sistem.',
        { parse_mode: 'HTML' }
      );
      return;
    }
    return next();
  });
}
