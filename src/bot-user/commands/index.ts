import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { UserBotContext } from '../conversations/addReminderWizard.js';
import { getOrCreateUser, checkUserAccess, promoteToAdmin } from '../../services/accessControl.js';
import { getUserReminders, getMonthlyAgenda } from '../../services/reminderService.js';
import { getActivePackages, getActivePaymentMethods, redeemCode } from '../../services/subscriptionService.js';
import { checkAndConsumeContactQuota } from '../../middlewares/rateLimiter.js';
import { formatDateID, getDaysDifference, getUrgencyBadge } from '../../utils/dateHelper.js';
import { escapeHTML, getMainMenuKeyboard } from '../../utils/telegramHelper.js';
import { ReminderItemRecord } from '../../types/database.js';
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
    const welcomeText = `👋 <b>Selamat datang di Ingatin, ${escapeHTML(name)}!</b>\n\n` +
      `Platform asisten pengingat tanggal jatuh tempo otomatis untuk:\n` +
      `• 🎂 <b>Ulang Tahun & Anniversary</b> (Perulangan Tahunan)\n` +
      `• 🚗 <b>Pajak STNK & SIM Kendaraan</b> (1 Thn / 5 Thn)\n` +
      `• 🛠️ <b>Servis AC, Kendaraan & Rumah</b> (Tiap 3/6 Bln)\n` +
      `• 🕊️ <b>Ibadah, Donasi & Hari Keagamaan</b> (Semua Agama)\n` +
      `• 💊 <b>Kesehatan, Obat & Perawatan</b>\n` +
      `• 💳 <b>Kartu ATM, Finansial & Tagihan</b> (Bulanan/Tahunan)\n` +
      `• 👔 <b>Karier, Pajak SPT & Kontrak Kerja</b>\n` +
      `• 🎓 <b>Pendidikan, SPP & UKT Kuliah</b>\n` +
      `• 💻 <b>Garansi Gadget & Elektronik</b>\n` +
      `• 📄 <b>Paspor, Visa & Lisensi Profesi</b>\n` +
      `• ✈️ <b>Travel, Visa & Poin/Miles</b>\n` +
      `• 🌐 <b>Domain, Hosting & Subscription</b>\n` +
      `• 🏠 <b>Sewa Rumah, Kos & Tagihan</b>\n` +
      `• 🪴 <b>Tanaman & Perawatan Kebun</b>\n` +
      `• 🐾 <b>Perawatan Hewan Peliharaan</b>\n\n` +
      `🎁 <b>Akun Free Trial:</b> Anda dapat menyimpan hingga <b>2 item pengingat gratis</b>.\n\n` +
      `Silakan pilih menu di bawah untuk memulai:`;

    await ctx.reply(welcomeText, {
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard(),
    });
  });

  // 2. /about & /tentang & /info
  bot.command(['about', 'tentang', 'info'], async (ctx) => {
    const aboutText = `⏰ <b>Tentang Ingatin Bot (@IngatinBot)</b>\n\n` +
      `<b>Ingatin</b> adalah asisten pintar Telegram untuk memantau tanggal jatuh tempo dokumen, STNK, SIM, garansi, tagihan, servis berkala, dan hari spesial Anda secara otomatis.\n\n` +
      `🔔 <b>Waktu Notifikasi Harian:</b>\n` +
      `Pengingat otomatis dikirimkan setiap hari tepat pukul <b>07:00 WIB</b>.\n\n` +
      `📅 <b>Standar Jadwal Pengingat per Kategori:</b>\n\n` +
      `🚗 <b>Pajak STNK & SIM Kendaraan</b>\n` +
      `└ <code>H-30, H-14, H-7, H-3, H-1, Hari H</code>\n\n` +
      `🎂 <b>Ulang Tahun & Hari Spesial</b>\n` +
      `└ <code>H-14, H-7, H-3, H-1, Hari H</code>\n\n` +
      `💻 <b>Masa Garansi Gadget & Elektronik</b>\n` +
      `└ <code>H-30, H-14, H-7, H-1, Hari H</code>\n\n` +
      `📄 <b>Paspor, Visa & Lisensi Legal</b>\n` +
      `└ <code>H-60, H-30, H-14, H-7, Hari H</code>\n\n` +
      `💳 <b>Tagihan, Kos & Kartu ATM</b>\n` +
      `└ <code>H-7, H-3, H-1, Hari H</code>\n\n` +
      `🛠️ <b>Servis AC, Ganti Oli & Rumah</b>\n` +
      `└ <code>H-14, H-7, H-3, H-1, Hari H</code>\n\n` +
      `🕊️ <b>Ibadah, Donasi & Hari Keagamaan</b>\n` +
      `└ <code>H-14, H-7, H-3, H-1, Hari H</code>\n\n` +
      `🏥 <b>Polis Asuransi & Kesehatan</b>\n` +
      `└ <code>H-30, H-14, H-7, H-1, Hari H</code>\n\n` +
      `🔒 <b>Privasi & Keamanan:</b>\n` +
      `Data pengingat Anda tersimpan secara privat khusus untuk akun Telegram Anda dan tidak pernah dibagikan kepada pihak ketiga.`;

    await ctx.reply(aboutText, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('➕ Mulai Tambah Reminder', 'action:add_reminder')
        .text('🏠 Menu Utama', 'action:main_menu'),
    });
  });

  // 3. /help
  bot.command('help', async (ctx) => {
    const helpText = `📖 <b>Panduan Penggunaan Ingatin Bot</b>\n\n` +
      `<b>Perintah Utama:</b>\n` +
      `• /start - Menampilkan menu utama\n` +
      `• /add - Menambah pengingat baru (Wizard interaktif)\n` +
      `• /list atau /reminders - Melihat seluruh item pengingat aktif\n` +
      `• /agenda atau /upcoming - Rekap agenda & estimasi biaya bulan ini\n` +
      `• /profile atau /status - Cek status langganan & sisa kuota\n` +
      `• /about - Info detail fungsi bot & jadwal pengingat per kategori\n` +
      `• /subscribe - Berlangganan paket Pro (Unlimited item)\n` +
      `• /redeem [kode] - Aktivasi kode voucher\n` +
      `• /export - Download seluruh data reminder Anda (CSV)\n` +
      `• /contact [pesan] - Kirim pesan bantuan ke Admin (Maks 3x/hari)\n` +
      `• /cancel atau /batal - Membatalkan proses yang sedang berjalan\n\n` +
      `💡 <i>Notifikasi akan otomatis dikirimkan ke chat ini setiap pukul 07:00 WIB saat item mendekati masa jatuh tempo.</i>`;

    await ctx.reply(helpText, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('➕ Tambah Reminder', 'action:add_reminder')
        .text('📅 Agenda Bulan Ini', 'action:monthly_agenda')
        .row()
        .text('📋 Lihat Daftar', 'action:list_reminders'),
    });
  });

  // 3. /agenda & /upcoming (Monthly Agenda & Budget Recap)
  bot.command(['agenda', 'upcoming'], async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const access = await checkUserAccess(from.id);
    const agenda = await getMonthlyAgenda(access.user.id);

    let text = `📅 <b>Agenda & Jadwal Jatuh Tempo: ${agenda.monthName} ${agenda.yearNum}</b>\n\n`;

    if (agenda.items.length === 0) {
      text += `🎉 <i>Tidak ada item yang jatuh tempo pada bulan ${agenda.monthName} ${agenda.yearNum}!</i>\n\n` +
        `Semua urusan Anda bulan ini aman terkendali.`;
      await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('➕ Tambah Reminder Baru', 'action:add_reminder'),
      });
      return;
    }

    const keyboard = new InlineKeyboard();

    agenda.items.forEach((item: ReminderItemRecord, index: number) => {
      const daysLeft = getDaysDifference(item.due_date);
      const icon = item.category?.icon || '📌';
      text += `<b>${index + 1}. ${icon} ${escapeHTML(item.title)}</b>\n`;
      text += `   📅 ${formatDateID(item.due_date)} (${daysLeft >= 0 ? `${daysLeft} hari lagi` : 'Lewat'})\n`;
      if (item.estimated_cost && Number(item.estimated_cost) > 0) {
        const costStr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(item.estimated_cost));
        text += `   💵 Biaya: <b>${costStr}</b>\n`;
      }
      text += `\n`;
      keyboard.text(`${index + 1}. ${item.title.substring(0, 16)}`, `action:view:${item.id}`).row();
    });

    if (agenda.totalEstimatedCost > 0) {
      const totalCostFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(agenda.totalEstimatedCost);
      text += `💰 <b>Total Estimasi Dana yang Perlu Disiapkan Bulan Ini:</b>\n` +
        `👉 <b>${totalCostFormatted}</b>\n\n`;
    }

    keyboard.text('➕ Tambah Reminder', 'action:add_reminder');

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
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

    let text = `👤 <b>Profil Pengguna Ingatin</b>\n\n`;
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

    let text = `💎 <b>PILIH PAKET LANGGANAN INGATIN PRO</b>\n\n`;
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
      ctx.session.awaitingRedeemCode = true;
      await ctx.reply(
        '🎟️ <b>Aktivasi Voucher Langganan Ingatin</b>\n\n' +
          'Silakan kirimkan <b>kode voucher</b> Anda (Contoh: <code>PYLFKHHD</code>):\n\n' +
          '<i>(Ketik langsung kode voucher di chat ini atau balas pesan ini)</i>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    ctx.session.awaitingRedeemCode = false;
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

  // 8. /export (CSV Data Export)
  bot.command('export', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const access = await checkUserAccess(from.id);
    const { data: items } = await supabase
      .from('reminder_items')
      .select('*, category:categories(*)')
      .eq('user_id', access.user.id)
      .order('due_date', { ascending: true });

    if (!items || items.length === 0) {
      await ctx.reply('📭 Anda belum memiliki data reminder untuk diekspor.');
      return;
    }

    // Buat CSV string
    let csvContent = 'ID,Judul,Kategori,Jatuh Tempo,Estimasi Biaya,Perulangan,Catatan,Dibuat Pada\n';
    items.forEach((item) => {
      const catName = item.category?.name || 'Umum';
      const cost = item.estimated_cost || 0;
      const rec = item.recurring_type || 'NONE';
      const notes = (item.notes || '').replace(/"/g, '""');
      csvContent += `"${item.id}","${item.title.replace(/"/g, '""')}","${catName}","${item.due_date}","${cost}","${rec}","${notes}","${item.created_at}"\n`;
    });

    const buffer = Buffer.from(csvContent, 'utf-8');
    await ctx.replyWithDocument(
      new InputFile(buffer, `Ingatin_Reminders_${from.id}.csv`),
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

  // 10. /cancel & /batal (Batalkan percakapan/wizard yang sedang aktif)
  bot.command(['cancel', 'batal'], async (ctx) => {
    await ctx.conversation.exit();
    await ctx.reply('❌ <b>Tidak ada proses yang sedang berjalan atau proses telah dibatalkan.</b>\n\nKetik /start untuk melihat menu utama atau /add untuk mencatat reminder baru.', {
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard(),
    });
  });

  // 11. Master Admin Code Detection on Raw Text
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
