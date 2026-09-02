import { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import { UserBotContext } from './addReminderWizard.js';
import { checkUserAccess } from '../../services/accessControl.js';
import { getReminderById, updateReminderItem } from '../../services/reminderService.js';
import { parseDateInput, formatDateID, getNextUpcomingOccurrence } from '../../utils/dateHelper.js';
import { escapeHTML, formatReminderItemCard } from '../../utils/telegramHelper.js';

export type EditReminderConversation = Conversation<UserBotContext>;

function isCancelInput(text?: string): boolean {
  if (!text) return false;
  const clean = text.trim().toLowerCase();
  return clean === '/cancel' || clean === '/batal' || clean === 'batal' || clean === '/start' || clean === '/menu' || clean === '/help' || clean === '/list';
}

/**
 * Interactive Wizard untuk mengedit salah satu field dari reminder item
 */
export async function editReminderWizard(
  conversation: EditReminderConversation,
  ctx: UserBotContext
): Promise<void> {
  const telegramId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!telegramId || !chatId) return;

  const editData = ctx.session?.editingReminder;
  if (!editData || !editData.reminderId || !editData.field) {
    await ctx.reply('⚠️ Sesi edit tidak ditemukan. Silakan buka menu reminder kembali.');
    return;
  }

  const { reminderId, field } = editData;
  const access = await conversation.external(() => checkUserAccess(telegramId));
  const item = await conversation.external(() => getReminderById(reminderId, access.user.id));

  if (!item) {
    await ctx.reply('⚠️ Item pengingat tidak ditemukan.');
    return;
  }

  const cancelKeyboard = new InlineKeyboard().text('❌ Batalkan Edit', 'edit_cancel');

  // =========================================================================
  // 1. EDIT JUDUL
  // =========================================================================
  if (field === 'title') {
    const promptMsg = await ctx.reply(
      `🏷️ <b>Edit Nama / Judul Pengingat</b>\n\n` +
        `Judul Saat Ini: <b>${escapeHTML(item.title)}</b>\n\n` +
        `<i>Ketikkan nama/judul baru di bawah ini:</i>`,
      { parse_mode: 'HTML', reply_markup: cancelKeyboard }
    );

    const response = await conversation.waitFor(['message:text', 'callback_query:data']);
    if (response.callbackQuery) {
      await response.answerCallbackQuery();
      await ctx.api.editMessageText(chatId, promptMsg.message_id, '❌ <i>Edit judul dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
      return;
    }

    const newTitle = response.message?.text?.trim();
    if (!newTitle || isCancelInput(newTitle)) {
      await ctx.api.editMessageText(chatId, promptMsg.message_id, '❌ <i>Edit judul dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
      return;
    }

    const updated = await conversation.external(() => updateReminderItem(reminderId, access.user.id, { title: newTitle }));
    await ctx.api.editMessageReplyMarkup(chatId, promptMsg.message_id, { reply_markup: undefined }).catch(() => {});
    if (updated) {
      await ctx.reply(`✅ <b>Judul berhasil diubah menjadi:</b> <b>${escapeHTML(updated.title)}</b>`, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('🔍 Lihat Detail Item', `action:view:${updated.id}`).text('📋 Daftar', 'action:list_reminders'),
      });
    }
    return;
  }

  // =========================================================================
  // 2. EDIT TANGGAL
  // =========================================================================
  if (field === 'date') {
    const promptMsg = await ctx.reply(
      `📅 <b>Edit Tanggal Jatuh Tempo</b>\n\n` +
        `Item: <b>${escapeHTML(item.title)}</b>\n` +
        `Tanggal Saat Ini: <b>${formatDateID(item.due_date)}</b>\n\n` +
        `<i>Ketikkan tanggal baru (Format: <code>YYYY-MM-DD</code>, <code>DD/MM/YYYY</code>, atau <code>1 Juni 1996</code>):</i>`,
      { parse_mode: 'HTML', reply_markup: cancelKeyboard }
    );

    let validDateStr: string | null = null;
    while (!validDateStr) {
      const response = await conversation.waitFor(['message:text', 'callback_query:data']);
      if (response.callbackQuery) {
        await response.answerCallbackQuery();
        await ctx.api.editMessageText(chatId, promptMsg.message_id, '❌ <i>Edit tanggal dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
        return;
      }

      const text = response.message?.text?.trim() || '';
      if (isCancelInput(text)) {
        await ctx.api.editMessageText(chatId, promptMsg.message_id, '❌ <i>Edit tanggal dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
        return;
      }

      const parsed = parseDateInput(text);
      if (parsed) {
        const isBirthday = item.category?.code === 'birthday';
        validDateStr = isBirthday ? getNextUpcomingOccurrence(parsed) : parsed;
      } else {
        await ctx.reply('⚠️ <b>Format tanggal tidak valid.</b> Silakan ketik ulang (contoh: <code>2026-12-31</code> atau <code>31/12/2026</code>):', {
          parse_mode: 'HTML',
          reply_markup: cancelKeyboard,
        });
      }
    }

    const updated = await conversation.external(() => updateReminderItem(reminderId, access.user.id, { dueDate: validDateStr! }));
    await ctx.api.editMessageReplyMarkup(chatId, promptMsg.message_id, { reply_markup: undefined }).catch(() => {});
    if (updated) {
      await ctx.reply(`✅ <b>Tanggal jatuh tempo berhasil diubah menjadi:</b> <b>${formatDateID(updated.due_date)}</b>`, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('🔍 Lihat Detail Item', `action:view:${updated.id}`).text('📋 Daftar', 'action:list_reminders'),
      });
    }
    return;
  }

  // =========================================================================
  // 3. EDIT ESTIMASI BIAYA
  // =========================================================================
  if (field === 'cost') {
    const costKeyboard = new InlineKeyboard()
      .text('⏩ Hapus Biaya (Rp 0)', 'edit_zero_cost')
      .row()
      .text('❌ Batalkan', 'edit_cancel');

    const promptMsg = await ctx.reply(
      `💵 <b>Edit Estimasi Biaya / Dana</b>\n\n` +
        `Item: <b>${escapeHTML(item.title)}</b>\n` +
        `Biaya Saat Ini: <b>${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(item.estimated_cost || 0)}</b>\n\n` +
        `<i>Ketikkan nominal angka baru (misal: <code>250000</code>) atau tekan tombol hapus biaya:</i>`,
      { parse_mode: 'HTML', reply_markup: costKeyboard }
    );

    const response = await conversation.waitFor(['message:text', 'callback_query:data']);
    let newCost = 0;

    if (response.callbackQuery) {
      await response.answerCallbackQuery();
      if (response.callbackQuery.data === 'edit_cancel') {
        await ctx.api.editMessageText(chatId, promptMsg.message_id, '❌ <i>Edit biaya dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
        return;
      }
      // zero cost
      newCost = 0;
    } else if (response.message?.text) {
      const text = response.message.text.trim();
      if (isCancelInput(text)) {
        await ctx.api.editMessageText(chatId, promptMsg.message_id, '❌ <i>Edit biaya dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
        return;
      }
      const rawNumber = text.replace(/[^0-9]/g, '');
      if (rawNumber) {
        newCost = parseInt(rawNumber, 10);
      }
    }

    const updated = await conversation.external(() => updateReminderItem(reminderId, access.user.id, { estimatedCost: newCost }));
    await ctx.api.editMessageReplyMarkup(chatId, promptMsg.message_id, { reply_markup: undefined }).catch(() => {});
    if (updated) {
      const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(newCost);
      await ctx.reply(`✅ <b>Estimasi biaya berhasil diubah menjadi:</b> <b>${formatted}</b>`, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('🔍 Lihat Detail Item', `action:view:${updated.id}`).text('📋 Daftar', 'action:list_reminders'),
      });
    }
    return;
  }

  // =========================================================================
  // 4. EDIT INTERVAL PENGINGAT (H-)
  // =========================================================================
  if (field === 'intervals') {
    const defaultCatIntervals = item.category?.default_reminder_days || [30, 14, 7, 3, 1, 0];
    const formatIntervalsText = (arr: number[]) =>
      arr
        .slice()
        .sort((a, b) => b - a)
        .map((d) => (d === 0 ? 'Hari H' : `H-${d}`))
        .join(', ');

    const intKeyboard = new InlineKeyboard()
      .text(`✅ Standar: ${formatIntervalsText(defaultCatIntervals).substring(0, 24)}...`, 'eint:DEFAULT').row()
      .text('⚡ Ringkas (H-7, H-1, Hari H)', 'eint:COMPACT')
      .text('🎯 Hari H Saja (0)', 'eint:ONLY_DUE').row()
      .text('✏️ Kustom H- Sendiri', 'eint:CUSTOM').row()
      .text('❌ Batalkan Edit', 'edit_cancel');

    const promptMsg = await ctx.reply(
      `🔔 <b>Edit Jadwal Pengingat (Interval Alert)</b>\n\n` +
        `Item: <b>${escapeHTML(item.title)}</b>\n` +
        `Jadwal Saat Ini: <code>${formatIntervalsText(item.reminder_intervals || [])} (07:00 WIB)</code>\n\n` +
        `<i>Silakan pilih jadwal baru:</i>`,
      { parse_mode: 'HTML', reply_markup: intKeyboard }
    );

    const response = await conversation.waitFor(['callback_query:data', 'message:text']);
    let newIntervals: number[] = defaultCatIntervals;
    let isCustom = false;

    if (response.callbackQuery) {
      await response.answerCallbackQuery();
      if (response.callbackQuery.data === 'edit_cancel') {
        await ctx.api.editMessageText(chatId, promptMsg.message_id, '❌ <i>Edit jadwal pengingat dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
        return;
      }
      const data = response.callbackQuery.data;
      if (data === 'eint:DEFAULT') newIntervals = defaultCatIntervals;
      else if (data === 'eint:COMPACT') newIntervals = [7, 1, 0];
      else if (data === 'eint:ONLY_DUE') newIntervals = [0];
      else if (data === 'eint:CUSTOM') isCustom = true;
    } else if (response.message?.text && isCancelInput(response.message.text)) {
      await ctx.api.editMessageText(chatId, promptMsg.message_id, '❌ <i>Edit jadwal pengingat dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
      return;
    }

    if (isCustom) {
      const customPrompt = await ctx.reply(
        `✏️ <b>Kustom Hari Pengingat (H-)</b>\n\nKetikkan angka hari H- baru (dipisahkan koma atau spasi):\n<i>Contoh: <code>60, 30, 14, 7, 1, 0</code></i>`,
        { parse_mode: 'HTML', reply_markup: cancelKeyboard }
      );

      const customResponse = await conversation.waitFor(['message:text', 'callback_query:data']);
      if (customResponse.callbackQuery) {
        await customResponse.answerCallbackQuery();
        await ctx.api.editMessageText(chatId, customPrompt.message_id, '❌ <i>Edit dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
        return;
      }

      if (customResponse.message?.text) {
        if (isCancelInput(customResponse.message.text)) {
          await ctx.api.editMessageText(chatId, customPrompt.message_id, '❌ <i>Edit dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
          return;
        }

        const rawText = customResponse.message.text;
        const parsedDays = rawText
          .split(/[,|\s]+/)
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n) && n >= 0 && n <= 365);

        if (parsedDays.length > 0) {
          newIntervals = Array.from(new Set(parsedDays)).sort((a, b) => b - a);
        }
        await ctx.api.editMessageReplyMarkup(chatId, customPrompt.message_id, { reply_markup: undefined }).catch(() => {});
      }
    }

    const updated = await conversation.external(() => updateReminderItem(reminderId, access.user.id, { reminderIntervals: newIntervals }));
    await ctx.api.editMessageReplyMarkup(chatId, promptMsg.message_id, { reply_markup: undefined }).catch(() => {});
    if (updated) {
      await ctx.reply(`✅ <b>Jadwal pengingat berhasil diubah:</b>\n<code>${formatIntervalsText(newIntervals)} (07:00 WIB)</code>`, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('🔍 Lihat Detail Item', `action:view:${updated.id}`).text('📋 Daftar', 'action:list_reminders'),
      });
    }
    return;
  }

  // =========================================================================
  // 5. EDIT CATATAN / FOTO
  // =========================================================================
  if (field === 'notes') {
    const notesKeyboard = new InlineKeyboard()
      .text('⏩ Hapus Catatan', 'edit_delete_notes')
      .row()
      .text('❌ Batalkan', 'edit_cancel');

    const promptMsg = await ctx.reply(
      `📝 <b>Edit Catatan / Foto Lampiran</b>\n\n` +
        `Item: <b>${escapeHTML(item.title)}</b>\n` +
        `Catatan Saat Ini: <code>${item.notes ? escapeHTML(item.notes) : '(Tidak ada)'}</code>\n\n` +
        `<i>Ketikkan teks catatan baru atau kirim foto nota/kartu garansi:</i>`,
      { parse_mode: 'HTML', reply_markup: notesKeyboard }
    );

    const response = await conversation.waitFor(['message:text', 'message:photo', 'callback_query:data']);
    let newNotes: string | null = null;
    let newPhotoId: string | null = item.photo_file_id || null;

    if (response.callbackQuery) {
      await response.answerCallbackQuery();
      if (response.callbackQuery.data === 'edit_cancel') {
        await ctx.api.editMessageText(chatId, promptMsg.message_id, '❌ <i>Edit catatan dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
        return;
      }
      newNotes = null;
      newPhotoId = null;
    } else if (response.message?.text) {
      const text = response.message.text.trim();
      if (isCancelInput(text)) {
        await ctx.api.editMessageText(chatId, promptMsg.message_id, '❌ <i>Edit catatan dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
        return;
      }
      newNotes = text;
    } else if (response.message?.photo) {
      const photos = response.message.photo;
      newPhotoId = photos[photos.length - 1].file_id;
      if (response.message.caption) {
        newNotes = response.message.caption.trim();
      }
    }

    const updated = await conversation.external(() =>
      updateReminderItem(reminderId, access.user.id, { notes: newNotes, photoFileId: newPhotoId })
    );
    await ctx.api.editMessageReplyMarkup(chatId, promptMsg.message_id, { reply_markup: undefined }).catch(() => {});
    if (updated) {
      await ctx.reply(`✅ <b>Catatan berhasil diperbarui!</b>\n\nCatatan: <code>${newNotes ? escapeHTML(newNotes) : '(Kosong)'}</code>`, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('🔍 Lihat Detail Item', `action:view:${updated.id}`).text('📋 Daftar', 'action:list_reminders'),
      });
    }
    return;
  }

  // =========================================================================
  // 6. EDIT SIKLUS PERULANGAN
  // =========================================================================
  if (field === 'cycle') {
    const cycleKeyboard = new InlineKeyboard()
      .text('❌ Sekali Saja (Tanpa Perulangan)', 'erec:NONE').row()
      .text('📅 Tiap 1 Bulan', 'erec:MONTHLY')
      .text('🛠️ Tiap 3 Bulan', 'erec:QUARTERLY').row()
      .text('⚙️ Tiap 6 Bulan', 'erec:SEMI_ANNUAL')
      .text('🔄 Tiap 1 Tahun Masehi', 'erec:YEARLY').row()
      .text('🌙 Tiap 1 Tahun Hijriyah', 'erec:HIJRI_YEARLY').row()
      .text('🪪 Tiap 5 Tahun', 'erec:FIVE_YEARS').row()
      .text('❌ Batalkan Edit', 'edit_cancel');

    const promptMsg = await ctx.reply(
      `🔄 <b>Edit Siklus Perulangan</b>\n\n` +
        `Item: <b>${escapeHTML(item.title)}</b>\n` +
        `Siklus Saat Ini: <b>${item.recurring_type || 'NONE'}</b>\n\n` +
        `<i>Silakan pilih siklus perulangan baru:</i>`,
      { parse_mode: 'HTML', reply_markup: cycleKeyboard }
    );

    const response = await conversation.waitFor(['callback_query:data', 'message:text']);
    let newRecType: string = item.recurring_type || 'NONE';

    if (response.callbackQuery) {
      await response.answerCallbackQuery();
      if (response.callbackQuery.data === 'edit_cancel') {
        await ctx.api.editMessageText(chatId, promptMsg.message_id, '❌ <i>Edit siklus perulangan dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
        return;
      }
      if (response.callbackQuery.data.startsWith('erec:')) {
        newRecType = response.callbackQuery.data.split(':')[1];
      }
    } else if (response.message?.text && isCancelInput(response.message.text)) {
      await ctx.api.editMessageText(chatId, promptMsg.message_id, '❌ <i>Edit siklus perulangan dibatalkan.</i>', { parse_mode: 'HTML' }).catch(() => {});
      return;
    }

    const isRecurring = newRecType !== 'NONE';
    const updated = await conversation.external(() =>
      updateReminderItem(reminderId, access.user.id, { isRecurring, recurringType: newRecType })
    );

    const recLabelMap: Record<string, string> = {
      NONE: 'Sekali Saja',
      MONTHLY: 'Tiap 1 Bulan',
      QUARTERLY: 'Tiap 3 Bulan',
      SEMI_ANNUAL: 'Tiap 6 Bulan',
      YEARLY: 'Tiap 1 Tahun Masehi',
      FIVE_YEARS: 'Tiap 5 Tahun',
      HIJRI_YEARLY: 'Tiap 1 Tahun Hijriyah (~354 Hari)',
    };

    await ctx.api.editMessageReplyMarkup(chatId, promptMsg.message_id, { reply_markup: undefined }).catch(() => {});
    if (updated) {
      await ctx.reply(`✅ <b>Siklus perulangan berhasil diubah menjadi:</b> <b>${recLabelMap[newRecType] || newRecType}</b>`, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('🔍 Lihat Detail Item', `action:view:${updated.id}`).text('📋 Daftar', 'action:list_reminders'),
      });
    }
    return;
  }
}
