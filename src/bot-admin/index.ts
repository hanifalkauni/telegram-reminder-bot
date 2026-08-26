import { Bot, Context } from 'grammy';
import { env } from '../config/env.js';
import { requireAdmin } from '../middlewares/authGuard.js';
import { registerAdminCommands } from './commands/index.js';
import { registerAdminHandlers } from './handlers/index.js';

export function createAdminBot(): Bot<Context> {
  const bot = new Bot<Context>(env.BOT_TOKEN_ADMIN);

  // 1. Auth Guard Middleware (Hanya admin yang boleh mengakses command/handler selain pesan master code)
  bot.use(async (ctx, next) => {
    // Jika pesan adalah master admin code, izinkan lewat agar bisa promosi
    if (ctx.message?.text?.trim() === env.ADMIN_MASTER_CODE) {
      return next();
    }
    return requireAdmin(ctx, next);
  });

  // 2. Register Commands & Handlers
  registerAdminCommands(bot);
  registerAdminHandlers(bot);

  // 3. Error Handling
  bot.catch((err) => {
    console.error('❌ Admin Bot Error encountered:', err);
  });

  return bot;
}

export const adminBot = createAdminBot();
