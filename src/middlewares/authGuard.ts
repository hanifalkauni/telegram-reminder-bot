import { Context, NextFunction } from 'grammy';
import { supabase } from '../db/supabase.js';
import { env } from '../config/env.js';

/**
 * Middleware untuk memverifikasi hak akses Admin di Admin Bot
 */
export async function requireAdmin(ctx: Context, next: NextFunction): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  // Cek database
  const { data: user, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('telegram_id', telegramId)
    .single();

  if (error || !user || !user.is_admin) {
    await ctx.reply(
      '⛔ <b>Akses Ditolak!</b>\n\nAnda tidak memiliki otorisasi untuk mengakses panel Admin ini.\nJika Anda adalah owner, masukkan <code>ADMIN_MASTER_CODE</code> untuk mendapatkan akses.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  return next();
}
