import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { UserBotContext } from '../conversations/addReminderWizard.js';
import { checkUserAccess, getOrCreateUser } from '../../services/accessControl.js';
import {
  getReminderById,
  deleteReminder,
  renewReminderDate,
  renewReminderByMonths,
  snoozeReminder,
  getMonthlyAgenda
} from '../../services/reminderService.js';
import {
  getActivePackages,
  getActivePaymentMethods,
  redeemCode
} from '../../services/subscriptionService.js';
import { notifyAdminsOnError } from '../../services/errorAlertService.js';
import { supabase } from '../../db/supabase.js';
import { env } from '../../config/env.js';
import { formatDateID, getDaysDifference } from '../../utils/dateHelper.js';
import {
  escapeHTML,
  formatReminderItemCard,
  getMainMenuKeyboard,
  generateGoogleCalendarUrl
} from '../../utils/telegramHelper.js';
import { ReminderItemRecord } from '../../types/database.js';

export function registerUserHandlers(bot: Bot<UserBotContext>): void {
  // 1. Menu Navigations
  bot.callbackQuery('action:add_reminder', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.conversation.enter('addReminderWizard');
  });

  bot.callbackQuery('action:list_reminders', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    const from = ctx.from;
    if (!from) return;

    const access = await checkUserAccess(from.id);
    const { data: items } = await supabase
      .from('reminder_items')
      .select('*, category:categories(*)')
      .eq('user_id', access.user.id)
      .eq('is_completed', false)
      .order('due_date', { ascending: true });

    if (!items || items.length === 0) {
      await ctx.reply('📭 Anda belum memiliki data reminder aktif.', {
        reply_markup: new InlineKeyboard().text('➕ Tambah Reminder', 'action:add_reminder'),
      });
      return;
    }

    let text = `📋 <b>Daftar Pengingat Anda (${items.length} item)</b>\n\n`;
    const keyboard = new InlineKeyboard();

    items.forEach((item, index) => {
      const daysLeft = getDaysDifference(item.due_date);
      const icon = item.category?.icon || '📌';
      text += `<b>${index + 1}. ${icon} ${escapeHTML(item.title)}</b>\n`;
      text += `   📅 ${formatDateID(item.due_date)} (${daysLeft >= 0 ? `${daysLeft} hari lagi` : 'Expired'})\n\n`;
      keyboard.text(`${index + 1}. ${item.title.substring(0, 18)}`, `action:view:${item.id}`).row();
    });

    keyboard.text('➕ Tambah Reminder', 'action:add_reminder');

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Monthly Agenda Handler
  bot.callbackQuery('action:monthly_agenda', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
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
      text += `💰 <b>Total Estimasi Dana Bulan Ini:</b>\n` +
        `👉 <b>${totalCostFormatted}</b>\n\n`;
    }

    keyboard.text('➕ Tambah Reminder', 'action:add_reminder');

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('action:profile', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    const from = ctx.from;
    if (!from) return;

    const access = await checkUserAccess(from.id);
    let statusText = access.state === 'ADMIN' ? '👑 Admin' : access.state === 'ACTIVE_SUBSCRIBER' ? '💎 Pro Subscriber' : access.state === 'FREE_TRIAL' ? '🎁 Free Trial' : '⚠️ Expired';

    let text = `👤 <b>Profil Pengguna</b>\n\n`;
    text += `Nama: <b>${escapeHTML(from.first_name || 'User')}</b>\n`;
    text += `Status: <b>${statusText}</b>\n`;
    text += `Item Tersimpan: <b>${access.activeItemCount} item</b>\n`;
    if (access.daysRemaining !== null) {
      text += `Masa Aktif: <b>${access.daysRemaining} hari</b>\n`;
    }

    const keyboard = new InlineKeyboard();
    if (access.state !== 'ACTIVE_SUBSCRIBER' && access.state !== 'ADMIN') {
      keyboard.text('💎 Berlangganan Pro', 'action:subscribe').row();
    }
    keyboard.text('🔙 Menu Utama', 'action:main_menu');

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('action:main_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.reply('🏠 <b>Menu Utama Ingatin</b>', {
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard(),
    });
  });

  bot.callbackQuery('action:help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.reply(
      '📖 <b>Bantuan & Panduan Cepat:</b>\n\n• Ketik /add untuk mencatat item baru\n• Ketik /list untuk melihat reminder\n• Ketik /agenda untuk rekap bulanan\n• Ketik /about untuk info interval notifikasi\n• Ketik /subscribe untuk upgrade kuota',
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('➕ Tambah Item', 'action:add_reminder')
          .text('ℹ️ Tentang & Jadwal (/about)', 'action:about'),
      }
    );
  });

  bot.callbackQuery('action:about', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
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

  bot.callbackQuery('action:subscribe', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    const packages = await getActivePackages();

    let text = `💎 <b>PILIH PAKET BERLANGGANAN</b>\n\nSilakan tentukan paket yang Anda inginkan:`;
    const keyboard = new InlineKeyboard();

    packages.forEach((pkg) => {
      const priceStr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(pkg.price);
      const badge = pkg.badge ? ` (${pkg.badge})` : '';
      keyboard.text(`📦 ${pkg.name} - ${priceStr}${badge}`, `action:select_pkg:${pkg.id}`).row();
    });
    keyboard.text('❌ Batal', 'action:close');

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // 2. Pilih Paket & Tampilkan Invoice
  bot.callbackQuery(/^action:select_pkg:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    const pkgId = parseInt(ctx.match[1], 10);
    const packages = await getActivePackages();
    const selectedPkg = packages.find((p) => p.id === pkgId);

    if (!selectedPkg) {
      await ctx.reply('⚠️ Paket tidak ditemukan.');
      return;
    }

    // Simpan paket yang dipilih ke session
    ctx.session.selectedPackageId = selectedPkg.id;
    ctx.session.selectedPackageName = selectedPkg.name;
    ctx.session.selectedPackageDuration = selectedPkg.duration_days;
    ctx.session.selectedPackagePrice = Number(selectedPkg.price);

    const methods = await getActivePaymentMethods();
    const priceFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(selectedPkg.price);

    let invoiceText = `🧾 <b>INVOICE PEMBAYARAN LANGGANAN</b>\n\n`;
    invoiceText += `📦 <b>Paket:</b> ${escapeHTML(selectedPkg.name)}\n`;
    invoiceText += `💰 <b>Total Tagihan:</b> <b>${priceFormatted}</b>\n`;
    invoiceText += `⏳ <b>Durasi:</b> ${selectedPkg.duration_days === 0 ? 'Seumur Hidup (Lifetime) ♾️' : `${selectedPkg.duration_days} Hari`}\n\n`;
    invoiceText += `<b>PILIHAN METODE PEMBAYARAN:</b>\n`;

    let qrisMethod = methods.find((m) => m.name.toLowerCase().includes('qris'));
    methods.forEach((m, idx) => {
      invoiceText += `${idx + 1}. <b>${escapeHTML(m.name)}</b>: <code>${escapeHTML(m.account_number || '-')}</code> (a.n. ${escapeHTML(m.account_name || '-')})\n`;
    });

    invoiceText += `\n📌 <b>Cara Konfirmasi:</b>\n` +
      `1. Lakukan transfer sesuai nominal di atas.\n` +
      `2. Kirimkan <b>foto / screenshot bukti transfer</b> ke chat ini.\n` +
      `3. Tim admin akan memverifikasi dan mengaktifkan akun Anda secara instan!`;

    if (qrisMethod?.image_url) {
      try {
        await ctx.replyWithPhoto(qrisMethod.image_url, {
          caption: invoiceText,
          parse_mode: 'HTML',
        });
        return;
      } catch {
        // Fallback to text if photo fails
      }
    }

    await ctx.reply(invoiceText, { parse_mode: 'HTML' });
  });

  // 3. Detail Item & Actions (View, Delete, Quick Renew, Snooze)
  bot.callbackQuery(/^action:view:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    const reminderId = parseInt(ctx.match[1], 10);
    const from = ctx.from;
    if (!from) return;

    const access = await checkUserAccess(from.id);
    const item = await getReminderById(reminderId, access.user.id);

    if (!item) {
      await ctx.reply('⚠️ Item pengingat tidak ditemukan.');
      return;
    }

    const card = formatReminderItemCard(item);
    const gcalUrl = generateGoogleCalendarUrl(item.title, item.due_date, item.notes);

    const keyboard = new InlineKeyboard()
      .url('📅 Simpan ke Google Calendar', gcalUrl)
      .row()
      .text('➕ +1 Bln', `action:renew_months:${item.id}:1`)
      .text('➕ +3 Bln', `action:renew_months:${item.id}:3`)
      .text('➕ +6 Bln', `action:renew_months:${item.id}:6`)
      .text('➕ +1 Thn', `action:renew_months:${item.id}:12`)
      .text('➕ +5 Thn', `action:renew_months:${item.id}:60`)
      .row()
      .text('⏸️ Snooze (+7 Hari)', `action:snooze:${item.id}`)
      .text('🗑️ Hapus Item', `action:delete:${item.id}`)
      .row()
      .text('📋 Kembali ke Daftar', 'action:list_reminders');

    if (item.photo_file_id) {
      await ctx.replyWithPhoto(item.photo_file_id, {
        caption: card,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else {
      await ctx.reply(card, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  });

  bot.callbackQuery(/^action:delete:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const reminderId = parseInt(ctx.match[1], 10);
    const from = ctx.from;
    if (!from) return;

    const access = await checkUserAccess(from.id);
    const success = await deleteReminder(reminderId, access.user.id);

    if (success) {
      const deleteText = '🗑️ <b>Item pengingat berhasil dihapus.</b>';
      const keyboard = new InlineKeyboard().text('📋 Lihat Daftar Sisa', 'action:list_reminders');
      if (ctx.callbackQuery.message?.caption) {
        await ctx.editMessageCaption({ caption: deleteText, parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
      } else {
        await ctx.editMessageText(deleteText, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
          await ctx.reply(deleteText, { parse_mode: 'HTML', reply_markup: keyboard });
        });
      }
    } else {
      await ctx.reply('⚠️ Gagal menghapus item.');
    }
  });

  // Quick Renew (+1 bln, +3 bln, +6 bln, +12 bln, +60 bln)
  bot.callbackQuery(/^action:renew_months:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const reminderId = parseInt(ctx.match[1], 10);
    const months = parseInt(ctx.match[2], 10);
    const from = ctx.from;
    if (!from) return;

    const access = await checkUserAccess(from.id);
    const updated = await renewReminderByMonths(reminderId, access.user.id, months);

    if (updated) {
      const label = months === 60 ? '5 Tahun' : months === 12 ? '1 Tahun' : `${months} Bulan`;
      const renewText = `🔄 <b>Jatuh tempo berhasil diperpanjang ${label}!</b>\n\nTanggal Baru: <b>${formatDateID(updated.due_date)}</b>`;
      const keyboard = new InlineKeyboard()
        .text('🔍 Lihat Item Ini', `action:view:${updated.id}`)
        .row()
        .text('📋 Lihat Semua Daftar', 'action:list_reminders');

      if (ctx.callbackQuery.message?.caption) {
        await ctx.editMessageCaption({ caption: renewText, parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
      } else {
        await ctx.editMessageText(renewText, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
          await ctx.reply(renewText, { parse_mode: 'HTML', reply_markup: keyboard });
        });
      }
    } else {
      await ctx.reply('⚠️ Gagal memperpanjang tanggal item.');
    }
  });

  bot.callbackQuery(/^action:renew:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const reminderId = parseInt(ctx.match[1], 10);
    const from = ctx.from;
    if (!from) return;

    const access = await checkUserAccess(from.id);
    const updated = await renewReminderDate(reminderId, access.user.id, 1);

    if (updated) {
      const renewText = `🔄 <b>Jatuh tempo berhasil diperpanjang 1 tahun!</b>\n\nTanggal Baru: <b>${formatDateID(updated.due_date)}</b>`;
      const keyboard = new InlineKeyboard().text('📋 Lihat Daftar', 'action:list_reminders');
      if (ctx.callbackQuery.message?.caption) {
        await ctx.editMessageCaption({ caption: renewText, parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
      } else {
        await ctx.editMessageText(renewText, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
          await ctx.reply(renewText, { parse_mode: 'HTML', reply_markup: keyboard });
        });
      }
    } else {
      await ctx.reply('⚠️ Gagal memperpanjang tanggal item.');
    }
  });

  bot.callbackQuery(/^action:snooze:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const reminderId = parseInt(ctx.match[1], 10);
    const from = ctx.from;
    if (!from) return;

    const access = await checkUserAccess(from.id);
    const updated = await snoozeReminder(reminderId, access.user.id, 7);

    if (updated) {
      const snoozeText = `⏸️ <b>Pengingat ditunda 7 hari ke depan!</b>\n\nTanggal Baru: <b>${formatDateID(updated.due_date)}</b>`;
      const keyboard = new InlineKeyboard().text('📋 Lihat Daftar', 'action:list_reminders');
      if (ctx.callbackQuery.message?.caption) {
        await ctx.editMessageCaption({ caption: snoozeText, parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
      } else {
        await ctx.editMessageText(snoozeText, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
          await ctx.reply(snoozeText, { parse_mode: 'HTML', reply_markup: keyboard });
        });
      }
    } else {
      await ctx.reply('⚠️ Gagal menunda pengingat.');
    }
  });

  bot.callbackQuery('action:close', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage().catch(() => {});
  });

  // 4. Upload Foto Bukti Pembayaran (Auto-Forward ke Admin Bot dengan Tombol 1-Tap Approval)
  bot.on('message:photo', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const photos = ctx.message.photo;
    const highestResPhoto = photos[photos.length - 1];

    try {
      const adminBot = new Bot(env.BOT_TOKEN_ADMIN);

      const selectedPkgName = ctx.session?.selectedPackageName;
      const selectedDuration = ctx.session?.selectedPackageDuration;
      const selectedPrice = ctx.session?.selectedPackagePrice;

      let caption = `💳 <b>BUKTI TRANSFER PEMBAYARAN MASUK!</b>\n\n`;
      caption += `👤 <b>Pengirim:</b> ${escapeHTML(from.first_name || 'User')} (@${from.username || 'tanpa_username'})\n`;
      caption += `🆔 <b>Telegram ID:</b> <code>${from.id}</code>\n`;

      if (selectedPkgName) {
        const durationStr = selectedDuration === 0 ? 'Seumur Hidup (Lifetime) ♾️' : `${selectedDuration} Hari`;
        const priceStr = selectedPrice ? ` - Rp ${new Intl.NumberFormat('id-ID').format(selectedPrice)}` : '';
        caption += `📦 <b>Paket Dipilih:</b> <b>${escapeHTML(selectedPkgName)}</b> (${durationStr}${priceStr})\n`;
      } else {
        caption += `📦 <b>Paket:</b> <i>(Pengguna langsung mengunggah foto)</i>\n`;
      }

      if (ctx.message.caption) {
        caption += `📝 <b>Keterangan:</b> <code>${escapeHTML(ctx.message.caption)}</code>\n`;
      }
      caption += `\nSilakan verifikasi mutasi rekening dan klik tombol tindakan di bawah:`;

      // 1-Tap Action Keyboard for Admins (Disesuaikan dengan paket 1 Tahun dan Lifetime)
      const adminKeyboard = new InlineKeyboard()
        .text('✅ Approve 1 Tahun', `adm_app:${from.id}:365`)
        .text('♾️ Approve Lifetime', `adm_app:${from.id}:0`)
        .row()
        .text('❌ Tolak Pembayaran', `adm_rej:${from.id}`);

      // Ambil daftar admin
      const { data: admins } = await supabase.from('users').select('telegram_id').eq('is_admin', true);

      if (admins && admins.length > 0) {
        // Download buffer foto asli via User Bot agar dapat di-upload sebagai file binary ke Admin Bot
        let photoBuffer: Buffer | null = null;
        try {
          const fileInfo = await ctx.api.getFile(highestResPhoto.file_id);
          if (fileInfo.file_path) {
            const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN_USER}/${fileInfo.file_path}`;
            const res = await fetch(fileUrl);
            if (res.ok) {
              const arrayBuffer = await res.arrayBuffer();
              photoBuffer = Buffer.from(arrayBuffer);
            }
          }
        } catch (fileErr) {
          console.warn('Could not fetch photo buffer from user bot:', fileErr);
        }

        for (const adm of admins) {
          try {
            if (photoBuffer) {
              await adminBot.api.sendPhoto(adm.telegram_id, new InputFile(photoBuffer, 'bukti_transfer.jpg'), {
                caption,
                parse_mode: 'HTML',
                reply_markup: adminKeyboard,
              });
            } else {
              await adminBot.api.sendMessage(adm.telegram_id, caption, {
                parse_mode: 'HTML',
                reply_markup: adminKeyboard,
              });
            }
          } catch (sendErr) {
            console.error(`Failed to send photo to admin ${adm.telegram_id}, fallback to text:`, sendErr);
            await adminBot.api.sendMessage(adm.telegram_id, caption, {
              parse_mode: 'HTML',
              reply_markup: adminKeyboard,
            }).catch(() => {});
          }
        }
      } else {
        console.warn('⚠️ Tidak ada admin terdaftar untuk menerima bukti pembayaran.');
      }

      await ctx.reply(
        '✅ <b>Bukti pembayaran Anda telah diterima!</b>\n\nTim admin kami sedang memverifikasi transfer Anda. Akun Anda akan aktif otomatis setelah disetujui dalam beberapa saat.',
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('Error forwarding payment proof to admin:', err);
      await notifyAdminsOnError({
        source: 'Upload Bukti Pembayaran (message:photo)',
        error: err,
        ctxInfo: {
          userId: from.id,
          username: from.username,
          messageText: ctx.message.caption || '[Foto Bukti Pembayaran]',
        },
      });
      await ctx.reply('⚠️ Terjadi kendala saat meneruskan bukti transfer ke admin. Silakan coba lagi.');
    }
  });

  // 5. Automatic Voucher Code Detection / Interactive Redeem Reply
  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) {
      return next();
    }

    const from = ctx.from;
    if (!from) return next();

    const isAwaiting = Boolean(ctx.session?.awaitingRedeemCode);
    const looksLikeVoucher = /^[A-Za-z0-9]{6,12}$/.test(text);

    if (isAwaiting || looksLikeVoucher) {
      const user = await getOrCreateUser({
        id: from.id,
        username: from.username,
        first_name: from.first_name,
        last_name: from.last_name,
      });

      const result = await redeemCode(text, user.id);
      if (result.success) {
        ctx.session.awaitingRedeemCode = false;
        await ctx.reply(
          `🎉 <b>Aktivasi Berhasil!</b>\n\n${result.message}\nAkun Anda kini dapat menyimpan reminder tanpa batas.`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().text('➕ Tambah Reminder', 'action:add_reminder'),
          }
        );
        return;
      } else if (isAwaiting) {
        ctx.session.awaitingRedeemCode = false;
        await ctx.reply(`❌ <b>Gagal:</b> ${result.message}`, { parse_mode: 'HTML' });
        return;
      }
    }

    return next();
  });
}
