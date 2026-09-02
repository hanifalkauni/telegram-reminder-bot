import { supabase } from '../db/supabase.js';
import {
  SubscriptionPackageRecord,
  PaymentMethodRecord,
  ConfirmationCodeRecord,
  UserRecord
} from '../types/database.js';

/**
 * Ambil paket langganan aktif
 */
export async function getActivePackages(): Promise<SubscriptionPackageRecord[]> {
  const { data, error } = await supabase
    .from('subscription_packages')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error || !data) return [];
  return data as SubscriptionPackageRecord[];
}

/**
 * Ambil metode pembayaran aktif
 */
export async function getActivePaymentMethods(): Promise<PaymentMethodRecord[]> {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('is_active', true)
    .order('id', { ascending: true });

  if (error || !data) return [];
  return data as PaymentMethodRecord[];
}

/**
 * Generate Voucher Activation Code acak 8 karakter
 */
export function generateRandomCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Simpan Voucher Code baru ke database
 */
export async function createConfirmationCode(durationDays: number, createdByUserId?: number): Promise<string> {
  const code = generateRandomCode(8);
  const { error } = await supabase
    .from('confirmation_codes')
    .insert({
      code,
      duration_days: durationDays,
      is_used: false,
      created_by: createdByUserId || null,
    });

  if (error) {
    throw new Error(`Failed to create code: ${error.message}`);
  }

  return code;
}

/**
 * Redeem kode voucher oleh user
 */
export async function redeemCode(
  codeStr: string,
  userId: number
): Promise<{ success: boolean; message: string; durationDays?: number; isExistingCode?: boolean }> {
  const cleanCode = codeStr.trim().toUpperCase();

  const { data: codeRecord, error: findError } = await supabase
    .from('confirmation_codes')
    .select('*')
    .eq('code', cleanCode)
    .maybeSingle();

  if (findError || !codeRecord) {
    return { success: false, message: 'Kode voucher tidak valid atau tidak ditemukan.', isExistingCode: false };
  }

  if (codeRecord.is_used) {
    return { success: false, message: 'Kode voucher ini sudah pernah digunakan sebelumnya.', isExistingCode: true };
  }

  // Hitung masa aktif baru
  const durationDays = codeRecord.duration_days;
  const userUpdate = await extendUserSubscription(userId, durationDays);

  if (!userUpdate) {
    return { success: false, message: 'Gagal mengaktifkan akun. Silakan coba lagi.', isExistingCode: true };
  }

  // Tandai voucher sudah terpakai
  await supabase
    .from('confirmation_codes')
    .update({
      is_used: true,
      used_by: userId,
      used_at: new Date().toISOString(),
    })
    .eq('id', codeRecord.id);

  return {
    success: true,
    message: durationDays === 0 ? 'Akses Seumur Hidup (Lifetime) berhasil aktif!' : `Langganan aktif selama ${durationDays} hari!`,
    durationDays,
    isExistingCode: true,
  };
}

/**
 * Perpanjang masa aktif langganan pengguna
 * durationDays = 0 -> Lifetime (active_until = null)
 */
export async function extendUserSubscription(
  userId: number,
  durationDays: number
): Promise<UserRecord | null> {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !user) return null;

  let newActiveUntil: string | null = null;

  if (durationDays > 0) {
    let baseDate = new Date();
    // Jika user saat ini masih memiliki masa aktif, tambahkan dari active_until sebelumnya
    if (user.is_activated && user.active_until) {
      const currentActiveUntil = new Date(user.active_until);
      if (currentActiveUntil > baseDate) {
        baseDate = currentActiveUntil;
      }
    }
    baseDate.setDate(baseDate.getDate() + durationDays);
    newActiveUntil = baseDate.toISOString();
  }

  const { data: updated, error: updateError } = await supabase
    .from('users')
    .update({
      is_activated: true,
      active_until: newActiveUntil,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single();

  if (updateError || !updated) return null;
  return updated as UserRecord;
}

/**
 * Perpanjang masa aktif user via Telegram ID
 */
export async function extendUserByTelegramId(
  telegramId: number,
  durationDays: number
): Promise<UserRecord | null> {
  const { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();

  if (error || !user) return null;
  return extendUserSubscription(user.id, durationDays);
}
