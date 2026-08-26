import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { env } from '../config/env.js';
import { UserBotContext, addReminderWizard } from './conversations/addReminderWizard.js';
import { generalRateLimiter } from '../middlewares/rateLimiter.js';
import { registerUserCommands } from './commands/index.js';
import { registerUserHandlers } from './handlers/index.js';

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

  // 5. Global Error Handler
  bot.catch((err) => {
    console.error('❌ User Bot Error encountered:', err);
  });

  return bot;
}

export const userBot = createUserBot();
