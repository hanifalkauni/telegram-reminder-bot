import { InlineKeyboard } from 'grammy';
import { ReminderItemRecord } from '../types/database.js';
import { formatDateID, getDaysDifference, getUrgencyBadge, formatHijriDate } from './dateHelper.js';
import { RECURRING_LABELS } from '../config/constants.js';

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
 * Generate link 1-klik untuk menambahkan reminder ke Google Calendar
 */
export function generateGoogleCalendarUrl(title: string, dueDateStr: string, notes?: string | null): string {
  const cleanDate = dueDateStr.replace(/-/g, '');
  // Format all-day event: YYYYMMDD/YYYYMMDD
  const dates = `${cleanDate}/${cleanDate}`;
  const details = notes ? `${notes}\n\nPengingat via Ingatin SaaS` : 'Pengingat otomatis via Ingatin Telegram SaaS';
  
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `[Ingatin] ${title}`,
    dates: dates,
    details: details,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Format string item reminder ke dalam tampilan rapi HTML
 */
export function formatReminderItemCard(item: ReminderItemRecord): string {
  const daysLeft = getDaysDifference(item.due_date);
  const urgency = getUrgencyBadge(daysLeft);
  const icon = item.category?.icon || '📌';
  const categoryName = item.category?.name || 'Kategori Umum';
  const hijriStr = formatHijriDate(item.due_date);

  let msg = `<b>${icon} ${escapeHTML(item.title)}</b>\n`;
  msg += `📂 Kategori: <i>${escapeHTML(categoryName)}</i>\n`;
  msg += `📅 Jatuh Tempo: <b>${formatDateID(item.due_date)}</b>\n`;
  if (hijriStr && item.recurring_type === 'HIJRI_YEARLY') {
    msg += `🌙 Kalender Hijriyah: <b>${hijriStr}</b>\n`;
  }
  msg += `⏳ Status: ${urgency.badge} <b>${urgency.status}</b>\n`;
  
  if (item.recurring_type && item.recurring_type !== 'NONE') {
    const recLabel = RECURRING_LABELS[item.recurring_type] || item.recurring_type;
    msg += `🔄 Siklus: <b>${recLabel} (Otomatis)</b>\n`;
  }

  if (item.estimated_cost && Number(item.estimated_cost) > 0) {
    const costFormatted = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(Number(item.estimated_cost));
    msg += `💵 Estimasi Biaya: <b>${costFormatted}</b>\n`;
  }

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
    .text('📅 Agenda Bulan Ini', 'action:monthly_agenda')
    .text('💎 Berlangganan (Pro)', 'action:subscribe')
    .row()
    .text('👤 Profil & Kuota', 'action:profile')
    .text('❓ Panduan (/help)', 'action:help')
    .row()
    .text('💬 Bantuan (/contact)', 'action:contact');
}
