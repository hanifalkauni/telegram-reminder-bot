import { supabase } from '../db/supabase.js';
import { ReminderItemRecord, CategoryRecord } from '../types/database.js';

export interface CreateReminderDTO {
  userId: number;
  categoryId?: number;
  title: string;
  notes?: string;
  dueDate: string; // YYYY-MM-DD
  reminderIntervals?: number[];
  photoFileId?: string;
  isRecurring?: boolean;
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
  const { data, error } = await supabase
    .from('reminder_items')
    .insert({
      user_id: dto.userId,
      category_id: dto.categoryId || null,
      title: dto.title,
      notes: dto.notes || null,
      due_date: dto.dueDate,
      reminder_intervals: dto.reminderIntervals || [30, 7, 3, 1, 0],
      photo_file_id: dto.photoFileId || null,
      is_recurring: dto.isRecurring || false,
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
 * Memperpanjang jatuh tempo item (Renewal, cth: STNK bayar -> +1 tahun)
 */
export async function renewReminderDate(reminderId: number, userId: number, additionalYears = 1): Promise<ReminderItemRecord | null> {
  const existing = await getReminderById(reminderId, userId);
  if (!existing) return null;

  const currentDue = new Date(existing.due_date);
  currentDue.setFullYear(currentDue.getFullYear() + additionalYears);
  const newDateStr = currentDue.toISOString().split('T')[0];

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
