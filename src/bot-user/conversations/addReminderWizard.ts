import { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import { Context, InlineKeyboard, SessionFlavor } from 'grammy';
import { checkUserAccess } from '../../services/accessControl.js';
import { getActiveCategories, createReminder } from '../../services/reminderService.js';
import { parseDateInput, formatDateID, getNextUpcomingOccurrence } from '../../utils/dateHelper.js';
import { escapeHTML, generateGoogleCalendarUrl } from '../../utils/telegramHelper.js';

export interface SessionData {
  selectedPackageId?: number;
  selectedPackageName?: string;
  selectedPackageDuration?: number;
  selectedPackagePrice?: number;
}

export type UserBotContext = Context & ConversationFlavor & SessionFlavor<SessionData>;
export type UserBotConversation = Conversation<UserBotContext>;

function isCancelInput(text?: string): boolean {
  if (!text) return false;
  const clean = text.trim().toLowerCase();
  return clean === '/cancel' || clean === '/batal' || clean === 'batal' || clean === '/start' || clean === '/menu' || clean === '/help' || clean === '/list';
}

/**
 * Interactive Wizard untuk menambah item reminder baru
 * - Auto-hide & update message dengan info pilihan tombol yang dipilih
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
    '📝 <b>Langkah 1 dari 7: Pilih Kategori Item</b>\n\nSilakan pilih jenis item yang ingin diingatkan:\n<i>(Ketik /batal atau klik tombol di bawah untuk membatalkan kapan saja)</i>',
    { parse_mode: 'HTML', reply_markup: categoryKeyboard }
  );

  const catResponse = await conversation.waitFor(['callback_query:data', 'message:text']);

  if (catResponse.callbackQuery) {
    await catResponse.answerCallbackQuery();
    if (catResponse.callbackQuery.data === 'wizard_cancel') {
      await ctx.api.editMessageText(
        chatId,
        catPromptMsg.message_id,
        '📝 <b>Langkah 1 dari 7: Pilih Kategori Item</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
        { parse_mode: 'HTML' }
      ).catch(() => {});
      return;
    }
  } else if (catResponse.message?.text && isCancelInput(catResponse.message.text)) {
    await ctx.api.editMessageText(
      chatId,
      catPromptMsg.message_id,
      '📝 <b>Langkah 1 dari 7: Pilih Kategori Item</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
      { parse_mode: 'HTML' }
    ).catch(() => {});
    return;
  }

  if (!catResponse.callbackQuery?.data?.startsWith('wizard_cat:')) {
    await ctx.api.editMessageReplyMarkup(chatId, catPromptMsg.message_id, { reply_markup: undefined }).catch(() => {});
    await ctx.reply('❌ <b>Proses dibatalkan.</b> Silakan ketik /add untuk memulai kembali.', { parse_mode: 'HTML' });
    return;
  }

  const categoryId = parseInt(catResponse.callbackQuery.data.split(':')[1], 10);
  const selectedCat = categories.find((c) => c.id === categoryId);
  const isBirthday = selectedCat?.code === 'birthday';
  const isSpiritual = selectedCat?.code === 'spiritual';

  // Update pesan prompt langkah 1 dengan kategori yang dipilih dan hapus button
  await ctx.api.editMessageText(
    chatId,
    catPromptMsg.message_id,
    `📝 <b>Langkah 1 dari 7: Kategori Item</b>\n\n✅ <i>Kategori dipilih:</i> <b>${selectedCat?.icon} ${escapeHTML(selectedCat?.name || '')}</b>`,
    { parse_mode: 'HTML' }
  ).catch(() => {});

  // 3. Langkah 2: Input Judul / Nama Item
  let titlePrompt = `📌 <b>Langkah 2 dari 7: Nama / Judul Item</b>\n\nKategori: <b>${selectedCat?.icon} ${escapeHTML(selectedCat?.name || '')}</b>\n\nKetikkan nama barang/dokumen/agenda (misal: <i>"Garansi Laptop Asus"</i>, <i>"Pajak STNK Honda Vario"</i>, atau <i>"Cuci AC Rumah"</i>):`;
  if (isBirthday) {
    titlePrompt = `🎂 <b>Langkah 2 dari 7: Nama Orang / Momen Spesial</b>\n\nKategori: <b>${selectedCat?.icon} ${escapeHTML(selectedCat?.name || '')}</b>\n\nKetikkan nama orang atau momen (misal: <i>"Ulang Tahun Istri"</i>, <i>"Ulang Tahun Ibu"</i>, atau <i>"Anniversary Pernikahan"</i>):`;
  } else if (isSpiritual) {
    titlePrompt = `🕊️ <b>Langkah 2 dari 7: Nama Ibadah / Donasi / Hari Suci</b>\n\nKategori: <b>${selectedCat?.icon} ${escapeHTML(selectedCat?.name || '')}</b>\n\nKetikkan nama agenda (misal: <i>"Natal & Paskah"</i>, <i>"Kurban Idul Adha"</i>, <i>"Persepuluhan / Zakat"</i>, <i>"Nyepi / Waisak"</i>, atau <i>"Donasi Rutin"</i>):`;
  }

  const titlePromptMsg = await ctx.reply(titlePrompt, { parse_mode: 'HTML', reply_markup: cancelKeyboard });

  const titleResponse = await conversation.waitFor(['message:text', 'callback_query:data']);

  if (titleResponse.callbackQuery) {
    await titleResponse.answerCallbackQuery();
    if (titleResponse.callbackQuery.data === 'wizard_cancel') {
      await ctx.api.editMessageText(
        chatId,
        titlePromptMsg.message_id,
        '📌 <b>Langkah 2 dari 7: Nama / Judul Item</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
        { parse_mode: 'HTML' }
      ).catch(() => {});
      return;
    }
  }

  const rawTitle = titleResponse.message?.text?.trim() || '';
  if (isCancelInput(rawTitle)) {
    await ctx.api.editMessageText(
      chatId,
      titlePromptMsg.message_id,
      '📌 <b>Langkah 2 dari 7: Nama / Judul Item</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
      { parse_mode: 'HTML' }
    ).catch(() => {});
    return;
  }
  const title = rawTitle;

  // Update pesan prompt langkah 2 dengan judul yang diinput dan hapus button
  await ctx.api.editMessageText(
    chatId,
    titlePromptMsg.message_id,
    `📌 <b>Langkah 2 dari 7: Nama / Judul Item</b>\n\n✅ <i>Judul item:</i> <b>${escapeHTML(title)}</b>`,
    { parse_mode: 'HTML' }
  ).catch(() => {});

  // 4. Langkah 3: Input Tanggal Jatuh Tempo
  const datePrompt = isBirthday
    ? `📅 <b>Langkah 3 dari 7: Tanggal Ulang Tahun / Hari Spesial</b>\n\nItem: <b>${escapeHTML(title)}</b>\n\nKetikkan tanggalnya (Format: <code>YYYY-MM-DD</code> atau <code>DD/MM/YYYY</code>):\n<i>Contoh: <code>15/10/1995</code> atau <code>15-10-2026</code></i>`
    : `📅 <b>Langkah 3 dari 7: Tanggal Kedaluwarsa / Jatuh Tempo</b>\n\nItem: <b>${escapeHTML(title)}</b>\n\nKetikkan tanggalnya (Format: <code>YYYY-MM-DD</code> atau <code>DD/MM/YYYY</code>):\n<i>Contoh: <code>2026-12-31</code> atau <code>31/12/2026</code></i>`;

  let datePromptMsg = await ctx.reply(datePrompt, { parse_mode: 'HTML', reply_markup: cancelKeyboard });

  let validDateStr: string | null = null;
  while (!validDateStr) {
    const dateResponse = await conversation.waitFor(['message:text', 'callback_query:data']);

    if (dateResponse.callbackQuery) {
      await dateResponse.answerCallbackQuery();
      if (dateResponse.callbackQuery.data === 'wizard_cancel') {
        await ctx.api.editMessageText(
          chatId,
          datePromptMsg.message_id,
          '📅 <b>Langkah 3 dari 7: Tanggal Jatuh Tempo</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
          { parse_mode: 'HTML' }
        ).catch(() => {});
        return;
      }
    }

    const textInput = dateResponse.message?.text?.trim() || '';
    if (isCancelInput(textInput)) {
      await ctx.api.editMessageText(
        chatId,
        datePromptMsg.message_id,
        '📅 <b>Langkah 3 dari 7: Tanggal Jatuh Tempo</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
        { parse_mode: 'HTML' }
      ).catch(() => {});
      return;
    }

    const parsed = parseDateInput(textInput);
    if (parsed) {
      validDateStr = isBirthday ? getNextUpcomingOccurrence(parsed) : parsed;
      // Update pesan prompt langkah 3 dengan tanggal yang dipilih
      await ctx.api.editMessageText(
        chatId,
        datePromptMsg.message_id,
        `📅 <b>Langkah 3 dari 7: Tanggal Jatuh Tempo</b>\n\n✅ <i>Tanggal:</i> <b>${formatDateID(validDateStr)}</b>`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    } else {
      await ctx.api.editMessageReplyMarkup(chatId, datePromptMsg.message_id, { reply_markup: undefined }).catch(() => {});
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
      '🔄 <b>Langkah 4 dari 7: Siklus Perulangan</b>\n\nApakah pengingat ini berulang secara berkala?\n<i>(Jika berulang, bot otomatis memajukan tanggal ke siklus berikutnya setelah hari H)</i>',
      { parse_mode: 'HTML', reply_markup: recurringKeyboard }
    );

    const recResponse = await conversation.waitFor(['callback_query:data', 'message:text']);

    if (recResponse.callbackQuery) {
      await recResponse.answerCallbackQuery();
      if (recResponse.callbackQuery.data === 'wizard_cancel') {
        await ctx.api.editMessageText(
          chatId,
          recPromptMsg.message_id,
          '🔄 <b>Langkah 4 dari 7: Siklus Perulangan</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
          { parse_mode: 'HTML' }
        ).catch(() => {});
        return;
      }
      if (recResponse.callbackQuery.data.startsWith('rec:')) {
        recurringType = recResponse.callbackQuery.data.split(':')[1] as typeof recurringType;
      }
    } else if (recResponse.message?.text && isCancelInput(recResponse.message.text)) {
      await ctx.api.editMessageText(
        chatId,
        recPromptMsg.message_id,
        '🔄 <b>Langkah 4 dari 7: Siklus Perulangan</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
        { parse_mode: 'HTML' }
      ).catch(() => {});
      return;
    }

    const recLabelMap: Record<string, string> = {
      NONE: '❌ Sekali Saja (Tanpa Perulangan)',
      MONTHLY: '📅 Tiap 1 Bulan',
      QUARTERLY: '🛠️ Tiap 3 Bulan',
      SEMI_ANNUAL: '⚙️ Tiap 6 Bulan',
      YEARLY: '🔄 Tiap 1 Tahun Masehi',
      FIVE_YEARS: '🪪 Tiap 5 Tahun',
      HIJRI_YEARLY: '🌙 Tiap 1 Tahun Hijriyah (~354 Hari)',
    };

    // Update pesan prompt langkah 4 dengan perulangan yang dipilih
    await ctx.api.editMessageText(
      chatId,
      recPromptMsg.message_id,
      `🔄 <b>Langkah 4 dari 7: Siklus Perulangan</b>\n\n✅ <i>Pilihan:</i> <b>${recLabelMap[recurringType] || recurringType}</b>`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }

  // 6. Langkah 5: Pilihan Waktu Pengingat (Custom Interval Alert)
  const defaultIntervals = selectedCat?.default_reminder_days || [30, 14, 7, 3, 1, 0];
  const formatIntervalsText = (arr: number[]) =>
    arr
      .slice()
      .sort((a, b) => b - a)
      .map((d) => (d === 0 ? 'Hari H' : `H-${d}`))
      .join(', ');

  const defaultFormatted = formatIntervalsText(defaultIntervals);
  let reminderIntervals: number[] = defaultIntervals;

  const intervalKeyboard = new InlineKeyboard()
    .text(`✅ Standar: ${defaultFormatted.length > 25 ? defaultFormatted.substring(0, 24) + '...' : defaultFormatted}`, 'int:DEFAULT').row()
    .text('⚡ Ringkas (H-7, H-1, Hari H)', 'int:COMPACT')
    .text('🎯 Hari H Saja (0)', 'int:ONLY_DUE').row()
    .text('✏️ Kustom H- Sendiri', 'int:CUSTOM').row()
    .text('❌ Batalkan Penambahan', 'wizard_cancel');

  const intPromptMsg = await ctx.reply(
    `🔔 <b>Langkah 5 dari 7: Waktu Pengingat (Interval Alert)</b>\n\n` +
      `Kapan saja Anda ingin diingatkan menjelang jatuh tempo?\n` +
      `<i>(Standar Kategori: <code>${defaultFormatted}</code> pukul 07:00 WIB)</i>`,
    { parse_mode: 'HTML', reply_markup: intervalKeyboard }
  );

  const intResponse = await conversation.waitFor(['callback_query:data', 'message:text']);

  let isCustom = false;
  if (intResponse.callbackQuery) {
    await intResponse.answerCallbackQuery();
    if (intResponse.callbackQuery.data === 'wizard_cancel') {
      await ctx.api.editMessageText(
        chatId,
        intPromptMsg.message_id,
        '🔔 <b>Langkah 5 dari 7: Waktu Pengingat</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
        { parse_mode: 'HTML' }
      ).catch(() => {});
      return;
    }

    const data = intResponse.callbackQuery.data;
    if (data === 'int:DEFAULT') {
      reminderIntervals = defaultIntervals;
    } else if (data === 'int:COMPACT') {
      reminderIntervals = [7, 1, 0];
    } else if (data === 'int:ONLY_DUE') {
      reminderIntervals = [0];
    } else if (data === 'int:CUSTOM') {
      isCustom = true;
    }
  } else if (intResponse.message?.text && isCancelInput(intResponse.message.text)) {
    await ctx.api.editMessageText(
      chatId,
      intPromptMsg.message_id,
      '🔔 <b>Langkah 5 dari 7: Waktu Pengingat</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
      { parse_mode: 'HTML' }
    ).catch(() => {});
    return;
  }

  if (isCustom) {
    const customPromptMsg = await ctx.reply(
      `✏️ <b>Kustom Hari Pengingat (H-)</b>\n\n` +
        `Ketikkan angka hari H- sebelum jatuh tempo yang Anda inginkan (dipisahkan koma atau spasi).\n\n` +
        `<i>Contoh:</i> <code>60, 30, 14, 7, 1, 0</code>\n` +
        `<i>(Keterangan: Angka <code>0</code> = tepat Hari H)</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('❌ Batalkan', 'wizard_cancel'),
      }
    );

    const customResponse = await conversation.waitFor(['message:text', 'callback_query:data']);
    if (customResponse.callbackQuery) {
      await customResponse.answerCallbackQuery();
      await ctx.api.editMessageText(
        chatId,
        customPromptMsg.message_id,
        '🔔 <b>Kustom Hari Pengingat</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
        { parse_mode: 'HTML' }
      ).catch(() => {});
      return;
    }

    if (customResponse.message?.text) {
      if (isCancelInput(customResponse.message.text)) {
        await ctx.api.editMessageText(
          chatId,
          customPromptMsg.message_id,
          '🔔 <b>Kustom Hari Pengingat</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
          { parse_mode: 'HTML' }
        ).catch(() => {});
        return;
      }

      const rawText = customResponse.message.text;
      const parsedDays = rawText
        .split(/[,|\s]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 0 && n <= 365);

      if (parsedDays.length > 0) {
        reminderIntervals = Array.from(new Set(parsedDays)).sort((a, b) => b - a);
      } else {
        reminderIntervals = defaultIntervals;
      }

      await ctx.api.editMessageText(
        chatId,
        customPromptMsg.message_id,
        `✏️ <b>Kustom Hari Pengingat</b>\n\n✅ <i>Disimpan:</i> <code>${formatIntervalsText(reminderIntervals)}</code>`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }
  }

  // Update pesan prompt langkah 5 dengan interval yang dipilih
  await ctx.api.editMessageText(
    chatId,
    intPromptMsg.message_id,
    `🔔 <b>Langkah 5 dari 7: Waktu Pengingat</b>\n\n✅ <i>Jadwal:</i> <code>${formatIntervalsText(reminderIntervals)} (07:00 WIB)</code>`,
    { parse_mode: 'HTML' }
  ).catch(() => {});

  // 7. Langkah 6: Estimasi Biaya / Anggaran (Opsional)
  let estimatedCost = 0;
  const skipCostKeyboard = new InlineKeyboard()
    .text('⏩ Lewati Biaya (Rp 0)', 'wizard_skip_cost')
    .row()
    .text('❌ Batalkan', 'wizard_cancel');

  const costPromptMsg = await ctx.reply(
    `💵 <b>Langkah 6 dari 7: Estimasi Biaya / Dana (Opsional)</b>\n\nKetikkan perkiraan nominal biaya (misal: <code>150000</code>, <code>2500000</code>) untuk membantu menyiapkan dana saat jatuh tempo.\nAtau tekan tombol di bawah untuk melewati:`,
    { parse_mode: 'HTML', reply_markup: skipCostKeyboard }
  );

  const costResponse = await conversation.waitFor(['message:text', 'callback_query:data']);

  if (costResponse.callbackQuery) {
    await costResponse.answerCallbackQuery();
    if (costResponse.callbackQuery.data === 'wizard_cancel') {
      await ctx.api.editMessageText(
        chatId,
        costPromptMsg.message_id,
        '💵 <b>Langkah 6 dari 7: Estimasi Biaya / Dana</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
        { parse_mode: 'HTML' }
      ).catch(() => {});
      return;
    }
    // skip cost
  } else if (costResponse.message?.text) {
    if (isCancelInput(costResponse.message.text)) {
      await ctx.api.editMessageText(
        chatId,
        costPromptMsg.message_id,
        '💵 <b>Langkah 6 dari 7: Estimasi Biaya / Dana</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
        { parse_mode: 'HTML' }
      ).catch(() => {});
      return;
    }
    const rawNumber = costResponse.message.text.replace(/[^0-9]/g, '');
    if (rawNumber) {
      estimatedCost = parseInt(rawNumber, 10);
    }
  }

  const costDisplay = estimatedCost > 0
    ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(estimatedCost)
    : 'Rp 0 (Dilewati)';

  // Update pesan prompt langkah 6 dengan biaya yang diinput
  await ctx.api.editMessageText(
    chatId,
    costPromptMsg.message_id,
    `💵 <b>Langkah 6 dari 7: Estimasi Biaya / Dana</b>\n\n✅ <i>Estimasi biaya:</i> <b>${costDisplay}</b>`,
    { parse_mode: 'HTML' }
  ).catch(() => {});

  // 8. Langkah 7: Catatan Tambahan (Opsional) atau Foto
  const skipNotesKeyboard = new InlineKeyboard()
    .text('⏩ Lewati Catatan & Simpan', 'wizard_skip_notes')
    .row()
    .text('❌ Batalkan', 'wizard_cancel');

  const notesPrompt = isBirthday
    ? `🎁 <b>Langkah 7 dari 7: Ide Kado / Catatan (Opsional)</b>\n\nKetikkan ide kado, ukuran baju/sepatu, wishlist, atau foto kenangan.\nAtau tekan tombol di bawah untuk melewati:`
    : `📝 <b>Langkah 7 dari 7: Catatan Tambahan (Opsional)</b>\n\nKetikkan catatan tambahan (nomor seri, tempat servis, no. polis) atau kirim foto nota/kartu garansi.\nAtau tekan tombol di bawah untuk melewati:`;

  const notesPromptMsg = await ctx.reply(notesPrompt, { parse_mode: 'HTML', reply_markup: skipNotesKeyboard });

  const notesResponse = await conversation.waitFor(['message:text', 'message:photo', 'callback_query:data']);

  let notes: string | undefined;
  let photoFileId: string | undefined;

  if (notesResponse.callbackQuery) {
    await notesResponse.answerCallbackQuery();
    if (notesResponse.callbackQuery.data === 'wizard_cancel') {
      await ctx.api.editMessageText(
        chatId,
        notesPromptMsg.message_id,
        '📝 <b>Langkah 7 dari 7: Catatan Tambahan</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
        { parse_mode: 'HTML' }
      ).catch(() => {});
      return;
    }
    // skip notes
  } else if (notesResponse.message?.text) {
    if (isCancelInput(notesResponse.message.text)) {
      await ctx.api.editMessageText(
        chatId,
        notesPromptMsg.message_id,
        '📝 <b>Langkah 7 dari 7: Catatan Tambahan</b>\n\n❌ <i>Penambahan pengingat dibatalkan.</i>',
        { parse_mode: 'HTML' }
      ).catch(() => {});
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

  const noteDisplay = notes ? escapeHTML(notes) : (photoFileId ? '📷 <i>Foto lampiran tersimpan</i>' : '<i>(Dilewati)</i>');

  // Update pesan prompt langkah 7 dengan catatan yang diinput
  await ctx.api.editMessageText(
    chatId,
    notesPromptMsg.message_id,
    `📝 <b>Langkah 7 dari 7: Catatan Tambahan</b>\n\n✅ <i>Catatan:</i> ${noteDisplay}`,
    { parse_mode: 'HTML' }
  ).catch(() => {});

  // 9. Simpan ke Database Supabase
  const createdItem = await conversation.external(() =>
    createReminder({
      userId: access.user.id,
      categoryId,
      title,
      notes,
      dueDate: validDateStr!,
      estimatedCost,
      reminderIntervals,
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

  successMsg += `🔔 Jadwal Pengingat: <code>${formatIntervalsText(createdItem.reminder_intervals || reminderIntervals)} (07:00 WIB)</code>\n`;

  if (estimatedCost > 0) {
    const costFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(estimatedCost);
    successMsg += `💵 Estimasi Biaya: <b>${costFormatted}</b>\n`;
  }

  if (createdItem.notes) {
    successMsg += `📝 Catatan: <code>${escapeHTML(createdItem.notes)}</code>\n`;
  }

  if (isBirthday) {
    successMsg += `\n🎂 <i>Pengingat ini berulang otomatis setiap tahun!</i>`;
  } else {
    successMsg += `\n⏰ <i>Bot otomatis mengingatkan Anda sesuai jadwal di atas!</i>`;
  }

  const gcalUrl = generateGoogleCalendarUrl(createdItem.title, createdItem.due_date, createdItem.notes);
  const doneKeyboard = new InlineKeyboard()
    .url('📅 Simpan ke Google Calendar', gcalUrl)
    .row()
    .text('📋 Lihat Semua Reminder', 'action:list_reminders')
    .text('➕ Tambah Lagi', 'action:add_reminder');

  await ctx.reply(successMsg, { parse_mode: 'HTML', reply_markup: doneKeyboard });
}
