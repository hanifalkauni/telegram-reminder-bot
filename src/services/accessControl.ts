import { supabase } from '../db/supabase.js';
import { UserRecord, UserAccessState } from '../types/database.js';
import { APP_CONSTANTS } from '../config/constants.js';

export interface UserAccessInfo {
  user: UserRecord;
  state: UserAccessState;
  activeItemCount: number;
  canCreateItem: boolean;
  daysRemaining: number | null;
}

/**
 * Mendapatkan atau membuat user baru secara otomatis (Upsert)
 */
export async function getOrCreateUser(telegramUser: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}): Promise<UserRecord> {
  const { data: existingUser, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramUser.id)
    .maybeSingle();

  if (existingUser && !findError) {
    // Sinkronisasi nama/username jika ada perubahan
    if (
      existingUser.username !== (telegramUser.username || null) ||
      existingUser.first_name !== (telegramUser.first_name || null) ||
      existingUser.last_name !== (telegramUser.last_name || null)
    ) {
      const { data: updated } = await supabase
        .from('users')
        .update({
          username: telegramUser.username || null,
          first_name: telegramUser.first_name || null,
          last_name: telegramUser.last_name || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUser.id)
        .select('*')
        .single();
      if (updated) return updated as UserRecord;
    }
    return existingUser as UserRecord;
  }

  // Buat user baru (Free Trial)
  const { data: newUser, error: insertError } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramUser.id,
      username: telegramUser.username || null,
      first_name: telegramUser.first_name || null,
      last_name: telegramUser.last_name || null,
      is_activated: false,
      is_admin: false,
      active_until: null,
    })
    .select('*')
    .single();

  if (insertError || !newUser) {
    throw new Error(`Failed to create user: ${insertError?.message}`);
  }

  return newUser as UserRecord;
}

/**
 * Validasi status akses dan kuota item pengguna
 */
export async function checkUserAccess(telegramId: number): Promise<UserAccessInfo> {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (error || !user) {
    throw new Error('User not found');
  }

  // Hitung jumlah reminder aktif yang belum selesai
  const { count, error: countError } = await supabase
    .from('reminder_items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_completed', false);

  const activeItemCount = count || 0;
  const now = new Date();

  let state: UserAccessState = 'FREE_TRIAL';
  let daysRemaining: number | null = null;

  if (user.is_admin) {
    state = 'ADMIN';
  } else if (user.is_activated) {
    if (user.active_until === null) {
      // Lifetime subscription
      state = 'ACTIVE_SUBSCRIBER';
    } else {
      const expiryDate = new Date(user.active_until);
      if (expiryDate > now) {
        state = 'ACTIVE_SUBSCRIBER';
        const diffTime = expiryDate.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      } else {
        state = 'EXPIRED';
      }
    }
  } else {
    // Belum pernah aktivasi -> Free Trial
    state = 'FREE_TRIAL';
  }

  // Aturan kemampuan membuat item baru
  let canCreateItem = false;
  if (state === 'ADMIN' || state === 'ACTIVE_SUBSCRIBER') {
    canCreateItem = true;
  } else if (state === 'FREE_TRIAL') {
    canCreateItem = activeItemCount < APP_CONSTANTS.FREE_TRIAL_MAX_ITEMS;
  } else if (state === 'EXPIRED') {
    // Expired tapi item <= 2 bisa dianggap fallback trial jika diizinkan, atau lock total
    canCreateItem = activeItemCount < APP_CONSTANTS.FREE_TRIAL_MAX_ITEMS;
  }

  return {
    user: user as UserRecord,
    state,
    activeItemCount,
    canCreateItem,
    daysRemaining,
  };
}

/**
 * Promosi User Menjadi Admin Seumur Hidup
 */
export async function promoteToAdmin(telegramId: number): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({
      is_admin: true,
      is_activated: true,
      active_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('telegram_id', telegramId);

  return !error;
}
