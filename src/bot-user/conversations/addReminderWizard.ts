import { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import { Context, InlineKeyboard } from 'grammy';
import { checkUserAccess } from '../../services/accessControl.js';
import { getActiveCategories, createReminder } from '../../services/reminderService.js';
import { parseDateInput, formatDateID, getNextUpcomingOccurrence } from '../../utils/dateHelper.js';
import { escapeHTML } from '../../utils/telegramHelper.js';

export type UserBotContext = Context & ConversationFlavor;
export type UserBotConversation = Conversation<UserBotContext>;

/**
 * Interactive Wizard untuk menambah item reminder baru
 */
export async function addReminderWizard(
  conversation: UserBotConversation,
  ctx: UserBotContext
): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  // 1. Validasi Hak Akses & Kuota
  const access = await conversation.external(() => checkUserAccess(telegramId));
  if (!access.canCreateItem) {
    const text = `🚫 <b>Batas Kuota Tercapai!</b>\n\nAnda saat ini menggunakan akun <b>Free Trial</b> dengan <b>${access.activeItemCount}/${2} item aktif</b>.\n\nUntuk menambah item tanpa batas, silakan tingkatkan ke versi <b>Pro</b>.`;
    const keyboard = new InlineKeyboard().text('💎 Berlangganan Sekarang (/subscribe)', 'action:subscribe');
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  // 2. Pilih Kategori Item
  const categories = await conversation.external(() => getActiveCategories());
  const categoryKeyboard = new InlineKeyboard();
  categories.forEach((cat, index) => {
    categoryKeyboard.text(`${cat.icon} ${cat.name}`, `wizard_cat:${cat.id}`);
    if (index % 2 === 1) categoryKeyboard.row();
  });
  categoryKeyboard.row().text('❌ Batalkan', 'wizard_cancel');

  await ctx.reply(
    '📝 <b>Langkah 1 dari 4: Pilih Kategori Item</b>\n\nSilakan pilih jenis item yang ingin diingatkan:',
    { parse_mode: 'HTML', reply_markup: categoryKeyboard }
  );

  const catResponse = await conversation.waitForCallbackQuery(/^wizard_cat:\d+$|^wizard_cancel$/);
  await catResponse.answerCallbackQuery();

  if (catResponse.callbackQuery.data === 'wizard_cancel') {
    await ctx.reply('❌ Penambahan reminder dibatalkan.');
    return;
  }

  const categoryId = parseInt(catResponse.callbackQuery.data.split(':')[1], 10);
  const selectedCat = categories.find((c) => c.id === categoryId);
  const isBirthday = selectedCat?.code === 'birthday';

  // 3. Input Judul / Nama Item
  const titlePrompt = isBirthday
    ? `🎂 <b>Langkah 2 dari 4: Nama Orang / Momen Spesial</b>\n\nKategori: <b>${selectedCat?.icon} ${escapeHTML(selectedCat?.name || '')}</b>\n\nKetikkan nama orang atau momen (misal: <i>"Ulang Tahun Istri"</i>, <i>"Ulang Tahun Ibu"</i>, atau <i>"Anniversary Pernikahan"</i>):`
    : `📌 <b>Langkah 2 dari 4: Nama / Judul Item</b>\n\nKategori: <b>${selectedCat?.icon} ${escapeHTML(selectedCat?.name || '')}</b>\n\nKetikkan nama barang/dokumen (misal: <i>"Garansi Asus ROG"</i> atau <i>"Pajak STNK Honda Vario"</i>):`;

  await ctx.reply(titlePrompt, { parse_mode: 'HTML' });

  const titleMsg = await conversation.waitFor('message:text');
  const title = titleMsg.message.text.trim();

  // 4. Input Tanggal Jatuh Tempo
  const datePrompt = isBirthday
    ? `📅 <b>Langkah 3 dari 4: Tanggal Ulang Tahun / Hari Spesial</b>\n\nItem: <b>${escapeHTML(title)}</b>\n\nKetikkan tanggalnya (Format: <code>YYYY-MM-DD</code> atau <code>DD/MM/YYYY</code>):\n<i>Contoh: <code>15/10/1995</code> atau <code>15-10-2026</code></i>`
    : `📅 <b>Langkah 3 dari 4: Tanggal Kedaluwarsa / Jatuh Tempo</b>\n\nItem: <b>${escapeHTML(title)}</b>\n\nKetikkan tanggalnya (Format: <code>YYYY-MM-DD</code> atau <code>DD/MM/YYYY</code>):\n<i>Contoh: <code>2026-12-31</code> atau <code>31/12/2026</code></i>`;

  await ctx.reply(datePrompt, { parse_mode: 'HTML' });

  let validDateStr: string | null = null;
  while (!validDateStr) {
    const dateMsg = await conversation.waitFor('message:text');
    const parsed = parseDateInput(dateMsg.message.text);
    if (parsed) {
      // Jika kategori ulang tahun, hitung tanggal kejadian terdekat (tahun ini / tahun depan)
      validDateStr = isBirthday ? getNextUpcomingOccurrence(parsed) : parsed;
    } else {
      await ctx.reply(
        '⚠️ <b>Format tanggal tidak valid!</b>\nMohon ketikkan format yang benar, contoh: <code>2026-12-31</code> atau <code>31/12/2026</code>:',
        { parse_mode: 'HTML' }
      );
    }
  }

  // 5. Catatan Tambahan (Opsional) atau Foto
  const skipKeyboard = new InlineKeyboard().text('⏩ Lewati Catatan', 'wizard_skip_notes');
  const notesPrompt = isBirthday
    ? `🎁 <b>Langkah 4 dari 4: Ide Kado / Catatan (Opsional)</b>\n\nKetikkan ide kado, ukuran baju/sepatu, wishlist, atau foto kenangan.\nAtau tekan tombol di bawah untuk melewati:`
    : `📝 <b>Langkah 4 dari 4: Catatan Tambahan (Opsional)</b>\n\nKetikkan catatan tambahan (nomor seri, tempat servis, no. polis) atau kirim foto nota/kartu garansi.\nAtau tekan tombol di bawah untuk melewati:`;

  await ctx.reply(notesPrompt, { parse_mode: 'HTML', reply_markup: skipKeyboard });

  let notes: string | undefined;
  let photoFileId: string | undefined;

  const notesResponse = await conversation.waitFor(['message:text', 'message:photo', 'callback_query:data']);

  if (notesResponse.callbackQuery && notesResponse.callbackQuery.data === 'wizard_skip_notes') {
    await notesResponse.answerCallbackQuery();
  } else if (notesResponse.message?.text) {
    notes = notesResponse.message.text.trim();
  } else if (notesResponse.message?.photo) {
    const photos = notesResponse.message.photo;
    photoFileId = photos[photos.length - 1].file_id;
    if (notesResponse.message.caption) {
      notes = notesResponse.message.caption.trim();
    }
  }

  // 6. Simpan ke Database Supabase
  const createdItem = await conversation.external(() =>
    createReminder({
      userId: access.user.id,
      categoryId,
      title,
      notes,
      dueDate: validDateStr!,
      reminderIntervals: selectedCat?.default_reminder_days || [30, 7, 3, 1, 0],
      photoFileId,
      isRecurring: isBirthday,
    })
  );

  let successMsg = `🎉 <b>Item Pengingat Berhasil Disimpan!</b>\n\n`;
  successMsg += `<b>${selectedCat?.icon} ${escapeHTML(createdItem.title)}</b>\n`;
  successMsg += `📂 Kategori: <i>${escapeHTML(selectedCat?.name || '')}</i>\n`;
  successMsg += `📅 Tanggal: <b>${formatDateID(createdItem.due_date)}</b>\n`;
  if (createdItem.notes) {
    successMsg += `📝 Catatan: <code>${escapeHTML(createdItem.notes)}</code>\n`;
  }
  if (isBirthday) {
    successMsg += `\n🎂 <i>Pengingat ini berulang otomatis setiap tahun! Bot akan mengingatkan pada H-14, H-7, H-3, H-1, dan Hari H.</i>`;
  } else {
    successMsg += `\n⏰ <i>Bot otomatis mengingatkan Anda pada H-30, H-7, H-3, H-1, dan hari H!</i>`;
  }

  const doneKeyboard = new InlineKeyboard()
    .text('📋 Lihat Semua Reminder', 'action:list_reminders')
    .text('➕ Tambah Lagi', 'action:add_reminder');

  await ctx.reply(successMsg, { parse_mode: 'HTML', reply_markup: doneKeyboard });
}
