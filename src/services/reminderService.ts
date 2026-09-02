import { supabase } from '../db/supabase.js';
import { ReminderItemRecord, CategoryRecord, RecurringType } from '../types/database.js';
import { addMonthsToDate } from '../utils/dateHelper.js';

export interface CreateReminderDTO {
  userId: number;
  categoryId?: number;
  title: string;
  notes?: string;
  dueDate: string; // YYYY-MM-DD
  estimatedCost?: number;
  reminderIntervals?: number[];
  photoFileId?: string;
  isRecurring?: boolean;
  recurringType?: RecurringType;
}

/**
 * Mengambil semua kategori aktif
 */
export async function getActiveCategories(): Promise<CategoryRecord[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('id', { ascending: true });

  if (error || !data) return [];
  return data as CategoryRecord[];
}

/**
 * Membuat reminder baru
 */
export async function createReminder(dto: CreateReminderDTO): Promise<ReminderItemRecord> {
  const recurringType = dto.recurringType || (dto.isRecurring ? 'YEARLY' : 'NONE');
  const isRecurring = recurringType !== 'NONE';

  const { data, error } = await supabase
    .from('reminder_items')
    .insert({
      user_id: dto.userId,
      category_id: dto.categoryId || null,
      title: dto.title,
      notes: dto.notes || null,
      due_date: dto.dueDate,
      estimated_cost: dto.estimatedCost || 0,
      reminder_intervals: dto.reminderIntervals || [30, 7, 3, 1, 0],
      photo_file_id: dto.photoFileId || null,
      is_recurring: isRecurring,
      recurring_type: recurringType,
      is_completed: false,
    })
    .select('*, category:categories(*)')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create reminder: ${error?.message}`);
  }

  return data as ReminderItemRecord;
}

/**
 * Mengambil daftar reminder aktif pengguna diurutkan dari jatuh tempo terdekat
 */
export async function getUserReminders(userId: number, limit = 50): Promise<ReminderItemRecord[]> {
  const { data, error } = await supabase
    .from('reminder_items')
    .select('*, category:categories(*)')
    .eq('user_id', userId)
    .eq('is_completed', false)
    .order('due_date', { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data as ReminderItemRecord[];
}

/**
 * Mengambil detail 1 reminder berdasarkan ID
 */
export async function getReminderById(reminderId: number, userId?: number): Promise<ReminderItemRecord | null> {
  let query = supabase
    .from('reminder_items')
    .select('*, category:categories(*)')
    .eq('id', reminderId);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as ReminderItemRecord;
}

/**
 * Menghapus reminder
 */
export async function deleteReminder(reminderId: number, userId: number): Promise<boolean> {
  const { error } = await supabase
    .from('reminder_items')
    .delete()
    .eq('id', reminderId)
    .eq('user_id', userId);

  return !error;
}

/**
 * Memperpanjang jatuh tempo item berdasarkan bulan (Quick Renew: +1 bln, +3 bln, +6 bln, +12 bln)
 */
export async function renewReminderByMonths(
  reminderId: number,
  userId: number,
  monthsToAdd: number
): Promise<ReminderItemRecord | null> {
  const existing = await getReminderById(reminderId, userId);
  if (!existing) return null;

  const newDateStr = addMonthsToDate(existing.due_date, monthsToAdd);

  const { data, error } = await supabase
    .from('reminder_items')
    .update({
      due_date: newDateStr,
      is_completed: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reminderId)
    .eq('user_id', userId)
    .select('*, category:categories(*)')
    .single();

  if (error || !data) return null;
  return data as ReminderItemRecord;
}

/**
 * Memperpanjang jatuh tempo item (Renewal, cth: STNK bayar -> +1 tahun)
 */
export async function renewReminderDate(reminderId: number, userId: number, additionalYears = 1): Promise<ReminderItemRecord | null> {
  return renewReminderByMonths(reminderId, userId, additionalYears * 12);
}

/**
 * Snooze / Tunda pengingat item (Tambah beberapa hari)
 */
export async function snoozeReminder(reminderId: number, userId: number, daysToAdd = 7): Promise<ReminderItemRecord | null> {
  const existing = await getReminderById(reminderId, userId);
  if (!existing) return null;

  const currentDue = new Date(existing.due_date);
  currentDue.setDate(currentDue.getDate() + daysToAdd);
  const newDateStr = currentDue.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('reminder_items')
    .update({
      due_date: newDateStr,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reminderId)
    .eq('user_id', userId)
    .select('*, category:categories(*)')
    .single();

  if (error || !data) return null;
  return data as ReminderItemRecord;
}

/**
 * Update field parsial item reminder (Edit judul, tanggal, biaya, intervals, catatan, foto, recurring)
 */
export async function updateReminderItem(
  reminderId: number,
  userId: number,
  updates: {
    title?: string;
    dueDate?: string;
    notes?: string | null;
    estimatedCost?: number;
    reminderIntervals?: number[];
    photoFileId?: string | null;
    isRecurring?: boolean;
    recurringType?: string;
  }
): Promise<ReminderItemRecord | null> {
  const dbUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.estimatedCost !== undefined) dbUpdates.estimated_cost = updates.estimatedCost;
  if (updates.reminderIntervals !== undefined) dbUpdates.reminder_intervals = updates.reminderIntervals;
  if (updates.photoFileId !== undefined) dbUpdates.photo_file_id = updates.photoFileId;
  if (updates.isRecurring !== undefined) dbUpdates.is_recurring = updates.isRecurring;
  if (updates.recurringType !== undefined) dbUpdates.recurring_type = updates.recurringType;

  const { data, error } = await supabase
    .from('reminder_items')
    .update(dbUpdates)
    .eq('id', reminderId)
    .eq('user_id', userId)
    .select('*, category:categories(*)')
    .single();

  if (error || !data) return null;
  return data as ReminderItemRecord;
}

/**
 * Mengambil agenda reminder untuk bulan tertentu (Monthly Agenda) beserta total estimasi biayanya
 */
export async function getMonthlyAgenda(
  userId: number,
  year?: number,
  month?: number
): Promise<{ items: ReminderItemRecord[]; totalEstimatedCost: number; monthName: string; yearNum: number }> {
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month !== undefined ? month : now.getMonth(); // 0-indexed

  // Format awal dan akhir bulan (YYYY-MM-DD)
  const startDay = new Date(targetYear, targetMonth, 1);
  const endDay = new Date(targetYear, targetMonth + 1, 0);

  const startDateStr = startDay.toISOString().split('T')[0];
  const endDateStr = endDay.toISOString().split('T')[0];

  const MONTHS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const { data, error } = await supabase
    .from('reminder_items')
    .select('*, category:categories(*)')
    .eq('user_id', userId)
    .eq('is_completed', false)
    .gte('due_date', startDateStr)
    .lte('due_date', endDateStr)
    .order('due_date', { ascending: true });

  if (error || !data) {
    return {
      items: [],
      totalEstimatedCost: 0,
      monthName: MONTHS[targetMonth],
      yearNum: targetYear,
    };
  }

  const items = data as ReminderItemRecord[];
  const totalEstimatedCost = items.reduce((acc, item) => acc + (Number(item.estimated_cost) || 0), 0);

  return {
    items,
    totalEstimatedCost,
    monthName: MONTHS[targetMonth],
    yearNum: targetYear,
  };
}
