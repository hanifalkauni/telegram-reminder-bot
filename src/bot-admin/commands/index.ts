import { Bot, Context, InlineKeyboard } from 'grammy';
import { supabase } from '../../db/supabase.js';
import {
  createConfirmationCode,
  extendUserByTelegramId,
  getActivePackages,
  getActivePaymentMethods
} from '../../services/subscriptionService.js';
import { promoteToAdmin } from '../../services/accessControl.js';
import { env } from '../../config/env.js';
import { escapeHTML } from '../../utils/telegramHelper.js';
import { formatDateID } from '../../utils/dateHelper.js';

export function registerAdminCommands(bot: Bot<Context>): void {
  // 1. /start
  bot.command('start', async (ctx) => {
    const text = `👑 <b>PANEL ADMINISTRATOR TEMPO GUARD</b>\n\n` +
      `Selamat datang di Bot Kontrol Bisnis & Manajemen Sistem.\n\n` +
      `<b>Perintah Manajemen Bisnis:</b>\n` +
      `• /admin_stats - Ringkasan statistik & metrik SaaS\n` +
      `• /users - Daftar 20 pengguna terbaru\n` +
      `• /extend &lt;id&gt; &lt;hari&gt; - Perpanjang manual (0 = Lifetime)\n` +
      `• /reply &lt;id&gt; &lt;pesan&gt; - Balas pesan bantuan pengguna\n` +
      `• /broadcast &lt;pesan&gt; - Kirim pengumuman ke semua user\n\n` +
      `<b>Perintah Paket & Pembayaran:</b>\n` +
      `• /packages - Lihat paket langganan\n` +
      `• /add_package Nama | Hari | Harga | [Badge]\n` +
      `• /delete_package &lt;id&gt;\n` +
      `• /payments - Lihat daftar rekening & QRIS\n` +
      `• /add_payment Bank | NoRek | AtasNama\n` +
      `• /add_qris Nama | AtasNama (Kirim foto dengan caption)\n` +
      `• /delete_payment &lt;id&gt;\n\n` +
      `<b>Perintah Voucher:</b>\n` +
      `• /generate_code &lt;hari&gt; (Contoh: /generate_code 365)`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // 2. /admin_stats (SaaS Business Metrics)
  bot.command('admin_stats', async (ctx) => {
    const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: activeSubs } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_activated', true);
    const { count: totalReminders } = await supabase.from('reminder_items').select('*', { count: 'exact', head: true }).eq('is_completed', false);
    const { count: totalLogs } = await supabase.from('reminder_delivery_logs').select('*', { count: 'exact', head: true }).eq('status', 'SENT');

    const trialUsers = (totalUsers || 0) - (activeSubs || 0);
    const conversionRate = totalUsers && totalUsers > 0 ? (((activeSubs || 0) / totalUsers) * 100).toFixed(1) : '0';

    let statsText = `📊 <b>METRIK BISNIS & SISTEM TEMPO GUARD</b>\n\n`;
    statsText += `👥 <b>Total Pengguna Terdaftar:</b> ${totalUsers || 0} akun\n`;
    statsText += `💎 <b>Active Subscribers (Pro):</b> ${activeSubs || 0} akun\n`;
    statsText += `🎁 <b>Free Trial / Non-Active:</b> ${trialUsers} akun\n`;
    statsText += `📈 <b>Conversion Rate:</b> <b>${conversionRate}%</b>\n\n`;
    statsText += `📌 <b>Total Reminder Aktif:</b> ${totalReminders || 0} item\n`;
    statsText += `🚀 <b>Total Notifikasi Terkirim:</b> ${totalLogs || 0} alert\n`;

    await ctx.reply(statsText, { parse_mode: 'HTML' });
  });

  // 3. /users
  bot.command('users', async (ctx) => {
    const { data: users } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!users || users.length === 0) {
      await ctx.reply('📭 Belum ada pengguna.');
      return;
    }

    let text = `👥 <b>20 PENGGUNA TERBARU</b>\n\n`;
    users.forEach((u, i) => {
      const status = u.is_admin ? '👑 Admin' : u.is_activated ? '💎 Pro' : '🎁 Trial';
      const name = u.first_name || 'User';
      const username = u.username ? `@${u.username}` : '-';
      text += `${i + 1}. <b>${escapeHTML(name)}</b> (${username}) [${status}]\n`;
      text += `   ID: <code>${u.telegram_id}</code> | Exp: ${u.active_until ? formatDateID(u.active_until) : 'Lifetime'}\n\n`;
    });

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // 4. /extend <telegram_id> <days>
  bot.command('extend', async (ctx) => {
    const args = ctx.match?.trim().split(/\s+/);
    if (!args || args.length < 2) {
      await ctx.reply('ℹ️ <b>Format:</b> <code>/extend &lt;telegram_id&gt; &lt;jumlah_hari&gt;</code>\nContoh: <code>/extend 953744593 30</code> (Gunakan 0 untuk Lifetime)', { parse_mode: 'HTML' });
      return;
    }

    const targetTelegramId = parseInt(args[0], 10);
    const durationDays = parseInt(args[1], 10);

    if (isNaN(targetTelegramId) || isNaN(durationDays)) {
      await ctx.reply('⚠️ Telegram ID atau jumlah hari harus berupa angka.');
      return;
    }

    const updated = await extendUserByTelegramId(targetTelegramId, durationDays);
    if (!updated) {
      await ctx.reply('❌ Gagal memperpanjang user. Pastikan Telegram ID sudah terdaftar di bot.');
      return;
    }

    // Kirim notifikasi ke user via User Bot
    try {
      const userBot = new Bot(env.BOT_TOKEN_USER);
      const msg = `🎉 <b>Selamat! Akun Anda telah diperpanjang oleh Admin!</b>\n\nMasa aktif baru: <b>${durationDays === 0 ? 'Seumur Hidup (Lifetime) ♾️' : `${durationDays} Hari`}</b>`;
      await userBot.api.sendMessage(targetTelegramId, msg, { parse_mode: 'HTML' });
    } catch (e) {
      console.warn('Could not notify user:', e);
    }

    await ctx.reply(`✅ <b>Berhasil!</b> User <code>${targetTelegramId}</code> telah diperpanjang ${durationDays === 0 ? 'Lifetime' : `${durationDays} hari`}.`, { parse_mode: 'HTML' });
  });

  // 5. /generate_code <days>
  bot.command('generate_code', async (ctx) => {
    const arg = ctx.match?.trim();
    const durationDays = arg ? parseInt(arg, 10) : 30;

    if (isNaN(durationDays)) {
      await ctx.reply('ℹ️ <b>Format:</b> <code>/generate_code &lt;jumlah_hari&gt;</code>\nContoh: <code>/generate_code 365</code> atau <code>/generate_code 0</code> untuk Lifetime', { parse_mode: 'HTML' });
      return;
    }

    try {
      const code = await createConfirmationCode(durationDays);
      const typeStr = durationDays === 0 ? 'Lifetime (Akses Seumur Hidup)' : `${durationDays} Hari`;
      const text = `🎟️ <b>KODE VOUCHER BERHASIL DIBUAT!</b>\n\n` +
        `🔑 Kode: <code>${code}</code>\n` +
        `⏳ Durasi: <b>${typeStr}</b>\n\n` +
        `💡 <i>Berikan kode ini kepada pembeli untuk di-redeem via /redeem ${code}</i>`;

      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (err: unknown) {
      await ctx.reply(`❌ Gagal membuat kode: ${(err as Error).message}`);
    }
  });

  // 6. /reply <telegram_id> <pesan>
  bot.command('reply', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply('ℹ️ <b>Format:</b> <code>/reply &lt;telegram_id&gt; pesan balasan Anda</code>', { parse_mode: 'HTML' });
      return;
    }

    const firstSpaceIndex = raw.indexOf(' ');
    if (firstSpaceIndex === -1) {
      await ctx.reply('⚠️ Mohon sertakan pesan balasan.');
      return;
    }

    const targetTelegramId = parseInt(raw.substring(0, firstSpaceIndex), 10);
    const replyMessage = raw.substring(firstSpaceIndex + 1).trim();

    if (isNaN(targetTelegramId) || !replyMessage) {
      await ctx.reply('⚠️ Telegram ID tidak valid atau pesan kosong.');
      return;
    }

    try {
      const userBot = new Bot(env.BOT_TOKEN_USER);
      const userText = `💬 <b>Pesan Balasan dari Admin TempoGuard:</b>\n\n${escapeHTML(replyMessage)}`;
      await userBot.api.sendMessage(targetTelegramId, userText, { parse_mode: 'HTML' });
      await ctx.reply(`✅ Balasan berhasil dikirimkan ke <code>${targetTelegramId}</code>.`, { parse_mode: 'HTML' });
    } catch (err: unknown) {
      await ctx.reply(`❌ Gagal mengirim pesan ke user: ${(err as Error).message}`);
    }
  });

  // 7. /broadcast <pesan>
  bot.command('broadcast', async (ctx) => {
    const msg = ctx.match?.trim();
    if (!msg) {
      await ctx.reply('ℹ️ <b>Format:</b> <code>/broadcast pesan pengumuman</code>', { parse_mode: 'HTML' });
      return;
    }

    const { data: users } = await supabase.from('users').select('telegram_id');
    if (!users || users.length === 0) {
      await ctx.reply('📭 Tidak ada pengguna untuk dibroadcast.');
      return;
    }

    await ctx.reply(`📢 Memulai pengiriman broadcast ke ${users.length} pengguna...`);
    const userBot = new Bot(env.BOT_TOKEN_USER);
    let success = 0;
    let failed = 0;

    for (const u of users) {
      try {
        await userBot.api.sendMessage(u.telegram_id, `📢 <b>PENGUMUMAN RESMI TEMPO GUARD</b>\n\n${escapeHTML(msg)}`, { parse_mode: 'HTML' });
        success++;
        await new Promise((r) => setTimeout(r, 40));
      } catch {
        failed++;
      }
    }

    await ctx.reply(`✅ <b>Broadcast Selesai!</b>\nBerhasil: ${success}\nGagal (bot diblokir/error): ${failed}`, { parse_mode: 'HTML' });
  });

  // 8. /packages
  bot.command('packages', async (ctx) => {
    const pkgs = await getActivePackages();
    let text = `📦 <b>DAFTAR PAKET BERLANGGANAN AKTIF</b>\n\n`;
    pkgs.forEach((p) => {
      text += `ID [${p.id}] <b>${p.name}</b>\n` +
        `• Durasi: ${p.duration_days === 0 ? 'Lifetime' : `${p.duration_days} Hari`} | Harga: Rp ${p.price}\n` +
        `• Badge: ${p.badge || '-'}\n\n`;
    });
    text += `Tambah baru: <code>/add_package Nama | Hari | Harga | Badge</code>\nHapus: <code>/delete_package &lt;id&gt;</code>`;
    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // 9. /add_package Nama | Durasi | Harga | Badge
  bot.command('add_package', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply('ℹ️ <b>Format:</b> <code>/add_package Paket 6 Bulan | 180 | 50000 | Hemat 20%</code>', { parse_mode: 'HTML' });
      return;
    }

    const parts = raw.split('|').map((s) => s.trim());
    if (parts.length < 3) {
      await ctx.reply('⚠️ Format salah. Minimal: Nama | DurasiHari | Harga');
      return;
    }

    const name = parts[0];
    const duration_days = parseInt(parts[1], 10);
    const price = parseFloat(parts[2]);
    const badge = parts[3] || null;

    const { error } = await supabase.from('subscription_packages').insert({
      name,
      duration_days,
      price,
      badge,
      is_active: true,
    });

    if (error) {
      await ctx.reply(`❌ Gagal menambah paket: ${error.message}`);
    } else {
      await ctx.reply(`✅ Paket <b>${escapeHTML(name)}</b> berhasil ditambahkan!`, { parse_mode: 'HTML' });
    }
  });

  // 10. /delete_package <id>
  bot.command('delete_package', async (ctx) => {
    const id = parseInt(ctx.match?.trim() || '', 10);
    if (isNaN(id)) {
      await ctx.reply('ℹ️ <b>Format:</b> <code>/delete_package &lt;id&gt;</code>', { parse_mode: 'HTML' });
      return;
    }

    const { error } = await supabase.from('subscription_packages').delete().eq('id', id);
    if (error) {
      await ctx.reply(`❌ Gagal menghapus paket: ${error.message}`);
    } else {
      await ctx.reply(`✅ Paket ID ${id} berhasil dihapus.`);
    }
  });

  // 11. /payments
  bot.command('payments', async (ctx) => {
    const methods = await getActivePaymentMethods();
    let text = `💳 <b>DAFTAR METODE PEMBAYARAN AKTIF</b>\n\n`;
    methods.forEach((m) => {
      text += `ID [${m.id}] <b>${m.name}</b>\n` +
        `• No. Rekening/ID: <code>${m.account_number || '-'}</code>\n` +
        `• Atas Nama: ${m.account_name || '-'}\n\n`;
    });
    text += `Tambah Rekening: <code>/add_payment Bank | NoRek | AtasNama</code>\nHapus: <code>/delete_payment &lt;id&gt;</code>`;
    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // 12. /add_payment Bank | NoRek | AtasNama
  bot.command('add_payment', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw) {
      await ctx.reply('ℹ️ <b>Format:</b> <code>/add_payment Bank Mandiri | 1234567890 | a.n. TempoGuard</code>', { parse_mode: 'HTML' });
      return;
    }

    const parts = raw.split('|').map((s) => s.trim());
    if (parts.length < 3) {
      await ctx.reply('⚠️ Format salah. Minimal: Nama Bank | NoRek | AtasNama');
      return;
    }

    const { error } = await supabase.from('payment_methods').insert({
      name: parts[0],
      account_number: parts[1],
      account_name: parts[2],
      is_active: true,
    });

    if (error) {
      await ctx.reply(`❌ Gagal menambah rekening: ${error.message}`);
    } else {
      await ctx.reply(`✅ Rekening <b>${escapeHTML(parts[0])}</b> berhasil ditambahkan!`, { parse_mode: 'HTML' });
    }
  });

  // 13. /delete_payment <id>
  bot.command('delete_payment', async (ctx) => {
    const id = parseInt(ctx.match?.trim() || '', 10);
    if (isNaN(id)) {
      await ctx.reply('ℹ️ <b>Format:</b> <code>/delete_payment &lt;id&gt;</code>', { parse_mode: 'HTML' });
      return;
    }

    const { error } = await supabase.from('payment_methods').delete().eq('id', id);
    if (error) {
      await ctx.reply(`❌ Gagal menghapus metode: ${error.message}`);
    } else {
      await ctx.reply(`✅ Metode pembayaran ID ${id} berhasil dihapus.`);
    }
  });

  // 14. Master Admin Code Detection on Raw Text
  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (text === env.ADMIN_MASTER_CODE) {
      const from = ctx.from;
      if (!from) return;
      await promoteToAdmin(from.id);
      await ctx.reply(
        '🎉 <b>Selamat! Anda telah terverifikasi sebagai Admin Seumur Hidup!</b>\n\nKetik <code>/start</code> untuk melihat seluruh perintah panel admin.',
        { parse_mode: 'HTML' }
      );
      return;
    }
    return next();
  });
}
