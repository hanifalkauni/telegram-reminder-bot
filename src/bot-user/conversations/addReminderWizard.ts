import { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import { Context, InlineKeyboard } from 'grammy';
import { checkUserAccess } from '../../services/accessControl.js';
import { getActiveCategories, createReminder } from '../../services/reminderService.js';
import { parseDateInput, formatDateID, getNextUpcomingOccurrence } from '../../utils/dateHelper.js';
import { escapeHTML, generateGoogleCalendarUrl } from '../../utils/telegramHelper.js';

export type UserBotContext = Context & ConversationFlavor;
export type UserBotConversation = Conversation<UserBotContext>;

function isCancelInput(text?: string): boolean {
  if (!text) return false;
  const clean = text.trim().toLowerCase();
  return clean === '/cancel' || clean === '/batal' || clean === 'batal' || clean === '/start' || clean === '/menu' || clean === '/help' || clean === '/list';
}

/**
 * Interactive Wizard untuk menambah item reminder baru (Auto-hide button setelah diklik)
 */
export async function addReminderWizard(
  conversation: UserBotConversation,
  ctx: UserBotContext
): Promise<void> {
  const telegramId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!telegramId || !chatId) return;

  const cancelKeyboard = new InlineKeyboard().text('❌ Batalkan Penambahan', 'wizard_cancel');

  // 1. Validasi Hak Akses & Kuota
  const access = await conversation.external(() => checkUserAccess(telegramId));
  if (!access.canCreateItem) {
    const text = `🚫 <b>Batas Kuota Tercapai!</b>\n\nAnda saat ini menggunakan akun <b>Free Trial</b> dengan <b>${access.activeItemCount}/${2} item aktif</b>.\n\nUntuk menambah item tanpa batas, silakan tingkatkan ke versi <b>Pro</b>.`;
    const keyboard = new InlineKeyboard().text('💎 Berlangganan Sekarang (/subscribe)', 'action:subscribe');
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  // 2. Langkah 1: Pilih Kategori Item
  const categories = await conversation.external(() => getActiveCategories());
  const categoryKeyboard = new InlineKeyboard();
  categories.forEach((cat, index) => {
    categoryKeyboard.text(`${cat.icon} ${cat.name}`, `wizard_cat:${cat.id}`);
    if (index % 2 === 1) categoryKeyboard.row();
  });
  categoryKeyboard.row().text('❌ Batalkan', 'wizard_cancel');

  const catPromptMsg = await ctx.reply(
    '📝 <b>Langkah 1 dari 6: Pilih Kategori Item</b>\n\nSilakan pilih jenis item yang ingin diingatkan:\n<i>(Ketik /batal atau klik tombol di bawah untuk membatalkan kapan saja)</i>',
    { parse_mode: 'HTML', reply_markup: categoryKeyboard }
  );

  const catResponse = await conversation.waitFor(['callback_query:data', 'message:text']);
  // Auto-hide buttons pada prompt langkah 1
  await ctx.api.editMessageReplyMarkup(chatId, catPromptMsg.message_id, { reply_markup: undefined }).catch(() => {});

  if (catResponse.callbackQuery) {
    await catResponse.answerCallbackQuery();
    if (catResponse.callbackQuery.data === 'wizard_cancel') {
      await ctx.reply('❌ <b>Proses penambahan pengingat dibatalkan.</b>', { parse_mode: 'HTML' });
      return;
    }
  } else if (catResponse.message?.text && isCancelInput(catResponse.message.text)) {
    await ctx.reply('❌ <b>Proses penambahan pengingat dibatalkan.</b>', { parse_mode: 'HTML' });
    return;
  }

  if (!catResponse.callbackQuery?.data?.startsWith('wizard_cat:')) {
    await ctx.reply('❌ <b>Proses dibatalkan.</b> Silakan ketik /add untuk memulai kembali.', { parse_mode: 'HTML' });
    return;
  }

  const categoryId = parseInt(catResponse.callbackQuery.data.split(':')[1], 10);
  const selectedCat = categories.find((c) => c.id === categoryId);
  const isBirthday = selectedCat?.code === 'birthday';
  const isSpiritual = selectedCat?.code === 'spiritual';

  // 3. Langkah 2: Input Judul / Nama Item
  let titlePrompt = `📌 <b>Langkah 2 dari 6: Nama / Judul Item</b>\n\nKategori: <b>${selectedCat?.icon} ${escapeHTML(selectedCat?.name || '')}</b>\n\nKetikkan nama barang/dokumen/agenda (misal: <i>"Garansi Laptop Asus"</i>, <i>"Pajak STNK Honda Vario"</i>, atau <i>"Cuci AC Rumah"</i>):`;
  if (isBirthday) {
    titlePrompt = `🎂 <b>Langkah 2 dari 6: Nama Orang / Momen Spesial</b>\n\nKategori: <b>${selectedCat?.icon} ${escapeHTML(selectedCat?.name || '')}</b>\n\nKetikkan nama orang atau momen (misal: <i>"Ulang Tahun Istri"</i>, <i>"Ulang Tahun Ibu"</i>, atau <i>"Anniversary Pernikahan"</i>):`;
  } else if (isSpiritual) {
    titlePrompt = `🕊️ <b>Langkah 2 dari 6: Nama Ibadah / Donasi / Hari Suci</b>\n\nKategori: <b>${selectedCat?.icon} ${escapeHTML(selectedCat?.name || '')}</b>\n\nKetikkan nama agenda (misal: <i>"Natal & Paskah"</i>, <i>"Kurban Idul Adha"</i>, <i>"Persepuluhan / Zakat"</i>, <i>"Nyepi / Waisak"</i>, atau <i>"Donasi Rutin"</i>):`;
  }

  const titlePromptMsg = await ctx.reply(titlePrompt, { parse_mode: 'HTML', reply_markup: cancelKeyboard });

  const titleResponse = await conversation.waitFor(['message:text', 'callback_query:data']);
  // Auto-hide buttons pada prompt langkah 2
  await ctx.api.editMessageReplyMarkup(chatId, titlePromptMsg.message_id, { reply_markup: undefined }).catch(() => {});

  if (titleResponse.callbackQuery) {
    await titleResponse.answerCallbackQuery();
    if (titleResponse.callbackQuery.data === 'wizard_cancel') {
      await ctx.reply('❌ <b>Proses penambahan pengingat dibatalkan.</b>', { parse_mode: 'HTML' });
      return;
    }
  }

  const rawTitle = titleResponse.message?.text?.trim() || '';
  if (isCancelInput(rawTitle)) {
    await ctx.reply('❌ <b>Proses penambahan pengingat dibatalkan.</b>', { parse_mode: 'HTML' });
    return;
  }
  const title = rawTitle;

  // 4. Langkah 3: Input Tanggal Jatuh Tempo
  const datePrompt = isBirthday
    ? `📅 <b>Langkah 3 dari 6: Tanggal Ulang Tahun / Hari Spesial</b>\n\nItem: <b>${escapeHTML(title)}</b>\n\nKetikkan tanggalnya (Format: <code>YYYY-MM-DD</code> atau <code>DD/MM/YYYY</code>):\n<i>Contoh: <code>15/10/1995</code> atau <code>15-10-2026</code></i>`
    : `📅 <b>Langkah 3 dari 6: Tanggal Kedaluwarsa / Jatuh Tempo</b>\n\nItem: <b>${escapeHTML(title)}</b>\n\nKetikkan tanggalnya (Format: <code>YYYY-MM-DD</code> atau <code>DD/MM/YYYY</code>):\n<i>Contoh: <code>2026-12-31</code> atau <code>31/12/2026</code></i>`;

  let datePromptMsg = await ctx.reply(datePrompt, { parse_mode: 'HTML', reply_markup: cancelKeyboard });

  let validDateStr: string | null = null;
  while (!validDateStr) {
    const dateResponse = await conversation.waitFor(['message:text', 'callback_query:data']);
    // Auto-hide buttons pada prompt tanggal
    await ctx.api.editMessageReplyMarkup(chatId, datePromptMsg.message_id, { reply_markup: undefined }).catch(() => {});

    if (dateResponse.callbackQuery) {
      await dateResponse.answerCallbackQuery();
      if (dateResponse.callbackQuery.data === 'wizard_cancel') {
        await ctx.reply('❌ <b>Proses penambahan pengingat dibatalkan.</b>', { parse_mode: 'HTML' });
        return;
      }
    }

    const textInput = dateResponse.message?.text?.trim() || '';
    if (isCancelInput(textInput)) {
      await ctx.reply('❌ <b>Proses penambahan pengingat dibatalkan.</b>', { parse_mode: 'HTML' });
      return;
    }

    const parsed = parseDateInput(textInput);
    if (parsed) {
      validDateStr = isBirthday ? getNextUpcomingOccurrence(parsed) : parsed;
    } else {
      datePromptMsg = await ctx.reply(
        '⚠️ <b>Format tanggal tidak valid!</b>\nMohon ketikkan format yang benar, contoh: <code>2026-12-31</code> atau <code>31/12/2026</code>\nAtau klik tombol batal di bawah:',
        { parse_mode: 'HTML', reply_markup: cancelKeyboard }
      );
    }
  }

  // 5. Langkah 4: Pilihan Siklus Perulangan (Recurring Cycle)
  let recurringType: 'NONE' | 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'YEARLY' | 'FIVE_YEARS' | 'HIJRI_YEARLY' = isBirthday ? 'YEARLY' : 'NONE';

  if (!isBirthday) {
    const recurringKeyboard = new InlineKeyboard();
    if (isSpiritual) {
      recurringKeyboard.text('🌙 Tiap 1 Tahun Hijriyah (Kurban/Zakat ~354 Hari)', 'rec:HIJRI_YEARLY').row();
    }
    recurringKeyboard
      .text('❌ Sekali Saja (Tanpa Perulangan)', 'rec:NONE').row()
      .text('📅 Tiap 1 Bulan (Kos/Tagihan)', 'rec:MONTHLY')
      .text('🛠️ Tiap 3 Bulan (AC/Oli)', 'rec:QUARTERLY').row()
      .text('⚙️ Tiap 6 Bulan (Servis/KIR)', 'rec:SEMI_ANNUAL')
      .text('🔄 Tiap 1 Tahun Masehi (STNK/Domain)', 'rec:YEARLY').row();
    
    if (!isSpiritual) {
      recurringKeyboard.text('🌙 Tiap 1 Tahun Hijriyah (~354 Hari)', 'rec:HIJRI_YEARLY').row();
    }
    recurringKeyboard
      .text('🪪 Tiap 5 Tahun (SIM/Paspor/ATM)', 'rec:FIVE_YEARS').row()
      .text('❌ Batalkan Penambahan', 'wizard_cancel');

    const recPromptMsg = await ctx.reply(
      '🔄 <b>Langkah 4 dari 6: Siklus Perulangan</b>\n\nApakah pengingat ini berulang secara berkala?\n<i>(Jika berulang, bot otomatis memajukan tanggal ke siklus berikutnya setelah hari H)</i>',
      { parse_mode: 'HTML', reply_markup: recurringKeyboard }
    );

    const recResponse = await conversation.waitFor(['callback_query:data', 'message:text']);
    // Auto-hide buttons pada prompt langkah 4
    await ctx.api.editMessageReplyMarkup(chatId, recPromptMsg.message_id, { reply_markup: undefined }).catch(() => {});

    if (recResponse.callbackQuery) {
      await recResponse.answerCallbackQuery();
      if (recResponse.callbackQuery.data === 'wizard_cancel') {
        await ctx.reply('❌ <b>Proses penambahan pengingat dibatalkan.</b>', { parse_mode: 'HTML' });
        return;
      }
      if (recResponse.callbackQuery.data.startsWith('rec:')) {
        recurringType = recResponse.callbackQuery.data.split(':')[1] as typeof recurringType;
      }
    } else if (recResponse.message?.text && isCancelInput(recResponse.message.text)) {
      await ctx.reply('❌ <b>Proses penambahan pengingat dibatalkan.</b>', { parse_mode: 'HTML' });
      return;
    }
  }

  // 6. Langkah 5: Estimasi Biaya / Anggaran (Opsional)
  let estimatedCost = 0;
  const skipCostKeyboard = new InlineKeyboard()
    .text('⏩ Lewati Biaya (Rp 0)', 'wizard_skip_cost')
    .row()
    .text('❌ Batalkan', 'wizard_cancel');

  const costPromptMsg = await ctx.reply(
    `💵 <b>Langkah 5 dari 6: Estimasi Biaya / Dana (Opsional)</b>\n\nKetikkan perkiraan nominal biaya (misal: <code>150000</code>, <code>2500000</code>) untuk membantu menyiapkan dana saat jatuh tempo.\nAtau tekan tombol di bawah untuk melewati:`,
    { parse_mode: 'HTML', reply_markup: skipCostKeyboard }
  );

  const costResponse = await conversation.waitFor(['message:text', 'callback_query:data']);
  // Auto-hide buttons pada prompt langkah 5
  await ctx.api.editMessageReplyMarkup(chatId, costPromptMsg.message_id, { reply_markup: undefined }).catch(() => {});

  if (costResponse.callbackQuery) {
    await costResponse.answerCallbackQuery();
    if (costResponse.callbackQuery.data === 'wizard_cancel') {
      await ctx.reply('❌ <b>Proses penambahan pengingat dibatalkan.</b>', { parse_mode: 'HTML' });
      return;
    }
    // skip cost
  } else if (costResponse.message?.text) {
    if (isCancelInput(costResponse.message.text)) {
      await ctx.reply('❌ <b>Proses penambahan pengingat dibatalkan.</b>', { parse_mode: 'HTML' });
      return;
    }
    const rawNumber = costResponse.message.text.replace(/[^0-9]/g, '');
    if (rawNumber) {
      estimatedCost = parseInt(rawNumber, 10);
    }
  }

  // 7. Langkah 6: Catatan Tambahan (Opsional) atau Foto
  const skipNotesKeyboard = new InlineKeyboard()
    .text('⏩ Lewati Catatan & Simpan', 'wizard_skip_notes')
    .row()
    .text('❌ Batalkan', 'wizard_cancel');

  const notesPrompt = isBirthday
    ? `🎁 <b>Langkah 6 dari 6: Ide Kado / Catatan (Opsional)</b>\n\nKetikkan ide kado, ukuran baju/sepatu, wishlist, atau foto kenangan.\nAtau tekan tombol di bawah untuk melewati:`
    : `📝 <b>Langkah 6 dari 6: Catatan Tambahan (Opsional)</b>\n\nKetikkan catatan tambahan (nomor seri, tempat servis, no. polis) atau kirim foto nota/kartu garansi.\nAtau tekan tombol di bawah untuk melewati:`;

  const notesPromptMsg = await ctx.reply(notesPrompt, { parse_mode: 'HTML', reply_markup: skipNotesKeyboard });

  const notesResponse = await conversation.waitFor(['message:text', 'message:photo', 'callback_query:data']);
  // Auto-hide buttons pada prompt langkah 6
  await ctx.api.editMessageReplyMarkup(chatId, notesPromptMsg.message_id, { reply_markup: undefined }).catch(() => {});

  let notes: string | undefined;
  let photoFileId: string | undefined;

  if (notesResponse.callbackQuery) {
    await notesResponse.answerCallbackQuery();
    if (notesResponse.callbackQuery.data === 'wizard_cancel') {
      await ctx.reply('❌ <b>Proses penambahan pengingat dibatalkan.</b>', { parse_mode: 'HTML' });
      return;
    }
    // skip notes
  } else if (notesResponse.message?.text) {
    if (isCancelInput(notesResponse.message.text)) {
      await ctx.reply('❌ <b>Proses penambahan pengingat dibatalkan.</b>', { parse_mode: 'HTML' });
      return;
    }
    notes = notesResponse.message.text.trim();
  } else if (notesResponse.message?.photo) {
    const photos = notesResponse.message.photo;
    photoFileId = photos[photos.length - 1].file_id;
    if (notesResponse.message.caption) {
      notes = notesResponse.message.caption.trim();
    }
  }

  // 8. Simpan ke Database Supabase
  const createdItem = await conversation.external(() =>
    createReminder({
      userId: access.user.id,
      categoryId,
      title,
      notes,
      dueDate: validDateStr!,
      estimatedCost,
      reminderIntervals: selectedCat?.default_reminder_days || [30, 7, 3, 1, 0],
      photoFileId,
      isRecurring: recurringType !== 'NONE',
      recurringType,
    })
  );

  let successMsg = `🎉 <b>Item Pengingat Berhasil Disimpan!</b>\n\n`;
  successMsg += `<b>${selectedCat?.icon} ${escapeHTML(createdItem.title)}</b>\n`;
  successMsg += `📂 Kategori: <i>${escapeHTML(selectedCat?.name || '')}</i>\n`;
  successMsg += `📅 Tanggal: <b>${formatDateID(createdItem.due_date)}</b>\n`;

  if (recurringType !== 'NONE') {
    const recLabelMap: Record<string, string> = {
      MONTHLY: 'Tiap 1 Bulan',
      QUARTERLY: 'Tiap 3 Bulan',
      SEMI_ANNUAL: 'Tiap 6 Bulan',
      YEARLY: 'Tiap 1 Tahun Masehi',
      FIVE_YEARS: 'Tiap 5 Tahun',
      HIJRI_YEARLY: 'Tiap 1 Tahun Hijriyah (~354 Hari)',
    };
    successMsg += `🔄 Perulangan: <b>${recLabelMap[recurringType]} (Otomatis)</b>\n`;
  }

  if (estimatedCost > 0) {
    const costFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(estimatedCost);
    successMsg += `💵 Estimasi Biaya: <b>${costFormatted}</b>\n`;
  }

  if (createdItem.notes) {
    successMsg += `📝 Catatan: <code>${escapeHTML(createdItem.notes)}</code>\n`;
  }

  if (isBirthday) {
    successMsg += `\n🎂 <i>Pengingat ini berulang otomatis setiap tahun! Bot akan mengingatkan pada H-14, H-7, H-3, H-1, dan Hari H.</i>`;
  } else {
    successMsg += `\n⏰ <i>Bot otomatis mengingatkan Anda menjelang jatuh tempo!</i>`;
  }

  const gcalUrl = generateGoogleCalendarUrl(createdItem.title, createdItem.due_date, createdItem.notes);
  const doneKeyboard = new InlineKeyboard()
    .url('📅 Simpan ke Google Calendar', gcalUrl)
    .row()
    .text('📋 Lihat Semua Reminder', 'action:list_reminders')
    .text('➕ Tambah Lagi', 'action:add_reminder');

  await ctx.reply(successMsg, { parse_mode: 'HTML', reply_markup: doneKeyboard });
}
