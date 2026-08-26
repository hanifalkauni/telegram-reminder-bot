import { userBot } from '../bot-user/index.js';

console.log('🤖 Starting TempoGuard User Bot in Long-Polling Dev Mode...');

userBot.start({
  onStart: (botInfo) => {
    console.log(`✅ User Bot @${botInfo.username} is running and listening for messages!`);
  },
});
