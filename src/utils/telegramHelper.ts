import { InlineKeyboard } from 'grammy';
import { ReminderItemRecord } from '../types/database.js';
import { formatDateID, getDaysDifference, getUrgencyBadge } from './dateHelper.js';

/**
 * Escape karakter spesial untuk format HTML Telegram
 */
export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format string item reminder ke dalam tampilan rapi HTML
 */
export function formatReminderItemCard(item: ReminderItemRecord): string {
  const daysLeft = getDaysDifference(item.due_date);
  const urgency = getUrgencyBadge(daysLeft);
  const icon = item.category?.icon || '📌';
  const categoryName = item.category?.name || 'Kategori Umum';

  let msg = `<b>${icon} ${escapeHTML(item.title)}</b>\n`;
  msg += `📂 Kategori: <i>${escapeHTML(categoryName)}</i>\n`;
  msg += `📅 Jatuh Tempo: <b>${formatDateID(item.due_date)}</b>\n`;
  msg += `⏳ Status: ${urgency.badge} <b>${urgency.status}</b>\n`;
  
  if (item.notes) {
    msg += `📝 Catatan: <code>${escapeHTML(item.notes)}</code>\n`;
  }
  if (item.photo_file_id) {
    msg += `📸 <i>Memiliki lampiran foto/nota</i>\n`;
  }

  return msg;
}

/**
 * Keyboard navigasi menu utama
 */
export function getMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('➕ Tambah Reminder', 'action:add_reminder')
    .text('📋 Daftar Reminder', 'action:list_reminders')
    .row()
    .text('💎 Berlangganan (Pro)', 'action:subscribe')
    .text('👤 Profil & Kuota', 'action:profile')
    .row()
    .text('❓ Panduan (/help)', 'action:help')
    .text('💬 Bantuan (/contact)', 'action:contact');
}
