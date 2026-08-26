import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  BOT_TOKEN_USER: z.string().min(1, 'BOT_TOKEN_USER is required'),
  BOT_TOKEN_ADMIN: z.string().min(1, 'BOT_TOKEN_ADMIN is required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  ADMIN_MASTER_CODE: z.string().default('ADMINMASTER12345'),
  TELEGRAM_SECRET_TOKEN: z.string().default('tempo_guard_secret_token'),
  CRON_SECRET: z.string().default('tempo_guard_cron_secret'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    // In production or development, don't crash prematurely if in testing/dev with defaults
    return process.env as unknown as z.infer<typeof envSchema>;
  }
  return result.data;
};

export const env = parseEnv();
