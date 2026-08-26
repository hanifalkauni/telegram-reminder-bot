import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { env } from '../config/env.js';
import { UserBotContext, addReminderWizard } from './conversations/addReminderWizard.js';
import { generalRateLimiter } from '../middlewares/rateLimiter.js';
import { registerUserCommands } from './commands/index.js';
import { registerUserHandlers } from './handlers/index.js';

import { notifyAdminsOnError } from '../services/errorAlertService.js';

export function createUserBot(): Bot<UserBotContext> {
  const bot = new Bot<UserBotContext>(env.BOT_TOKEN_USER);

  // 1. Session & Storage
  bot.use(
    session({
      initial: () => ({}),
    })
  );

  // 2. Middlewares: Anti-Spam & Rate Limiter
  bot.use(generalRateLimiter);

  // 3. Conversation Plugin & Wizards
  bot.use(conversations());
  bot.use(createConversation(addReminderWizard));

  // 4. Commands & Handlers Registration
  registerUserCommands(bot);
  registerUserHandlers(bot);

  // 5. Global Error Handler (Log & Auto-Notify Admins)
  bot.catch(async (err) => {
    console.error('❌ User Bot Error encountered:', err);
    await notifyAdminsOnError({
      source: 'User Bot (@IngatinBot)',
      error: err.error,
      ctxInfo: {
        userId: err.ctx?.from?.id,
        username: err.ctx?.from?.username,
        messageText: err.ctx?.message?.text || err.ctx?.callbackQuery?.data,
      },
    });
  });

  return bot;
}

export const userBot = createUserBot();
